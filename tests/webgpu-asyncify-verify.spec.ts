/**
 * WebGPU Asyncify variant E2E verification.
 *
 * Gated on all three artifacts existing:
 *   vendor/wllama/single-thread-webgpu-asyncify-compat.wasm
 *   vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm
 *   src/vendor/wllama/webgpu-asyncify-index.js
 *
 * When artifacts are absent the spec skips cleanly — it does NOT fail.
 * Run after a successful WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 build.
 *
 * IMPORTANT: To force-select these variants the Asyncify entries must be temporarily
 * set to disabled: false in variant-table.ts.  Run this spec on a verification
 * branch/commit; do not merge with disabled: false on main until E2E is confirmed.
 *
 * Run:
 *   cd /Users/suzuki/weavelet-canvas && npx playwright test tests/webgpu-asyncify-verify.spec.ts --reporter=list
 */

import { test, expect } from './helpers/persistent-chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const BASE_URL = 'http://localhost:5173/';
const WASM_ASSET_VERSION = '20260421-asyncify-verify';
const MODEL_PATH = '/Users/suzuki/Downloads/smollm2-360m-instruct-q8_0.gguf';

const ARTIFACTS = {
  stWasm: '/Users/suzuki/weavelet-canvas/vendor/wllama/single-thread-webgpu-asyncify-compat.wasm',
  mtWasm: '/Users/suzuki/weavelet-canvas/vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm',
  glueJs: '/Users/suzuki/weavelet-canvas/src/vendor/wllama/webgpu-asyncify-index.js',
};

function artifactsExist(): boolean {
  return fs.existsSync(ARTIFACTS.stWasm)
      && fs.existsSync(ARTIFACTS.mtWasm)
      && fs.existsSync(ARTIFACTS.glueJs);
}

function startModelFileServer(filePath: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return; }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

let _modelServer: { port: number; close: () => void } | null = null;
async function getModelServer(): Promise<{ port: number; close: () => void }> {
  if (!_modelServer) {
    _modelServer = await startModelFileServer(MODEL_PATH);
    console.log(`[asyncify-verify] model server on port ${_modelServer.port}`);
  }
  return _modelServer;
}

interface AsyncifyCase {
  label: string;
  singleThreadWasm: string;
  multiThreadWasm: string | null;
  nThreads: number;
  expectMultiThread: boolean;
}

const CASES: AsyncifyCase[] = [
  {
    label: 'st-webgpu-asyncify-compat',
    singleThreadWasm: 'single-thread-webgpu-asyncify-compat.wasm',
    multiThreadWasm: null,
    nThreads: 1,
    expectMultiThread: false,
  },
  {
    label: 'mt-webgpu-asyncify-compat',
    singleThreadWasm: 'single-thread-webgpu-asyncify-compat.wasm',
    multiThreadWasm: 'multi-thread-webgpu-asyncify-compat.wasm',
    nThreads: 4,
    expectMultiThread: true,
  },
];

test.describe('WebGPU Asyncify variant E2E', () => {
  test.afterAll(() => {
    _modelServer?.close();
    _modelServer = null;
  });

  for (const tc of CASES) {
    test(tc.label, async ({ persistentPage: page }) => {
      test.setTimeout(10 * 60_000);

      if (!artifactsExist()) {
        test.skip(true,
          'Asyncify WebGPU artifacts not found — run with WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 first');
        return;
      }

      if (!fs.existsSync(MODEL_PATH)) {
        test.skip(true, `Model file not found: ${MODEL_PATH}`);
        return;
      }

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

      const srv = await getModelServer();
      const modelFileName = path.basename(MODEL_PATH);
      const modelServerUrl = `http://127.0.0.1:${srv.port}/`;
      const gluePath = '/src/vendor/wllama/webgpu-asyncify-index.js';
      const singleThreadWasmUrl = `http://localhost:5173/vendor/wllama/${tc.singleThreadWasm}?v=${WASM_ASSET_VERSION}`;
      const multiThreadWasmUrl = tc.multiThreadWasm
        ? `http://localhost:5173/vendor/wllama/${tc.multiThreadWasm}?v=${WASM_ASSET_VERSION}`
        : null;

      page.on('console', (msg) => {
        const text = msg.text();
        if (text.length > 0) {
          console.log(`[browser:${tc.label}:${msg.type()}] ${text.slice(0, 400)}`);
        }
      });

      const result = await page.evaluate(async ({
        label,
        gluePath,
        modelServerUrl,
        modelFileName,
        singleThreadWasmUrl,
        multiThreadWasmUrl,
        nThreads,
      }) => {
        const logs: [string, string][] = [];
        const errors: string[] = [];

        const pushLog = (level: string, args: unknown[]) => {
          const msg = args.map(String).join(' ');
          logs.push([level, msg]);
          if (level === 'warn' || level === 'error') errors.push(msg);
        };

        const withTimeout = <T>(ms: number, step: string, p: Promise<T>): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error(`[${label}] "${step}" timed out after ${ms}ms`)), ms)
            ),
          ]);

        try {
          // Diagnostic: check WebGPU capability.
          const gpuAdapter = navigator.gpu
            ? await navigator.gpu.requestAdapter()
            : null;
          const gpuAdapterInfo = gpuAdapter
            ? { vendor: (gpuAdapter as { info?: { vendor?: string } }).info?.vendor ?? 'unknown' }
            : null;

          console.log(`[${label}] stage1 gluePath=${gluePath} gpuAdapter=${JSON.stringify(gpuAdapterInfo)}`);
          // @ts-ignore
          const mod = await import(gluePath);
          const { Wllama } = mod;

          // Note: Module._wllama_* export verification is done at build time in
          // verify_webgpu_jspi_disabled() inside build-local.sh. The Wllama class
          // constructor exposed here does not reflect the inner Emscripten Module
          // object, so checking its properties here would be misleading.

          const pathConfig: Record<string, string> = {
            'single-thread/wllama.wasm': singleThreadWasmUrl,
          };
          if (multiThreadWasmUrl) {
            pathConfig['multi-thread/wllama.wasm'] = multiThreadWasmUrl;
          }

          const wllama = new Wllama(pathConfig, {
            suppressNativeLog: false,
            logger: {
              debug: (...args: unknown[]) => pushLog('debug', args),
              log:   (...args: unknown[]) => pushLog('log', args),
              info:  (...args: unknown[]) => pushLog('info', args),
              warn:  (...args: unknown[]) => pushLog('warn', args),
              error: (...args: unknown[]) => pushLog('error', args),
            },
          });

          console.log(`[${label}] stage2 fetch model`);
          const resp = await fetch(modelServerUrl);
          if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
          const modelBlob = await resp.blob();
          const hdr = new Uint8Array(await modelBlob.slice(0, 4).arrayBuffer());
          if (String.fromCharCode(...hdr) !== 'GGUF') {
            throw new Error(`Bad magic: ${hdr.join(',')}`);
          }
          const modelFile = new File([modelBlob], modelFileName, { type: 'application/octet-stream' });

          console.log(`[${label}] stage3 loadModel n_threads=${nThreads} n_gpu_layers=999`);
          await withTimeout(120_000, 'loadModel', wllama.loadModel([modelFile], {
            n_ctx: 64,
            n_threads: nThreads,
            n_gpu_layers: 999,
            use_mmap: false,
          }));

          const isMultiThread = typeof wllama.isMultithread === 'function'
            ? wllama.isMultithread()
            : (wllama as { useMultiThread?: boolean }).useMultiThread ?? null;
          const numThreads = typeof wllama.getNumThreads === 'function'
            ? wllama.getNumThreads()
            : null;
          console.log(`[${label}] stage4 loaded isMultiThread=${String(isMultiThread)} numThreads=${String(numThreads)}`);

          const stream = await wllama.createCompletion('Hello', {
            nPredict: 8,
            sampling: { temp: 0.0 },
            stream: true,
          });

          let generated = '';
          let tokenCount = 0;
          const iter = (stream as AsyncIterable<{ currentText: string }>)[Symbol.asyncIterator]();
          for (;;) {
            const next = await withTimeout(60_000, `token#${tokenCount + 1}`, iter.next());
            if (next.done) break;
            generated = next.value.currentText;
            tokenCount++;
          }
          console.log(`[${label}] stage5 generated="${generated.slice(0, 80)}" tokens=${tokenCount}`);

          try {
            await Promise.race([
              wllama.exit(),
              new Promise<void>((_, reject) => setTimeout(() => reject(new Error('exit timeout')), 5_000)),
            ]);
          } catch (e) {
            pushLog('warn', [`exit: ${(e as Error).message}`]);
          }

          return {
            success: true,
            generated,
            tokenCount,
            isMultiThread,
            numThreads,
            gpuAdapterInfo,
            logs,
            errors,
          };
        } catch (e: unknown) {
          const err = e as Error;
          await new Promise(r => setTimeout(r, 500));
          return {
            success: false,
            error: err.message,
            stack: err.stack,
            logs,
            errors,
            // Diagnostics for failure triage (see plan section H)
            failureCategory: err.message.includes('timed out')
              ? 'webgpu-asyncify-inference-timeout'
              : 'webgpu-asyncify-runtime-init-failed',
          };
        }
      }, {
        label: tc.label,
        gluePath,
        modelServerUrl,
        modelFileName,
        singleThreadWasmUrl,
        multiThreadWasmUrl,
        nThreads: tc.nThreads,
      });

      // Diagnostic output for triage
      const keyLogs = (result.logs as [string, string][]).filter(
        ([level, msg]) =>
          level === 'error' || level === 'warn' ||
          msg.includes('stage') || msg.includes('thread') || msg.includes('webgpu') ||
          msg.includes('BigInt') || msg.includes('NaN') || msg.includes('abort'),
      );
      for (const [level, msg] of keyLogs.slice(-40)) {
        console.log(`[diag:${tc.label}:${level}] ${msg.slice(0, 400)}`);
      }

      if (!result.success) {
        console.error(`[${tc.label}] FAILED: ${result.error}`);
        if ((result as { failureCategory?: string }).failureCategory) {
          console.error(`[${tc.label}] failureCategory=${(result as { failureCategory?: string }).failureCategory}`);
        }
        if (result.stack) console.error(result.stack);
      } else {
        const r = result as {
          generated: string; tokenCount: number; isMultiThread: unknown;
          numThreads: unknown; gpuAdapterInfo: unknown;
        };
        console.log(
          `[${tc.label}] PASS generated="${r.generated.slice(0, 80)}"` +
          ` tokens=${r.tokenCount} isMultiThread=${String(r.isMultiThread)}` +
          ` numThreads=${String(r.numThreads)} gpuAdapter=${JSON.stringify(r.gpuAdapterInfo)}`,
        );
        if (tc.expectMultiThread && r.isMultiThread === false) {
          console.warn(`[${tc.label}] expected multi-thread but runtime reported single-thread`);
        }
      }

      expect(
        result.success,
        `${tc.label} failed: ${result.error ?? (result.errors as string[] | undefined)?.join('; ')}`,
      ).toBe(true);
      expect(
        ((result as { generated?: string }).generated ?? '').length,
        `${tc.label}: expected generated text`,
      ).toBeGreaterThan(0);

      if (tc.expectMultiThread) {
        expect(
          (result as { isMultiThread?: unknown }).isMultiThread,
          `${tc.label}: expected isMultithread()===true`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Worker runtime-selection path + OPFS load path
// ---------------------------------------------------------------------------
// Tests the actual production path end-to-end:
//   wllamaWorker.ts init → resolveVariant(forceVariant) → loadWllamaClass('webgpu-asyncify')
//   → { type:'load', descriptor:{mode:'opfs-direct',...} } → loadModelFromOpfs()
//
// Gate: skips when artifacts missing OR Asyncify entries are disabled:true
// (forceVariant rejects disabled entries; error contains "rejected":["disabled"]).
// OPFS load test additionally gates on model file being present.
//
// OPFS layout expected by loadModelFromOpfs / inner worker fs.opfs-setup:
//   navigator.storage.getDirectory() / models / {modelId} / {shardFilename}
// ---------------------------------------------------------------------------

const OPFS_TEST_MODEL_ID = 'e2e-asyncify-st-verify';

test.describe('wllamaWorker runtime-selection path (Asyncify)', () => {
  const WORKER_URL = '/src/workers/wllamaWorker.ts';

  interface WorkerMessage {
    id: number;
    type: string;
    [k: string]: unknown;
  }

  // Write model bytes into the OPFS location expected by loadModelFromOpfs:
  //   opfsRoot / models / {modelId} / {shardFilename}
  async function setupOpfsModel(
    page: import('@playwright/test').Page,
    modelServerUrl: string,
    modelId: string,
    shardFilename: string,
  ): Promise<boolean> {
    return page.evaluate(
      async ({ modelServerUrl, modelId, shardFilename }) => {
        try {
          const resp = await fetch(modelServerUrl);
          if (!resp.ok) return false;
          const buf = await resp.arrayBuffer();
          const root = await navigator.storage.getDirectory();
          const modelsDir = await root.getDirectoryHandle('models', { create: true });
          const modelDir = await modelsDir.getDirectoryHandle(modelId, { create: true });
          const fh = await modelDir.getFileHandle(shardFilename, { create: true });
          const writable = await fh.createWritable();
          await writable.write(buf);
          await writable.close();
          return true;
        } catch {
          return false;
        }
      },
      { modelServerUrl, modelId, shardFilename },
    );
  }

  // Clean up OPFS after test: remove the model directory
  async function cleanupOpfsModel(
    page: import('@playwright/test').Page,
    modelId: string,
  ): Promise<void> {
    await page.evaluate(
      async ({ modelId }) => {
        try {
          const root = await navigator.storage.getDirectory();
          const modelsDir = await root.getDirectoryHandle('models', { create: false });
          await modelsDir.removeEntry(modelId, { recursive: true });
        } catch {
          // ignore — directory may not exist
        }
      },
      { modelId },
    );
  }

  // Send one message to the worker and collect all messages until the response
  // with the matching id arrives (or timeout). Does NOT terminate the worker.
  async function sendAndWait(
    page: import('@playwright/test').Page,
    workerHandle: string,
    msg: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<WorkerMessage[]> {
    return page.evaluate(
      async ({ handle, msg, timeoutMs }) => {
        const w = (globalThis as unknown as Record<string, Worker>)[handle];
        if (!w) throw new Error(`Worker handle ${handle} not found`);
        const collected: WorkerMessage[] = [];
        return new Promise<WorkerMessage[]>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`timeout waiting for id=${msg.id}`)), timeoutMs);
          const handler = (ev: MessageEvent<WorkerMessage>) => {
            collected.push(ev.data);
            if (ev.data.id === msg.id) {
              clearTimeout(t);
              w.removeEventListener('message', handler);
              resolve(collected);
            }
          };
          w.addEventListener('message', handler);
          w.postMessage(msg);
        });
      },
      { handle: workerHandle, msg, timeoutMs },
    );
  }

  // Hoist a Worker into globalThis so subsequent evaluate calls can reuse it.
  async function createWorkerHandle(
    page: import('@playwright/test').Page,
    url: string,
    handle: string,
  ): Promise<void> {
    await page.evaluate(
      ({ url, handle }) => {
        const w = new Worker(url, { type: 'module' });
        (globalThis as unknown as Record<string, Worker>)[handle] = w;
      },
      { url, handle },
    );
  }

  async function terminateWorkerHandle(
    page: import('@playwright/test').Page,
    handle: string,
  ): Promise<void> {
    await page.evaluate(
      ({ handle }) => {
        const w = (globalThis as unknown as Record<string, Worker>)[handle];
        if (w) { w.terminate(); delete (globalThis as unknown as Record<string, Worker>)[handle]; }
      },
      { handle },
    );
  }

  // -------------------------------------------------------------------------
  // Shared skip check: returns the skip reason or null if should proceed.
  // -------------------------------------------------------------------------
  function getArtifactSkipReason(): string | null {
    if (!artifactsExist()) {
      return 'Asyncify artifacts absent — run WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 first';
    }
    return null;
  }

  const DISABLED_SKIP_MSG =
    'st-webgpu-asyncify-compat is still disabled:true in variant-table — ' +
    'remove disabled:true after Firefox E2E passes before running this test';

  function isDisabledRejection(errMsg: string): boolean {
    return errMsg.includes('"disabled"') || errMsg.includes('No eligible WASM variant');
  }

  // -------------------------------------------------------------------------
  // Test 1: init path
  // -------------------------------------------------------------------------
  test('st-webgpu-asyncify-compat: init via wllamaWorker selects asyncify glue', async ({ persistentPage: page }) => {
    test.setTimeout(3 * 60_000);

    const skipReason = getArtifactSkipReason();
    if (skipReason) { test.skip(true, skipReason); return; }

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    const handle = '__wllamaWorker_initTest';
    await createWorkerHandle(page, WORKER_URL, handle);

    let messages: WorkerMessage[];
    try {
      messages = await sendAndWait(
        page, handle,
        { id: 1, type: 'init', allowWebGPU: true, wasmVariantOverride: 'st-webgpu-asyncify-compat' },
        90_000,
      );
    } catch (e) {
      await terminateWorkerHandle(page, handle);
      throw e;
    }
    await terminateWorkerHandle(page, handle);

    const initResponse = messages.find(m => m.id === 1) ?? null;

    for (const msg of messages) {
      if (msg.type === '__diagnostic') {
        console.log(`[worker-diag] phase=${msg.phase} payload=${JSON.stringify(msg.payload).slice(0, 200)}`);
      }
    }

    if (initResponse?.type === 'error') {
      const errMsg = String(initResponse.message ?? '');
      if (isDisabledRejection(errMsg)) { test.skip(true, DISABLED_SKIP_MSG); return; }
      throw new Error(`wllamaWorker init failed unexpectedly: ${errMsg}`);
    }

    expect(initResponse?.type, 'expected worker ready').toBe('ready');

    const workerInitDiag = messages.find(m => m.type === '__diagnostic' && m.phase === 'worker-init');
    expect(workerInitDiag, '__diagnostic worker-init not found').toBeTruthy();
    const initPayload = workerInitDiag!.payload as Record<string, unknown>;
    expect(initPayload.variantId, 'variant should be st-webgpu-asyncify-compat').toBe('st-webgpu-asyncify-compat');

    const variantDiag = messages.find(m => m.type === '__diagnostic' && m.phase === 'variant-selection');
    expect(variantDiag, '__diagnostic variant-selection not found').toBeTruthy();
    const selPayload = variantDiag!.payload as Record<string, unknown>;
    expect(selPayload.chosen, 'chosen variant should be st-webgpu-asyncify-compat').toBe('st-webgpu-asyncify-compat');

    console.log('[worker-selection-path] PASS init: variant=st-webgpu-asyncify-compat glue=webgpu-asyncify');
  });

  // -------------------------------------------------------------------------
  // Test 2: OPFS load path (loadModelFromOpfs)
  // -------------------------------------------------------------------------
  test('st-webgpu-asyncify-compat: load via loadModelFromOpfs (OPFS direct)', async ({ persistentPage: page }) => {
    test.setTimeout(10 * 60_000);

    const skipReason = getArtifactSkipReason();
    if (skipReason) { test.skip(true, skipReason); return; }

    if (!fs.existsSync(MODEL_PATH)) {
      test.skip(true, `Model file not found: ${MODEL_PATH}`);
      return;
    }

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    // Prepare model server and write model into OPFS
    const srv = await getModelServer();
    const modelFileName = path.basename(MODEL_PATH);
    const modelServerUrl = `http://127.0.0.1:${srv.port}/`;
    console.log(`[opfs-load] writing model to OPFS models/${OPFS_TEST_MODEL_ID}/${modelFileName}`);
    const written = await setupOpfsModel(page, modelServerUrl, OPFS_TEST_MODEL_ID, modelFileName);
    if (!written) {
      test.skip(true, 'Failed to write model to OPFS (fetch or storage error)');
      return;
    }
    console.log('[opfs-load] OPFS write complete');

    const handle = '__wllamaWorker_opfsTest';
    await createWorkerHandle(page, WORKER_URL, handle);
    let initMessages: WorkerMessage[];
    try {
      initMessages = await sendAndWait(
        page, handle,
        { id: 1, type: 'init', allowWebGPU: true, wasmVariantOverride: 'st-webgpu-asyncify-compat' },
        90_000,
      );
    } catch (e) {
      await terminateWorkerHandle(page, handle);
      await cleanupOpfsModel(page, OPFS_TEST_MODEL_ID);
      throw e;
    }

    const initResponse = initMessages.find(m => m.id === 1) ?? null;
    if (initResponse?.type === 'error') {
      const errMsg = String(initResponse.message ?? '');
      await terminateWorkerHandle(page, handle);
      await cleanupOpfsModel(page, OPFS_TEST_MODEL_ID);
      if (isDisabledRejection(errMsg)) { test.skip(true, DISABLED_SKIP_MSG); return; }
      throw new Error(`wllamaWorker init failed: ${errMsg}`);
    }
    expect(initResponse?.type, 'worker init should succeed').toBe('ready');
    console.log('[opfs-load] worker init OK, sending load message');

    // Send the load message: wllamaWorker.handleLoad → wllama.loadModelFromOpfs
    let loadMessages: WorkerMessage[];
    try {
      loadMessages = await sendAndWait(
        page, handle,
        {
          id: 2,
          type: 'load',
          descriptor: {
            mode: 'opfs-direct',
            modelId: OPFS_TEST_MODEL_ID,
            shards: [modelFileName],
          },
          expectedContextLength: 64,
        },
        5 * 60_000,
      );
    } catch (e) {
      await terminateWorkerHandle(page, handle);
      await cleanupOpfsModel(page, OPFS_TEST_MODEL_ID);
      throw e;
    } finally {
      await terminateWorkerHandle(page, handle);
      await cleanupOpfsModel(page, OPFS_TEST_MODEL_ID);
    }

    const loadResponse = loadMessages.find(m => m.id === 2) ?? null;

    for (const msg of [...initMessages, ...loadMessages]) {
      if (msg.type === '__diagnostic' || msg.type === '__load_progress') {
        console.log(`[worker-diag] type=${msg.type} phase=${String(msg.phase ?? msg.percent ?? '')} detail=${String(msg.detail ?? JSON.stringify(msg.payload ?? '')).slice(0, 120)}`);
      }
    }

    if (loadResponse?.type === 'error') {
      throw new Error(`wllamaWorker load failed: ${String(loadResponse.message ?? '')}`);
    }
    expect(loadResponse?.type, 'load should return done').toBe('done');
    console.log('[opfs-load] PASS: loadModelFromOpfs succeeded via wllamaWorker with st-webgpu-asyncify-compat');
  });
});
