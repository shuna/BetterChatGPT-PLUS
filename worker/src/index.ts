/**
 * Weavelet Stream Proxy - CloudFlare Worker
 *
 * Optional SSE proxy that sits between the client and LLM APIs.
 * Provides stream recovery when the client disconnects mid-stream.
 *
 * Architecture:
 * 1. Client POSTs to /api/stream with LLM endpoint, headers, and body
 * 2. Worker forwards request to LLM API and streams SSE back to client
 * 3. Each chunk is tagged with a sequential event ID
 * 4. Chunks are buffered in memory during streaming (write-back cache)
 * 5. On stream completion, a single KV write persists the full response
 * 6. If client disconnects, waitUntil() keeps the Worker alive to finish reading
 * 7. Client can recover missed chunks via GET /api/recover/:sessionId
 *
 * Free plan limits:
 * - 100k requests/day, 10ms CPU/request (I/O wait excluded)
 * - KV: 100k reads/day, 1k writes/day → ~1000 sessions/day
 *
 * KV storage format (NDJSON):
 *   Line 1: metadata JSON  {"totalChunks":N,"done":true|false,"error":"..."}
 *   Line 2+: each chunk individually JSON-stringified, one per line
 * This avoids re-serializing the entire chunk array on every write,
 * keeping CPU cost O(N) linear instead of O(N²) quadratic.
 */

export interface Env {
  STREAM_CACHE: KVNamespace;
  PROXY_AUTH_TOKEN: string;
}

interface StreamRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
  sessionId: string;
}

/** KV TTL in seconds - safety net if client never sends ACK */
const KV_EXPIRATION_TTL = 21600; // 6 hours

/** Metadata stored in the first line of the NDJSON KV value */
interface SessionMeta {
  totalChunks: number;
  done: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function withCORS(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return withCORS(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function sseResponse(body: ReadableStream): Response {
  return withCORS(
    new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function authenticate(request: Request, env: Env): boolean {
  // If no PROXY_AUTH_TOKEN is set, allow all requests (open proxy mode)
  if (!env.PROXY_AUTH_TOKEN) return true;

  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  return auth === `Bearer ${env.PROXY_AUTH_TOKEN}`;
}

// ---------------------------------------------------------------------------
// Stream handler - proxies SSE from LLM API with event IDs
// ---------------------------------------------------------------------------

async function handleStream(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let parsed: StreamRequest;
  try {
    parsed = (await request.json()) as StreamRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { endpoint, headers: reqHeaders, body, sessionId } = parsed;

  if (!endpoint || !sessionId) {
    return jsonResponse({ error: 'endpoint and sessionId are required' }, 400);
  }

  // SECURITY NOTE: The client sends LLM API keys inside `headers`.
  // This Worker forwards them verbatim to the LLM endpoint.  The keys
  // transit through Cloudflare's network but are NOT logged or stored
  // by this Worker.  Operators should be aware that deploying this proxy
  // means LLM API keys pass through the Worker.  See README for details.
  let llmRes: Response;
  try {
    llmRes = await fetch(endpoint, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
    });
  } catch (e) {
    return jsonResponse(
      { error: `Failed to reach LLM API: ${(e as Error).message}` },
      502
    );
  }

  if (!llmRes.ok) {
    const errBody = await llmRes.text();
    return withCORS(
      new Response(errBody, {
        status: llmRes.status,
        headers: { 'Content-Type': llmRes.headers.get('Content-Type') || 'text/plain' },
      })
    );
  }

  if (!llmRes.body) {
    return jsonResponse({ error: 'LLM API returned no body' }, 502);
  }

  // Write-back cache: chunks are buffered in memory as pre-serialized NDJSON
  // lines. Only a single KV write happens at stream completion.
  // Each chunk is JSON.stringify'd on arrival (O(chunk_size)), so the final
  // KV write is a plain string concatenation with zero re-serialization.
  let ndjsonBody = '';
  let eventId = 0;
  const { readable, writable } = new TransformStream();

  const processStream = async () => {
    const writer = writable.getWriter();
    const reader = llmRes.body!.getReader();
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    let clientGone = false;
    let streamError: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = dec.decode(value, { stream: true });
        // Serialize once per chunk, reuse for both NDJSON buffer and SSE output
        const serialized = JSON.stringify(text);
        ndjsonBody += serialized + '\n';
        eventId++;

        if (!clientGone) {
          try {
            await writer.write(
              enc.encode(`id: ${eventId}\ndata: ${serialized}\n\n`)
            );
          } catch {
            // Client disconnected - continue reading from LLM to buffer
            clientGone = true;
          }
        }
      }

      // Send completion event with metadata
      const donePayload = JSON.stringify({
        totalChunks: eventId,
        complete: true,
      });
      if (!clientGone) {
        try {
          await writer.write(
            enc.encode(`event: done\ndata: ${donePayload}\n\n`)
          );
        } catch {
          clientGone = true;
        }
      }
    } catch (e) {
      streamError = (e as Error).message;
      const errPayload = JSON.stringify({
        totalChunks: eventId,
        complete: false,
        error: streamError,
      });
      if (!clientGone) {
        try {
          await writer.write(
            enc.encode(`event: error\ndata: ${errPayload}\n\n`)
          );
        } catch {
          clientGone = true;
        }
      }
    } finally {
      try {
        writer.close();
      } catch {
        // Already closed or errored
      }

      // Single KV write at completion (write-back).
      // NDJSON format: metadata line + one pre-serialized chunk per line.
      // No re-serialization needed — just string concatenation.
      if (eventId > 0) {
        const meta: SessionMeta = {
          totalChunks: eventId,
          done: !streamError,
          ...(streamError ? { error: streamError } : {}),
        };
        const kvValue = JSON.stringify(meta) + '\n' + ndjsonBody;
        await env.STREAM_CACHE.put(
          `session:${sessionId}`,
          kvValue,
          { expirationTtl: KV_EXPIRATION_TTL }
        ).catch((e) => {
          console.error(`KV write failed for session:${sessionId}:`, (e as Error).message ?? e);
        });
      }
    }
  };

  // waitUntil ensures the Worker stays alive even after client disconnects
  ctx.waitUntil(processStream());

  return sseResponse(readable);
}

// ---------------------------------------------------------------------------
// Recovery handler - replays missed chunks from KV
// ---------------------------------------------------------------------------

async function handleRecover(
  sessionId: string,
  lastEventId: number,
  env: Env
): Promise<Response> {
  const raw = await env.STREAM_CACHE.get(`session:${sessionId}`);
  if (!raw) {
    return jsonResponse(
      { found: false, message: 'Session not found or expired' },
      404
    );
  }

  // Parse NDJSON: first line is metadata, remaining lines are pre-serialized chunks
  const newlineIdx = raw.indexOf('\n');
  if (newlineIdx === -1) {
    return jsonResponse({ error: 'Corrupt session data' }, 500);
  }

  let meta: SessionMeta;
  try {
    meta = JSON.parse(raw.slice(0, newlineIdx));
  } catch {
    return jsonResponse({ error: 'Corrupt session metadata' }, 500);
  }

  // Each chunk line is already JSON-stringified, ready to use as SSE data
  const chunkLines = raw.slice(newlineIdx + 1);
  const allLines = chunkLines.split('\n');
  // Remove trailing empty element from final newline
  if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
    allLines.pop();
  }
  const missedLines = allLines.slice(lastEventId);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let id = lastEventId;
      for (const line of missedLines) {
        id++;
        // line is already JSON.stringify'd — use directly as SSE data
        controller.enqueue(
          enc.encode(`id: ${id}\ndata: ${line}\n\n`)
        );
      }
      if (meta.done) {
        controller.enqueue(
          enc.encode(
            `event: done\ndata: ${JSON.stringify({
              totalChunks: meta.totalChunks,
              complete: true,
            })}\n\n`
          )
        );
      } else if (meta.error) {
        controller.enqueue(
          enc.encode(
            `event: error\ndata: ${JSON.stringify({
              totalChunks: meta.totalChunks,
              complete: false,
              error: meta.error,
            })}\n\n`
          )
        );
      } else {
        controller.enqueue(
          enc.encode(
            `event: interrupted\ndata: ${JSON.stringify({
              totalChunks: meta.totalChunks,
              complete: false,
            })}\n\n`
          )
        );
      }
      controller.close();
    },
  });

  return sseResponse(stream);
}

// ---------------------------------------------------------------------------
// ACK handler - client confirms full receipt, KV entry is deleted
// ---------------------------------------------------------------------------

async function handleAck(
  sessionId: string,
  env: Env
): Promise<Response> {
  await env.STREAM_CACHE.delete(`session:${sessionId}`);
  return jsonResponse({ deleted: true });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function handleHealth(): Response {
  return jsonResponse({ status: 'ok', version: '0.1.0' });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return withCORS(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);

    // Health check (unauthenticated)
    if (url.pathname === '/health') {
      return handleHealth();
    }

    // Auth check for all /api/* routes
    if (url.pathname.startsWith('/api/')) {
      if (!authenticate(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
    }

    // POST /api/stream - Start proxied SSE stream
    if (url.pathname === '/api/stream' && request.method === 'POST') {
      return handleStream(request, env, ctx);
    }

    // POST /api/ack/:sessionId - Client confirms full receipt, deletes KV
    if (url.pathname.startsWith('/api/ack/') && request.method === 'POST') {
      const sessionId = decodeURIComponent(
        url.pathname.slice('/api/ack/'.length)
      );
      if (!sessionId) {
        return jsonResponse({ error: 'sessionId is required' }, 400);
      }
      return handleAck(sessionId, env);
    }

    // GET /api/recover/:sessionId?lastEventId=N - Recover missed chunks
    if (url.pathname.startsWith('/api/recover/') && request.method === 'GET') {
      const sessionId = decodeURIComponent(
        url.pathname.slice('/api/recover/'.length)
      );
      const lastEventId = parseInt(
        url.searchParams.get('lastEventId') || '0',
        10
      );
      if (!sessionId) {
        return jsonResponse({ error: 'sessionId is required' }, 400);
      }
      return handleRecover(sessionId, lastEventId, env);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
