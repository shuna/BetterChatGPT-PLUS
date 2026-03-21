/**
 * Client utilities for the Weavelet Stream Proxy (Cloudflare Worker).
 *
 * Provides:
 * - ACK endpoint to delete KV cache after full receipt
 * - Recovery endpoint to replay missed chunks
 * - Proxy SSE event parsing helpers
 */

export interface ProxyConfig {
  /** Base URL of the proxy worker, e.g. "https://stream-proxy.example.com" */
  endpoint: string;
  /** Optional Bearer token for PROXY_AUTH_TOKEN */
  authToken?: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

function authHeaders(config: ProxyConfig): Record<string, string> {
  if (!config.authToken) return {};
  return { Authorization: `Bearer ${config.authToken}` };
}

/**
 * Ask the proxy to cancel the upstream LLM stream and optionally
 * forward a provider-level cancel request (e.g. OpenRouter generation cancel).
 *
 * Best-effort — KV TTL will clean up eventually if the request fails.
 */
export async function sendCancel(
  config: ProxyConfig,
  sessionId: string,
  providerCancel?: { generationId: string; apiKey: string }
): Promise<void> {
  try {
    await fetch(
      `${config.endpoint}/api/cancel/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(config),
        },
        body: JSON.stringify({ providerCancel }),
      }
    );
  } catch {
    // Best-effort — the Worker may have already finished
  }
}

/**
 * Notify the proxy that the client has fully received all chunks.
 * The proxy will delete the KV cache immediately.
 */
export async function sendAck(
  config: ProxyConfig,
  sessionId: string
): Promise<void> {
  try {
    await fetch(
      `${config.endpoint}/api/ack/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: authHeaders(config),
      }
    );
  } catch {
    // Best-effort — KV TTL will clean up eventually
  }
}

/**
 * Recover missed chunks from the proxy's KV cache.
 * Returns the response body as a ReadableStream of proxy SSE, or null on failure.
 */
export async function recoverFromProxy(
  config: ProxyConfig,
  sessionId: string,
  lastEventId: number,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const res = await fetch(
      `${config.endpoint}/api/recover/${encodeURIComponent(sessionId)}?lastEventId=${lastEventId}`,
      { headers: authHeaders(config), signal }
    );
    if (!res.ok || !res.body) return null;
    return res.body;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Proxy SSE parsing
// ---------------------------------------------------------------------------

export interface ProxySseEvent {
  /** Sequential event ID from the proxy */
  id: number;
  /** Event type: undefined for data events, 'done' or 'error' for control */
  eventType?: string;
  /** The raw text chunk from the LLM (for data events) */
  rawText?: string;
  /** Metadata for done/error events */
  meta?: { totalChunks: number; complete: boolean; error?: string };
}

/**
 * Parse proxy SSE text into structured events.
 *
 * IMPORTANT: A plain-JS copy of this function exists in public/sw-stream.js
 * (parseProxySse) for Service Worker scope which cannot import ES modules.
 * Keep both implementations in sync when making changes.
 *
 * Proxy SSE format:
 *   id: 1
 *   data: "JSON-stringified raw text"
 *
 *   event: done
 *   data: {"totalChunks":N,"complete":true}
 */
export function parseProxySse(
  text: string,
  flush = false
): { events: ProxySseEvent[]; partial: string } {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.split('\n\n');
  const partial = flush ? '' : (rawBlocks.pop() ?? '');
  const events: ProxySseEvent[] = [];

  for (const block of rawBlocks) {
    if (!block.trim()) continue;

    let id = 0;
    let eventType: string | undefined;
    let dataLine = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('id: ')) {
        id = parseInt(line.slice(4), 10);
      } else if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      } else if (line === 'data') {
        dataLine = '';
      }
    }

    if (eventType === 'done' || eventType === 'error' || eventType === 'interrupted' || eventType === 'waiting') {
      try {
        events.push({ id, eventType, meta: JSON.parse(dataLine) });
      } catch {
        events.push({ id, eventType });
      }
    } else if (dataLine) {
      try {
        const rawText = JSON.parse(dataLine) as string;
        events.push({ id, rawText });
      } catch {
        // Malformed data — skip
      }
    }
  }

  return { events, partial };
}
