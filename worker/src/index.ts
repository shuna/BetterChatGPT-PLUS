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
 * Recovery strategies (toggle via RECOVERY_STRATEGY):
 * - "progressive": After client disconnect, periodic KV snapshots every
 *   PROGRESSIVE_SNAPSHOT_INTERVAL_MS. Recovery endpoint polls KV and
 *   streams chunks progressively as they become available.
 * - "batch": KV write only at completion. Recovery endpoint polls until
 *   stream is done, then replays all chunks at once.
 *
 * Free plan limits:
 * - 100k requests/day, 10ms CPU/request (I/O wait excluded)
 * - KV: 100k reads/day, 1k writes/day → ~1000 sessions/day
 *
 * KV storage format (NDJSON):
 *   Line 1: metadata JSON  {"totalChunks":N,"done":true|false,"error":"...","streaming":true|false}
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

// ---------------------------------------------------------------------------
// Recovery strategy toggle
// ---------------------------------------------------------------------------

/**
 * "progressive" — after client disconnect, write KV snapshots every
 *   PROGRESSIVE_SNAPSHOT_INTERVAL_MS. Recovery streams chunks progressively.
 * "batch" — write KV only at completion. Recovery waits until done,
 *   then replays everything at once.
 */
const RECOVERY_STRATEGY: 'progressive' | 'batch' = 'progressive';

/** Interval (ms) for periodic KV snapshots after client disconnect (progressive mode) */
const PROGRESSIVE_SNAPSHOT_INTERVAL_MS = 10_000;

/** How long the recovery endpoint polls KV before giving up (ms) */
const RECOVERY_POLL_TIMEOUT_MS = 300_000; // 5 minutes

/** Interval (ms) between KV reads during recovery polling */
const RECOVERY_POLL_INTERVAL_MS = 2_000;

/** KV TTL in seconds - safety net if client never sends ACK */
const KV_EXPIRATION_TTL = 21600; // 6 hours

// ---------------------------------------------------------------------------
// Active stream tracking — allows cancel endpoint to abort upstream reads
// ---------------------------------------------------------------------------

interface ActiveStream {
  abortController: AbortController;
  /** LLM API key from the original request headers (for provider cancel) */
  apiKey?: string;
}

const activeStreams = new Map<string, ActiveStream>();

/** Metadata stored in the first line of the NDJSON KV value */
interface SessionMeta {
  totalChunks: number;
  done: boolean;
  error?: string;
  /** true while the Worker is still receiving from the LLM */
  streaming?: boolean;
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
// KV helpers
// ---------------------------------------------------------------------------

/** Parse KV content into metadata + chunk lines */
function parseKvContent(raw: string): { meta: SessionMeta; chunkLines: string[] } | null {
  const newlineIdx = raw.indexOf('\n');
  if (newlineIdx === -1) return null;

  try {
    const meta: SessionMeta = JSON.parse(raw.slice(0, newlineIdx));
    const rest = raw.slice(newlineIdx + 1);
    const lines = rest.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return { meta, chunkLines: lines };
  } catch {
    return null;
  }
}

/**
 * Write a snapshot of the current stream state to KV.
 * Returns the wall-clock time of the write for rate-limit tracking.
 */
async function writeSnapshot(
  env: Env,
  sessionId: string,
  meta: SessionMeta,
  ndjsonBody: string
): Promise<number> {
  const kvValue = JSON.stringify(meta) + '\n' + ndjsonBody;
  const writeTime = Date.now();
  await env.STREAM_CACHE.put(
    `session:${sessionId}`,
    kvValue,
    { expirationTtl: KV_EXPIRATION_TTL }
  ).catch((e) => {
    console.error(`KV write failed for session:${sessionId}:`, (e as Error).message ?? e);
  });
  return writeTime;
}

/** Minimum gap (ms) between KV writes to the same key to avoid rate-limit 429s */
const KV_WRITE_COOLDOWN_MS = 1100;

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
  const llmAbort = new AbortController();
  const apiKey = reqHeaders['Authorization']?.replace(/^Bearer\s+/i, '') ||
    reqHeaders['authorization']?.replace(/^Bearer\s+/i, '');
  activeStreams.set(sessionId, { abortController: llmAbort, apiKey });

  let llmRes: Response;
  try {
    llmRes = await fetch(endpoint, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: llmAbort.signal,
    });
  } catch (e) {
    activeStreams.delete(sessionId);
    return jsonResponse(
      { error: `Failed to reach LLM API: ${(e as Error).message}` },
      502
    );
  }

  if (!llmRes.ok) {
    activeStreams.delete(sessionId);
    const errBody = await llmRes.text();
    return withCORS(
      new Response(errBody, {
        status: llmRes.status,
        headers: { 'Content-Type': llmRes.headers.get('Content-Type') || 'text/plain' },
      })
    );
  }

  if (!llmRes.body) {
    activeStreams.delete(sessionId);
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
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    /** Timestamp of the last KV write — used to enforce KV_WRITE_COOLDOWN_MS */
    let lastKvWriteAt = 0;

    /** Start periodic KV snapshots (progressive mode only, after client disconnect) */
    async function startProgressiveSnapshots() {
      if (RECOVERY_STRATEGY !== 'progressive' || snapshotTimer !== null) return;

      // Write an immediate snapshot so recovery can start right away.
      // Await to guarantee lastKvWriteAt is set before we resume reading
      // chunks — prevents the final write from racing this one.
      const immediateMeta: SessionMeta = {
        totalChunks: eventId,
        done: false,
        streaming: true,
      };
      lastKvWriteAt = await writeSnapshot(env, sessionId, immediateMeta, ndjsonBody);

      snapshotTimer = setInterval(async () => {
        const meta: SessionMeta = {
          totalChunks: eventId,
          done: false,
          streaming: true,
        };
        lastKvWriteAt = await writeSnapshot(env, sessionId, meta, ndjsonBody);
      }, PROGRESSIVE_SNAPSHOT_INTERVAL_MS);
    }

    function stopProgressiveSnapshots() {
      if (snapshotTimer !== null) {
        clearInterval(snapshotTimer);
        snapshotTimer = null;
      }
    }

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
            await startProgressiveSnapshots();
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
      activeStreams.delete(sessionId);
      stopProgressiveSnapshots();

      try {
        writer.close();
      } catch {
        // Already closed or errored
      }

      // Single KV write at completion (write-back).
      // NDJSON format: metadata line + one pre-serialized chunk per line.
      // No re-serialization needed — just string concatenation.
      if (eventId > 0) {
        // Respect KV write cooldown to avoid 429 when a snapshot was just written
        if (lastKvWriteAt > 0) {
          const elapsed = Date.now() - lastKvWriteAt;
          if (elapsed < KV_WRITE_COOLDOWN_MS) {
            await sleep(KV_WRITE_COOLDOWN_MS - elapsed);
          }
        }
        const meta: SessionMeta = {
          totalChunks: eventId,
          done: !streamError,
          streaming: false,
          ...(streamError ? { error: streamError } : {}),
        };
        await writeSnapshot(env, sessionId, meta, ndjsonBody);
      }
    }
  };

  // waitUntil ensures the Worker stays alive even after client disconnects
  ctx.waitUntil(processStream());

  return sseResponse(readable);
}

// ---------------------------------------------------------------------------
// Recovery handler - replays missed chunks from KV (with polling)
// ---------------------------------------------------------------------------

async function handleRecover(
  sessionId: string,
  lastEventId: number,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const enc = new TextEncoder();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const streamRecovery = async () => {
    let sentUpTo = lastEventId;
    const startTime = Date.now();

    try {
      while (true) {
        const raw = await env.STREAM_CACHE.get(`session:${sessionId}`);

        if (!raw) {
          // No data in KV yet — if within timeout, send a waiting event and poll
          if (Date.now() - startTime > RECOVERY_POLL_TIMEOUT_MS) {
            await writer.write(
              enc.encode(`event: error\ndata: ${JSON.stringify({
                totalChunks: 0,
                complete: false,
                error: 'Recovery timeout: session not found',
              })}\n\n`)
            );
            break;
          }
          await writer.write(
            enc.encode(`event: waiting\ndata: ${JSON.stringify({ sentUpTo })}\n\n`)
          );
          await sleep(RECOVERY_POLL_INTERVAL_MS);
          continue;
        }

        const parsed = parseKvContent(raw);
        if (!parsed) {
          await writer.write(
            enc.encode(`event: error\ndata: ${JSON.stringify({
              error: 'Corrupt session data',
            })}\n\n`)
          );
          break;
        }

        const { meta, chunkLines } = parsed;

        // Decide whether to send chunks now:
        // - progressive: send immediately as they become available
        // - batch: only send once the stream is complete (done/error)
        const shouldSendChunks =
          RECOVERY_STRATEGY === 'progressive' || !meta.streaming;

        if (shouldSendChunks) {
          // Send any new chunks since our last position
          const newChunks = chunkLines.slice(sentUpTo);
          for (let i = 0; i < newChunks.length; i++) {
            sentUpTo++;
            // Chunk lines are already JSON.stringify'd — use directly as SSE data
            await writer.write(
              enc.encode(`id: ${sentUpTo}\ndata: ${newChunks[i]}\n\n`)
            );
          }
        }

        // Stream is complete — send final event and exit
        if (meta.done) {
          await writer.write(
            enc.encode(`event: done\ndata: ${JSON.stringify({
              totalChunks: meta.totalChunks,
              complete: true,
            })}\n\n`)
          );
          break;
        }

        if (meta.error) {
          await writer.write(
            enc.encode(`event: error\ndata: ${JSON.stringify({
              totalChunks: meta.totalChunks,
              complete: false,
              error: meta.error,
            })}\n\n`)
          );
          break;
        }

        // Stream is still in progress — poll again
        if (meta.streaming) {
          // Check timeout
          if (Date.now() - startTime > RECOVERY_POLL_TIMEOUT_MS) {
            // Send whatever we have as interrupted
            await writer.write(
              enc.encode(`event: interrupted\ndata: ${JSON.stringify({
                totalChunks: meta.totalChunks,
                complete: false,
              })}\n\n`)
            );
            break;
          }

          await writer.write(
            enc.encode(`event: waiting\ndata: ${JSON.stringify({
              sentUpTo,
              streaming: true,
            })}\n\n`)
          );
          await sleep(RECOVERY_POLL_INTERVAL_MS);
          continue;
        }

        // meta.streaming === false and meta.done === false — shouldn't happen normally
        // but treat as interrupted
        await writer.write(
          enc.encode(`event: interrupted\ndata: ${JSON.stringify({
            totalChunks: meta.totalChunks,
            complete: false,
          })}\n\n`)
        );
        break;
      }
    } catch (e) {
      try {
        await writer.write(
          enc.encode(`event: error\ndata: ${JSON.stringify({
            error: (e as Error).message,
          })}\n\n`)
        );
      } catch {
        // Writer already closed
      }
    } finally {
      try {
        writer.close();
      } catch {
        // Already closed
      }
    }
  };

  // Use waitUntil so the polling continues even if client reads slowly
  ctx.waitUntil(streamRecovery());

  return sseResponse(readable);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
// Cancel handler - abort upstream LLM read and optionally call provider cancel
// ---------------------------------------------------------------------------

interface CancelRequest {
  providerCancel?: {
    generationId: string;
    apiKey: string;
  };
}

async function handleCancel(
  sessionId: string,
  request: Request,
  env: Env
): Promise<Response> {
  let cancelReq: CancelRequest = {};
  try {
    cancelReq = (await request.json()) as CancelRequest;
  } catch {
    // Body is optional
  }

  const stream = activeStreams.get(sessionId);
  if (stream) {
    // Abort the upstream LLM fetch — this will cause reader.read() to throw
    // in processStream, ending the while loop and triggering cleanup.
    stream.abortController.abort();
  }

  // Call provider cancel API if generation ID is provided
  const pc = cancelReq.providerCancel;
  if (pc?.generationId && pc?.apiKey) {
    try {
      await fetch(
        `https://openrouter.ai/api/v1/generation/${encodeURIComponent(pc.generationId)}/cancel`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${pc.apiKey}` },
        }
      );
    } catch {
      // Best-effort
    }
  }

  // Clean up KV cache — the buffered data up to this point is already
  // available for recovery if needed (the final snapshot in processStream's
  // finally block will still run with whatever was buffered before abort).
  return jsonResponse({ cancelled: true });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function handleHealth(): Response {
  return jsonResponse({ status: 'ok', version: '0.2.0' });
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

    // POST /api/cancel/:sessionId - Cancel upstream LLM stream
    if (url.pathname.startsWith('/api/cancel/') && request.method === 'POST') {
      const sessionId = decodeURIComponent(
        url.pathname.slice('/api/cancel/'.length)
      );
      if (!sessionId) {
        return jsonResponse({ error: 'sessionId is required' }, 400);
      }
      return handleCancel(sessionId, request, env);
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
      return handleRecover(sessionId, lastEventId, env, ctx);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
