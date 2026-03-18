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
 * 4. On stream completion, the full response is saved to KV (1 write per session)
 * 5. If client disconnects, waitUntil() keeps the Worker alive to finish reading
 * 6. Client can recover missed chunks via GET /api/recover/:sessionId
 *
 * Free plan limits:
 * - 100k requests/day, 10ms CPU/request (I/O wait excluded)
 * - KV: 100k reads/day, 1k writes/day → ~1000 sessions/day
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

interface CachedSession {
  /** Raw text chunks as received from LLM API */
  chunks: string[];
  /** Whether the LLM stream completed successfully */
  done: boolean;
  /** Error message if stream failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  // Forward request to LLM API
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

  // Set up the pass-through stream
  const allChunks: string[] = [];
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
        allChunks.push(text);
        eventId++;

        if (!clientGone) {
          try {
            await writer.write(
              enc.encode(`id: ${eventId}\ndata: ${JSON.stringify(text)}\n\n`)
            );
          } catch {
            // Client disconnected - continue reading from LLM to buffer
            clientGone = true;
          }
        }
      }

      // Send completion event
      if (!clientGone) {
        try {
          await writer.write(enc.encode('event: done\ndata: {}\n\n'));
        } catch {
          clientGone = true;
        }
      }
    } catch (e) {
      streamError = (e as Error).message;
      if (!clientGone) {
        try {
          await writer.write(
            enc.encode(
              `event: error\ndata: ${JSON.stringify({ error: streamError })}\n\n`
            )
          );
        } catch {
          clientGone = true;
        }
      }
    } finally {
      // Close the writer (no-op if client already disconnected)
      try {
        writer.close();
      } catch {
        // Already closed or errored
      }

      // Persist completed stream to KV for recovery (1 write per session)
      if (allChunks.length > 0) {
        try {
          await env.STREAM_CACHE.put(
            `session:${sessionId}`,
            JSON.stringify({
              chunks: allChunks,
              done: !streamError,
              error: streamError,
            } satisfies CachedSession),
            { expirationTtl: 300 } // 5 minutes TTL
          );
        } catch {
          // KV write failed (e.g., quota exceeded) - nothing we can do
        }
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

  let session: CachedSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Corrupt session data' }, 500);
  }

  // Return missed chunks as SSE
  const missedChunks = session.chunks.slice(lastEventId);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let id = lastEventId;
      for (const chunk of missedChunks) {
        id++;
        controller.enqueue(
          enc.encode(`id: ${id}\ndata: ${JSON.stringify(chunk)}\n\n`)
        );
      }
      if (session.done) {
        controller.enqueue(enc.encode('event: done\ndata: {}\n\n'));
      }
      if (session.error) {
        controller.enqueue(
          enc.encode(
            `event: error\ndata: ${JSON.stringify({ error: session.error })}\n\n`
          )
        );
      }
      controller.close();
    },
  });

  return sseResponse(stream);
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
