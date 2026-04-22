/**
 * Firefox verification for webgpu-asyncify-compat variant.
 *
 * Prereq:
 *   - vite dev server running on http://localhost:5173/
 *   - WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 build completed
 *   - /Applications/Firefox.app/Contents/MacOS/firefox present
 *
 * Usage:
 *   node scripts/verify-asyncify-firefox.mjs [modelPath]
 *   default modelPath: /Volumes/2TB-LLM/wllama-verification/Original/Bonsai-1.7B-Q2_K.gguf
 */
import { firefox } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const MODEL_PATH = process.argv[2]
  ?? '/Volumes/2TB-LLM/wllama-verification/Original/Bonsai-1.7B-Q2_K.gguf';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174/';
const FIREFOX_EXE = '/Applications/Firefox.app/Contents/MacOS/firefox';
const USER_DATA_DIR = resolve('.playwright-firefox-profile');

if (!existsSync(MODEL_PATH)) {
  console.error(`[abort] model not found: ${MODEL_PATH}`);
  process.exit(2);
}
mkdirSync(USER_DATA_DIR, { recursive: true });

function startModelServer() {
  return new Promise((res) => {
    const srv = createServer((req, r) => {
      const stat = statSync(MODEL_PATH);
      r.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(MODEL_PATH).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => srv.close() }));
  });
}

async function run({ label, singleThreadWasm, multiThreadWasm, nThreads, expectMultiThread }) {
  const modelServer = await startModelServer();
  const modelServerUrl = `http://127.0.0.1:${modelServer.port}/`;
  const modelFileName = basename(MODEL_PATH);

  console.log(`\n=== ${label} ===`);
  console.log(`[setup] model: ${MODEL_PATH} served at ${modelServerUrl}`);

  let ctx;
  try {
    ctx = await firefox.launchPersistentContext(USER_DATA_DIR, {
      channel: 'moz-firefox',
      headless: false,
      executablePath: FIREFOX_EXE,
    });
  } catch (e) {
    console.log(`[fallback] channel failed (${e.message}); retrying executablePath only`);
    ctx = await firefox.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      executablePath: FIREFOX_EXE,
    });
  }

  const page = ctx.pages()[0] ?? await ctx.newPage();

  page.on('console', (m) => {
    const t = m.text();
    if (t) console.log(`[browser:${label}:${m.type()}] ${t.slice(0, 400)}`);
  });
  page.on('pageerror', (e) => console.log(`[browser:${label}:pageerror] ${e.message}`));

  let result;
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    const gluePath = '/src/vendor/wllama/webgpu-asyncify-index.js';
    const version = '20260423-asyncify-exports-fix';
    const stUrl = `${BASE_URL}vendor/wllama/${singleThreadWasm}?v=${version}`;
    const mtUrl = multiThreadWasm ? `${BASE_URL}vendor/wllama/${multiThreadWasm}?v=${version}` : null;

    result = await page.evaluate(async ({ label, gluePath, modelServerUrl, modelFileName, stUrl, mtUrl, nThreads }) => {
      const withTimeout = (ms, step, p) => Promise.race([
        p, new Promise((_, rej) => setTimeout(() => rej(new Error(`[${label}] ${step} timed out after ${ms}ms`)), ms)),
      ]);
      try {
        const gpuAdapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        const gpuInfo = gpuAdapter ? { vendor: gpuAdapter.info?.vendor ?? 'unknown' } : null;
        console.log(`[${label}] stage1 gpuAdapter=${JSON.stringify(gpuInfo)}`);

        const mod = await import(gluePath);
        const { Wllama } = mod;
        const pathConfig = { 'single-thread/wllama.wasm': stUrl };
        if (mtUrl) pathConfig['multi-thread/wllama.wasm'] = mtUrl;

        const wllama = new Wllama(pathConfig, { suppressNativeLog: false });

        console.log(`[${label}] stage2 fetch model`);
        const resp = await fetch(modelServerUrl);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const blob = await resp.blob();
        const modelFile = new File([blob], modelFileName);

        console.log(`[${label}] stage3 loadModel n_threads=${nThreads}`);
        await withTimeout(180_000, 'loadModel', wllama.loadModel([modelFile], {
          n_ctx: 64, n_threads: nThreads, n_gpu_layers: 999, use_mmap: false,
        }));

        const isMt = typeof wllama.isMultithread === 'function' ? wllama.isMultithread() : null;
        console.log(`[${label}] stage4 loaded isMultithread=${isMt}`);

        const stream = await wllama.createCompletion('Hello', {
          nPredict: 8, sampling: { temp: 0.0 }, stream: true,
        });
        let generated = '', tokens = 0;
        const iter = stream[Symbol.asyncIterator]();
        for (;;) {
          const next = await withTimeout(60_000, `token#${tokens+1}`, iter.next());
          if (next.done) break;
          generated = next.value.currentText;
          tokens++;
        }
        console.log(`[${label}] stage5 generated="${generated.slice(0,80)}" tokens=${tokens}`);

        try { await Promise.race([wllama.exit(), new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5_000))]); }
        catch (e) { console.warn(`[${label}] exit: ${e.message}`); }

        return { success: true, generated, tokens, isMt, gpuInfo };
      } catch (e) {
        return { success: false, error: e.message, stack: e.stack };
      }
    }, { label, gluePath, modelServerUrl, modelFileName, stUrl, mtUrl, nThreads });
  } finally {
    await ctx.close();
    modelServer.close();
  }

  if (result.success) {
    console.log(`[${label}] PASS generated="${result.generated?.slice(0,80)}" tokens=${result.tokens} isMt=${result.isMt}`);
    if (expectMultiThread && result.isMt === false) console.warn(`[${label}] expected MT but got ST`);
    return true;
  } else {
    console.error(`[${label}] FAIL: ${result.error}`);
    if (result.stack) console.error(result.stack);
    return false;
  }
}

const cases = [
  { label: 'st-webgpu-asyncify-compat', singleThreadWasm: 'single-thread-webgpu-asyncify-compat.wasm', multiThreadWasm: null, nThreads: 1, expectMultiThread: false },
  { label: 'mt-webgpu-asyncify-compat', singleThreadWasm: 'single-thread-webgpu-asyncify-compat.wasm', multiThreadWasm: 'multi-thread-webgpu-asyncify-compat.wasm', nThreads: 4, expectMultiThread: true },
];

let allOk = true;
for (const c of cases) {
  const ok = await run(c);
  if (!ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
