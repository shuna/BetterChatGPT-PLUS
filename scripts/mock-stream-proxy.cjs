const http = require('http');

const port = Number(process.env.MOCK_PROXY_PORT || 8790);
const authToken = process.env.MOCK_PROXY_AUTH_TOKEN || 'local-test-token';
const sessions = new Map();

function writeHeaders(res, code, contentType) {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function unauthorized(res) {
  writeHeaders(res, 401, 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function checkAuth(req, res) {
  if (!authToken) return true;
  const header = req.headers.authorization || '';
  if (header === `Bearer ${authToken}`) return true;
  unauthorized(res);
  return false;
}

function proxyDataEvent(id, rawText) {
  return `id: ${id}\ndata: ${JSON.stringify(rawText)}\n\n`;
}

function proxyControlEvent(id, type, meta) {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(meta)}\n\n`;
}

function llmDataEvent(content) {
  return `data: ${JSON.stringify({ id: 'gen-local-123', choices: [{ delta: { content } }] })}\n\n`;
}

function llmDoneEvent(finishReason) {
  return (
    `data: ${JSON.stringify({ id: 'gen-local-123', choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n` +
    'data: [DONE]\n\n'
  );
}

function extractPrompt(payload) {
  const innerBody =
    payload && typeof payload.body === 'string'
      ? (() => {
          try {
            return JSON.parse(payload.body);
          } catch {
            return {};
          }
        })()
      : payload.body || {};
  const messages = Array.isArray(innerBody.messages) ? innerBody.messages : [];
  return messages
    .map((message) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    )
    .join('\n');
}

function resolveMode(prompt) {
  if (prompt.includes('length-case')) return 'length';
  if (prompt.includes('interrupt-case')) return 'interrupt';
  if (prompt.includes('error-case')) return 'error';
  if (prompt.includes('complete-case')) return 'complete';
  return 'complete';
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    writeHeaders(res, 204, 'text/plain');
    res.end();
    return;
  }

  if (!checkAuth(req, res)) return;

  if (req.method === 'POST' && req.url === '/api/stream') {
    const payload = await readJson(req);
    const sessionId = String(payload.sessionId || `session-${Date.now()}`);
    const mode = resolveMode(extractPrompt(payload));

    writeHeaders(res, 200, 'text/event-stream');
    const chunks =
      mode === 'interrupt'
        ? ['This ', 'is ', 'a ', 'slow ', 'stream ', 'for ', 'cancel ', 'testing.']
        : mode === 'length'
          ? ['This ', 'response ', 'is ', 'truncated']
          : mode === 'error'
            ? ['This ', 'will ', 'fail ']
            : ['This ', 'response ', 'completed.'];

    const state = { cancelled: false, timer: null };
    sessions.set(sessionId, state);

    let eventId = 1;
    let index = 0;
    const delayMs = mode === 'interrupt' ? 700 : 250;

    state.timer = setInterval(() => {
      if (state.cancelled) {
        res.write(
          proxyControlEvent(eventId++, 'interrupted', {
            totalChunks: index,
            complete: false,
            error: 'Cancelled by client',
          })
        );
        clearInterval(state.timer);
        sessions.delete(sessionId);
        res.end();
        return;
      }

      if (mode === 'error' && index >= chunks.length) {
        res.write(
          proxyControlEvent(eventId++, 'error', {
            totalChunks: index,
            complete: false,
            error: 'Injected mock proxy failure',
          })
        );
        clearInterval(state.timer);
        sessions.delete(sessionId);
        res.end();
        return;
      }

      if (index >= chunks.length) {
        const finishReason = mode === 'length' ? 'length' : 'stop';
        res.write(proxyDataEvent(eventId++, llmDoneEvent(finishReason)));
        res.write(
          proxyControlEvent(eventId++, 'done', {
            totalChunks: chunks.length,
            complete: true,
          })
        );
        clearInterval(state.timer);
        sessions.delete(sessionId);
        res.end();
        return;
      }

      res.write(proxyDataEvent(eventId++, llmDataEvent(chunks[index])));
      index += 1;
    }, delayMs);

    req.on('close', () => {
      if (state.timer) clearInterval(state.timer);
      sessions.delete(sessionId);
    });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/cancel/')) {
    const sessionId = decodeURIComponent(req.url.slice('/api/cancel/'.length));
    const state = sessions.get(sessionId);
    if (state) state.cancelled = true;
    writeHeaders(res, 204, 'text/plain');
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/ack/')) {
    writeHeaders(res, 204, 'text/plain');
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/recover/')) {
    writeHeaders(res, 200, 'text/event-stream');
    res.write(proxyControlEvent(1, 'done', { totalChunks: 0, complete: true }));
    res.end();
    return;
  }

  writeHeaders(res, 404, 'application/json');
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock-stream-proxy listening on http://127.0.0.1:${port}`);
  if (authToken) {
    console.log(`expecting Authorization: Bearer ${authToken}`);
  } else {
    console.log('authentication disabled');
  }
});
