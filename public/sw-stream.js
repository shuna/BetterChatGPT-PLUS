/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

const DB_NAME = 'sw-stream-db';
const STORE_NAME = 'requests';
const DB_VERSION = 1;
const FLUSH_INTERVAL_MS = 800;

const activeStreams = new Map();

// --- IndexedDB helpers (duplicated for SW scope) ---

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'requestId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbGet(requestId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const req = store.get(requestId);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbUpdate(requestId, updates) {
  const record = await dbGet(requestId);
  if (record) {
    Object.assign(record, updates, { updatedAt: Date.now() });
    await dbPut(record);
  }
}

// --- SSE Parser (inline copy from src/api/helper.ts) ---

function parseEventSource(data, flush) {
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawEvents = normalized.split('\n\n');
  const partial = flush ? '' : (rawEvents.pop() ?? '');
  const events = [];
  let done = false;

  for (const rawEvent of rawEvents) {
    if (!rawEvent.trim()) continue;
    const dataLines = [];
    for (const line of rawEvent.split('\n')) {
      if (line === 'data') {
        dataLines.push('');
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join('\n');
    if (payload.trim() === '[DONE]') {
      done = true;
      continue;
    }
    try {
      events.push(JSON.parse(payload));
    } catch {
      // skip malformed
    }
  }
  return { events, partial, done };
}

function extractText(events) {
  let text = '';
  for (const evt of events) {
    if (evt.choices && evt.choices[0] && evt.choices[0].delta) {
      const content = evt.choices[0].delta.content;
      if (content) text += content;
    }
  }
  return text;
}

// --- Stream handler ---

async function handleStartStream(msg, port) {
  const { requestId, endpoint, headers, body } = msg;
  const controller = new AbortController();
  activeStreams.set(requestId, controller);
  let bufferedText = '';
  let flushTimer = null;
  let flushChain = Promise.resolve();

  // Save initial record
  await dbPut({
    requestId,
    chatIndex: msg.chatIndex,
    messageIndex: msg.messageIndex,
    bufferedText: '',
    status: 'streaming',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    acknowledged: false,
  });

  function postToClient(data) {
    if (port) {
      try { port.postMessage(data); } catch { /* port closed */ }
    }
  }

  function flushBufferedText() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const snapshot = bufferedText;
    flushChain = flushChain
      .then(async () => {
        await dbUpdate(requestId, { bufferedText: snapshot });
      })
      .catch(() => {});

    return flushChain;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushBufferedText();
    }, FLUSH_INTERVAL_MS);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      await dbUpdate(requestId, { status: 'failed', error: errorText });
      postToClient({ type: 'sw-error', requestId, error: errorText });
      activeStreams.delete(requestId);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = '';
    let reading = true;

    const CHUNK_TIMEOUT_MS = 45_000;

    function readWithTimeout() {
      let timer;
      return Promise.race([
        reader.read().finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Chunk timeout: no data received for 45s')), CHUNK_TIMEOUT_MS);
        }),
      ]);
    }

    while (reading) {
      const { done, value } = await readWithTimeout();
      const chunk = partial + decoder.decode(value, { stream: !done });
      const parsed = parseEventSource(chunk, done);
      partial = parsed.partial;

      const text = extractText(parsed.events);
      if (text) {
        // Forward to client
        postToClient({ type: 'sw-chunk', requestId, text });
        bufferedText += text;
        scheduleFlush();
      }

      if (parsed.done || done) {
        reading = false;
      }
    }

    await flushBufferedText();
    await dbUpdate(requestId, { status: 'completed' });
    postToClient({ type: 'sw-done', requestId });
  } catch (err) {
    // On timeout, abort the fetch so the connection is released
    if (!controller.signal.aborted) {
      controller.abort();
    }
    const isAbort = err.name === 'AbortError';
    const isTimeout = !isAbort && err.message && err.message.includes('Chunk timeout');
    const status = isAbort ? 'interrupted' : 'failed';
    const error = isAbort ? 'Cancelled' : (err.message || String(err));
    await flushBufferedText();
    await dbUpdate(requestId, { status, error });
    postToClient({
      type: isAbort ? 'sw-cancelled' : 'sw-error',
      requestId,
      error,
      isTimeout: isTimeout || false,
    });
  } finally {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    activeStreams.delete(requestId);
  }
}

// --- SW lifecycle ---

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'startStream') {
    // Use dedicated MessagePort if provided (immune to extension interference).
    // Fall back to client.postMessage for backwards compatibility.
    const port = event.ports && event.ports[0];
    if (port) {
      handleStartStream(msg, port);
    } else {
      const resolveClient = event.source
        ? Promise.resolve(event.source)
        : self.clients.matchAll({ type: 'window' }).then((all) => all[0] || null);
      resolveClient.then((client) => {
        if (client) handleStartStream(msg, client);
      });
    }
  } else if (msg.type === 'cancelStream') {
    const controller = activeStreams.get(msg.requestId);
    if (controller) {
      controller.abort();
    }
  } else if (msg.type === 'ping') {
    // Health check
    if (event.source) {
      event.source.postMessage({ type: 'pong' });
    }
  }
});
