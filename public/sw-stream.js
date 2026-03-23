/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

const DB_NAME = 'sw-stream-db';
const STORE_NAME = 'requests';
const DB_VERSION = 1;
const FLUSH_INTERVAL_MS = 800;

const activeStreams = new Map();

function formatDebugTime(time) {
  return new Date(time || Date.now()).toISOString().slice(11, 23);
}

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

async function dbDelete(requestId) {
  const db = await openDb();
  return new Promise(function(resolve, reject) {
    var store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    var req = store.delete(requestId);
    req.onsuccess = function() { db.close(); resolve(); };
    req.onerror = function() { db.close(); reject(req.error); };
  });
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

var REASONING_TYPES = {
  'reasoning': true, 'thinking': true, 'reasoning.text': true,
  'reasoning.summary': true, 'redacted_thinking': true,
};

function extractText(events) {
  let text = '';
  for (const evt of events) {
    if (evt.choices && evt.choices[0] && evt.choices[0].delta) {
      const content = evt.choices[0].delta.content;
      if (typeof content === 'string') {
        text += content;
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item === 'string') {
            text += item;
          } else if (item && typeof item === 'object') {
            const type = item.type || '';
            // Skip reasoning/thinking blocks — handled by extractReasoning
            if (type && REASONING_TYPES[type]) continue;
            if (type === 'text' || type === 'output_text' || !type) {
              text += item.text || item.content || item.value || '';
            }
          }
        }
      } else if (content && typeof content === 'object') {
        const type = content.type || '';
        if (!type || type === 'text' || type === 'output_text') {
          text += content.text || content.content || content.value || '';
        }
      }
    }
  }
  return text;
}

/**
 * Extract reasoning text from events.
 * Supports three formats:
 *  1. delta.reasoning (simple string)
 *  2. delta.reasoning_content (DeepSeek-style)
 *  3. delta.reasoning_details (structured array with type: "reasoning.text")
 */
function extractReasoning(events) {
  let reasoning = '';
  for (const evt of events) {
    if (!evt.choices || !evt.choices[0] || !evt.choices[0].delta) continue;
    const delta = evt.choices[0].delta;
    if (delta.reasoning) {
      reasoning += delta.reasoning;
    } else if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
    } else if (delta.reasoning_details && Array.isArray(delta.reasoning_details)) {
      for (const d of delta.reasoning_details) {
        if (d.type === 'reasoning.text' && d.text) reasoning += d.text;
        if (d.type === 'reasoning.summary' && d.summary) reasoning += d.summary;
      }
    } else if (Array.isArray(delta.content)) {
      for (const item of delta.content) {
        if (!item || typeof item !== 'object') continue;
        const type = item.type || '';
        if (
          type === 'reasoning' ||
          type === 'thinking' ||
          type === 'reasoning.text' ||
          type === 'reasoning.summary' ||
          type === 'redacted_thinking'
        ) {
          reasoning += item.text || item.summary || item.reasoning || item.thinking || item.content || '';
        }
      }
    } else if (delta.content && typeof delta.content === 'object') {
      const item = delta.content;
      const type = item.type || '';
      if (
        type === 'reasoning' ||
        type === 'thinking' ||
        type === 'reasoning.text' ||
        type === 'reasoning.summary' ||
        type === 'redacted_thinking'
      ) {
        reasoning += item.text || item.summary || item.reasoning || item.thinking || item.content || '';
      }
    }
  }
  return reasoning;
}

// --- ThinkTagParser (plain-JS copy of src/utils/thinkTagParser.ts) ---
// Handles <think>...</think> tags in content for open-source reasoning models.
// Keep both implementations in sync.
// Verified by: src/utils/thinkTagParser.sync.test.ts

function createThinkTagParser() {
  let state = 'outside'; // 'outside' | 'inside'
  let pending = '';

  function findPartialTag(buffer, tag) {
    const maxLen = Math.min(tag.length - 1, buffer.length);
    for (let len = maxLen; len > 0; len--) {
      if (buffer.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }

  function process(text) {
    let content = '';
    let reasoning = '';
    let buffer = pending + text;
    pending = '';

    while (buffer.length > 0) {
      if (state === 'outside') {
        const openIdx = buffer.indexOf('<think>');
        if (openIdx === -1) {
          const partial = findPartialTag(buffer, '<think>');
          if (partial > 0) {
            content += buffer.slice(0, buffer.length - partial);
            pending = buffer.slice(buffer.length - partial);
          } else {
            content += buffer;
          }
          break;
        } else {
          content += buffer.slice(0, openIdx);
          buffer = buffer.slice(openIdx + 7);
          state = 'inside';
        }
      } else {
        const closeIdx = buffer.indexOf('</think>');
        if (closeIdx === -1) {
          const partial = findPartialTag(buffer, '</think>');
          if (partial > 0) {
            reasoning += buffer.slice(0, buffer.length - partial);
            pending = buffer.slice(buffer.length - partial);
          } else {
            reasoning += buffer;
          }
          break;
        } else {
          reasoning += buffer.slice(0, closeIdx);
          buffer = buffer.slice(closeIdx + 8);
          state = 'outside';
        }
      }
    }

    return { content, reasoning };
  }

  function flush() {
    const remaining = pending;
    pending = '';
    if (state === 'inside') return { content: '', reasoning: remaining };
    return { content: remaining, reasoning: '' };
  }

  return { process, flush };
}

/** Extract the last non-null finish_reason from events. */
function extractFinishReason(events) {
  let reason = null;
  for (const evt of events) {
    if (evt.choices && evt.choices[0] && evt.choices[0].finish_reason) {
      reason = evt.choices[0].finish_reason;
    }
  }
  return reason;
}

/** Extract the first non-empty generation ID (e.g. `gen-xxxxx`) from events. */
function extractGenerationId(events) {
  for (const evt of events) {
    if (evt.id && typeof evt.id === 'string' && evt.id.startsWith('gen-')) {
      return evt.id;
    }
  }
  return null;
}

// --- Proxy SSE Parser ---
// Proxy format: id: N\ndata: "JSON-stringified raw text"\n\n
// Control events: event: done\ndata: {"totalChunks":N,"complete":true}\n\n
//
// IMPORTANT: This is a plain-JS copy of parseProxySse in src/utils/proxyClient.ts.
// SW scope cannot import ES modules, so the logic is duplicated here.
// Keep both implementations in sync when making changes.

function parseProxySse(text, flush) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.split('\n\n');
  const partial = flush ? '' : (rawBlocks.pop() ?? '');
  const events = [];

  for (const block of rawBlocks) {
    if (!block.trim()) continue;
    let id = 0;
    let eventType = undefined;
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
        const rawText = JSON.parse(dataLine);
        events.push({ id, rawText });
      } catch {
        // skip malformed
      }
    }
  }

  return { events, partial };
}

// --- Stream handler ---

async function handleStartStream(msg, port) {
  const { requestId, endpoint, headers, body } = msg;
  const proxyMode = !!msg.proxyMode;
  const proxyConfig = msg.proxyConfig; // { endpoint, authToken, sessionId }
  const controller = new AbortController();
  activeStreams.set(requestId, controller);
  let bufferedText = '';
  let flushTimer = null;
  let flushChain = Promise.resolve();
  let lastProxyEventId = 0;
  let generationId = null;
  let finishReason = null;
  const thinkParser = createThinkTagParser();

  // Save initial record
  const initialRecord = {
    requestId,
    chatIndex: msg.chatIndex,
    messageIndex: msg.messageIndex,
    bufferedText: '',
    status: 'streaming',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    acknowledged: false,
  };
  if (proxyMode && proxyConfig) {
    initialRecord.proxySessionId = proxyConfig.sessionId;
    initialRecord.lastProxyEventId = 0;
  }
  await dbPut(initialRecord);

  function postToClient(data) {
    if (port) {
      try { port.postMessage(data); } catch { /* port closed */ }
    }
  }

  function postDebug(detail, status) {
    postToClient({
      type: 'sw-debug',
      requestId,
      detail: formatDebugTime() + ' ' + detail,
      status: status || 'active',
    });
  }

  function flushBufferedText() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const snapshot = bufferedText;
    const eventIdSnapshot = lastProxyEventId;
    flushChain = flushChain
      .then(async () => {
        const updates = { bufferedText: snapshot };
        if (proxyMode) updates.lastProxyEventId = eventIdSnapshot;
        await dbUpdate(requestId, updates);
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

  // Build the actual fetch target
  let fetchEndpoint, fetchHeaders, fetchBody;
  if (proxyMode && proxyConfig) {
    fetchEndpoint = proxyConfig.endpoint + '/api/stream';
    fetchHeaders = { 'Content-Type': 'application/json' };
    if (proxyConfig.authToken) {
      fetchHeaders['Authorization'] = 'Bearer ' + proxyConfig.authToken;
    }
    fetchBody = JSON.stringify({
      endpoint,
      headers,
      body,
      sessionId: proxyConfig.sessionId,
    });
  } else {
    fetchEndpoint = endpoint;
    fetchHeaders = headers;
    fetchBody = JSON.stringify(body);
  }

  try {
    postDebug('fetch start ' + fetchEndpoint);
    const response = await fetch(fetchEndpoint, {
      method: 'POST',
      headers: fetchHeaders,
      body: fetchBody,
      signal: controller.signal,
    });
    postDebug('fetch response ' + response.status);

    if (!response.ok) {
      let errorText = await response.text();
      // Cloudflare platform errors (e.g. 530/1016 DNS failure) return HTML.
      // Detect and provide a user-friendly message.
      const isCloudflareError =
        response.status >= 520 ||
        (errorText.includes('error code:') && !errorText.startsWith('{'));
      if (isCloudflareError) {
        const codeMatch = errorText.match(/error code:\s*(\d+)/);
        const code = codeMatch ? codeMatch[1] : String(response.status);
        errorText = 'Proxy error (' + code + '): The LLM API endpoint is unreachable. Check the URL and try again.';
      }
      await dbUpdate(requestId, { status: 'failed', error: errorText });
      postDebug('fetch failed ' + response.status, 'error');
      postToClient({ type: 'sw-error', requestId, error: errorText });
      activeStreams.delete(requestId);
      return;
    }

    if (!response.body) {
      const errorText = 'Streaming response body is missing';
      await dbUpdate(requestId, { status: 'failed', error: errorText });
      postDebug('response.body missing', 'error');
      postToClient({ type: 'sw-error', requestId, error: errorText });
      activeStreams.delete(requestId);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = '';
    let reading = true;
    let readCount = 0;
    let totalBytes = 0;
    let totalTextChars = 0;
    let totalReasoningChars = 0;
    postDebug('reader ready');

    const CHUNK_TIMEOUT_MS = 45_000;

    function readWithTimeout() {
      let timer;
      const nextRead = readCount + 1;
      postDebug('waiting read#' + nextRead);
      return Promise.race([
        reader.read().then((result) => {
          postDebug(
            'read#' + nextRead + ' resolved done=' + result.done +
            ' bytes=' + (result.value ? result.value.byteLength : 0)
          );
          return result;
        }).finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            postDebug('read#' + nextRead + ' timeout fired', 'error');
            reject(new Error('Chunk timeout: no data received for 45s'));
          }, CHUNK_TIMEOUT_MS);
        }),
      ]);
    }

    if (proxyMode) {
      // --- Proxy mode: parse proxy SSE, unwrap, then parse LLM SSE ---
      let llmPartial = '';

      while (reading) {
        const { done, value } = await readWithTimeout();
        readCount++;
        const byteLength = value ? value.byteLength : 0;
        totalBytes += byteLength;
        postDebug(
          'read#' + readCount + ' bytes=' + byteLength + ' total=' + totalBytes + ' done=' + done
        );
        const chunk = partial + decoder.decode(done ? undefined : value, { stream: !done });
        const proxySse = parseProxySse(chunk, done);
        partial = proxySse.partial;

        for (const evt of proxySse.events) {
          if (evt.id > lastProxyEventId) lastProxyEventId = evt.id;

          if (evt.eventType === 'done') {
            postDebug('proxy done event lastEventId=' + lastProxyEventId);
            reading = false;
            break;
          }
          if (evt.eventType === 'error' || evt.eventType === 'interrupted') {
            const errorMsg = evt.meta && evt.meta.error ? evt.meta.error : 'Proxy stream error';
            postDebug('proxy ' + evt.eventType + ' ' + errorMsg, 'error');
            throw new Error(errorMsg);
          }

          if (evt.rawText) {
            // Unwrap: parse the raw LLM SSE text
            const llmChunk = llmPartial + evt.rawText;
            const llmParsed = parseEventSource(llmChunk, false);
            llmPartial = llmParsed.partial;

            if (!generationId) {
              generationId = extractGenerationId(llmParsed.events);
              if (generationId) {
                void dbUpdate(requestId, { generationId });
              }
            }
            const fr = extractFinishReason(llmParsed.events);
            if (fr) finishReason = fr;
            const reasoning = extractReasoning(llmParsed.events);
            if (reasoning) {
              totalReasoningChars += reasoning.length;
              postToClient({ type: 'sw-chunk', requestId, text: '', reasoning, generationId });
            }
            const rawText = extractText(llmParsed.events);
            if (rawText) {
              const parsed = thinkParser.process(rawText);
              if (parsed.reasoning) {
                totalReasoningChars += parsed.reasoning.length;
                postToClient({ type: 'sw-chunk', requestId, text: '', reasoning: parsed.reasoning, generationId });
              }
              if (parsed.content) {
                totalTextChars += parsed.content.length;
                postToClient({ type: 'sw-chunk', requestId, text: parsed.content, generationId });
                bufferedText += parsed.content;
                scheduleFlush();
              }
            }

            if (llmParsed.done) {
              postDebug(
                'llm done marker read#' + readCount +
                ' text=' + totalTextChars +
                ' reasoning=' + totalReasoningChars
              );
              reading = false;
              break;
            }
          }
        }

        if (done) {
          postDebug(
            'reader done=true read#' + readCount +
            ' text=' + totalTextChars +
            ' reasoning=' + totalReasoningChars
          );
          reading = false;
        }
      }

      // Flush any remaining partial LLM SSE
      if (llmPartial) {
        postDebug('flush llmPartial len=' + llmPartial.length);
        const llmFlushed = parseEventSource(llmPartial, true);
        const fr = extractFinishReason(llmFlushed.events);
        if (fr) finishReason = fr;
        const reasoning = extractReasoning(llmFlushed.events);
        if (reasoning) {
          totalReasoningChars += reasoning.length;
          postToClient({ type: 'sw-chunk', requestId, text: '', reasoning });
        }
        const rawFlushText = extractText(llmFlushed.events);
        if (rawFlushText) {
          const parsed = thinkParser.process(rawFlushText);
          if (parsed.reasoning) {
            totalReasoningChars += parsed.reasoning.length;
            postToClient({ type: 'sw-chunk', requestId, text: '', reasoning: parsed.reasoning });
          }
          if (parsed.content) {
            totalTextChars += parsed.content.length;
            postToClient({ type: 'sw-chunk', requestId, text: parsed.content });
            bufferedText += parsed.content;
          }
        }
      }
      // Flush remaining think-tag buffer for proxy mode
      const proxyThinkRemaining = thinkParser.flush();
      postDebug(
        'think flush content=' + proxyThinkRemaining.content.length +
        ' reasoning=' + proxyThinkRemaining.reasoning.length
      );
      if (proxyThinkRemaining.reasoning) {
        totalReasoningChars += proxyThinkRemaining.reasoning.length;
        postToClient({ type: 'sw-chunk', requestId, text: '', reasoning: proxyThinkRemaining.reasoning });
      }
      if (proxyThinkRemaining.content) {
        totalTextChars += proxyThinkRemaining.content.length;
        postToClient({ type: 'sw-chunk', requestId, text: proxyThinkRemaining.content });
        bufferedText += proxyThinkRemaining.content;
      }
    } else {
      // --- Direct mode: existing LLM SSE parsing ---
      var _chunkNum = 0, _totalText = 0, _totalReasoning = 0;
      console.log('[SW] stream start id=' + requestId.slice(0, 8));
      while (reading) {
        const { done, value } = await readWithTimeout();
        _chunkNum++;
        readCount++;
        const byteLength = value ? value.byteLength : 0;
        totalBytes += byteLength;
        postDebug(
          'read#' + readCount + ' bytes=' + byteLength + ' total=' + totalBytes + ' done=' + done
        );
        const chunk = partial + decoder.decode(done ? undefined : value, { stream: !done });
        const parsed = parseEventSource(chunk, done);
        partial = parsed.partial;

        if (!generationId) {
          generationId = extractGenerationId(parsed.events);
          if (generationId) {
            void dbUpdate(requestId, { generationId });
          }
        }
        const fr = extractFinishReason(parsed.events);
        if (fr) {
          finishReason = fr;
          console.log('[SW] finish_reason=' + fr + ' chunk#' + _chunkNum);
        }
        const reasoning = extractReasoning(parsed.events);
        if (reasoning) {
          _totalReasoning += reasoning.length;
          totalReasoningChars += reasoning.length;
          postToClient({ type: 'sw-chunk', requestId, text: '', reasoning, generationId });
        }
        const rawDirectText = extractText(parsed.events);
        if (rawDirectText) {
          const thinkParsed = thinkParser.process(rawDirectText);
          if (thinkParsed.reasoning) {
            _totalReasoning += thinkParsed.reasoning.length;
            totalReasoningChars += thinkParsed.reasoning.length;
            postToClient({ type: 'sw-chunk', requestId, text: '', reasoning: thinkParsed.reasoning, generationId });
          }
          if (thinkParsed.content) {
            _totalText += thinkParsed.content.length;
            totalTextChars += thinkParsed.content.length;
            postToClient({ type: 'sw-chunk', requestId, text: thinkParsed.content, generationId });
            bufferedText += thinkParsed.content;
            scheduleFlush();
          }
        }

        if (_chunkNum % 50 === 0) {
          console.log('[SW] #' + _chunkNum + ' txt=' + _totalText + ' rsn=' + _totalReasoning + ' partial=' + partial.length);
        }

        if (parsed.done || done) {
          postDebug(
            'direct done read#' + readCount +
            ' parsed=' + parsed.done +
            ' done=' + done +
            ' text=' + totalTextChars +
            ' reasoning=' + totalReasoningChars
          );
          console.log('[SW] done chunk#' + _chunkNum + ' txt=' + _totalText + ' rsn=' + _totalReasoning + ' parsed.done=' + parsed.done + ' done=' + done);
          reading = false;
        }
      }
      // Flush remaining think-tag buffer for direct mode
      const directThinkRemaining = thinkParser.flush();
      postDebug(
        'think flush content=' + directThinkRemaining.content.length +
        ' reasoning=' + directThinkRemaining.reasoning.length
      );
      if (directThinkRemaining.reasoning) {
        totalReasoningChars += directThinkRemaining.reasoning.length;
        postToClient({ type: 'sw-chunk', requestId, text: '', reasoning: directThinkRemaining.reasoning });
      }
      if (directThinkRemaining.content) {
        totalTextChars += directThinkRemaining.content.length;
        postToClient({ type: 'sw-chunk', requestId, text: directThinkRemaining.content });
        bufferedText += directThinkRemaining.content;
      }
    }

    postDebug('flush buffered start len=' + bufferedText.length);
    await flushBufferedText();
    postDebug('flush buffered done len=' + bufferedText.length);
    // Stream completed — delete the recovery record since we'll notify the
    // client directly.  Using delete instead of dbUpdate avoids a get-put
    // race where a concurrent client delete could be undone by a later put.
    await dbDelete(requestId).catch(function() {});
    postDebug('record deleted');
    postDebug(
      'posting sw-done generation=' + (generationId || '-') +
      ' finish=' + (finishReason || '-')
    );
    postToClient({
      type: 'sw-done',
      requestId,
      generationId,
      finishReason,
      ...(proxyMode ? { proxySessionId: proxyConfig.sessionId, lastProxyEventId } : {}),
    });
    postDebug('posted sw-done', 'done');
  } catch (err) {
    // On timeout, abort the fetch so the connection is released
    if (!controller.signal.aborted) {
      controller.abort();
    }
    const isAbort = err.name === 'AbortError';
    const isTimeout = !isAbort && err.message && err.message.includes('Chunk timeout');
    const error = isAbort ? 'Cancelled' : (err.message || String(err));
    postDebug(
      (isAbort ? 'abort ' : 'exception ') + error,
      isAbort ? 'error' : 'error'
    );
    await flushBufferedText();
    postDebug('flush buffered after error len=' + bufferedText.length);
    // For errors/cancellation, also delete — the client gets notified via
    // sw-error/sw-cancelled and can decide how to handle it.
    await dbDelete(requestId).catch(function() {});
    postDebug('record deleted after error');
    postToClient({
      type: isAbort ? 'sw-cancelled' : 'sw-error',
      requestId,
      error,
      isTimeout: isTimeout || false,
      generationId,
      ...(proxyMode ? { proxySessionId: proxyConfig.sessionId, lastProxyEventId } : {}),
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
      event.waitUntil(handleStartStream(msg, port));
    } else {
      const streamTask = (event.source
        ? Promise.resolve(event.source)
        : self.clients.matchAll({ type: 'window' }).then((all) => all[0] || null))
        .then((client) => {
          if (client) {
            return handleStartStream(msg, client);
          }
          return undefined;
        });
      event.waitUntil(streamTask);
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
