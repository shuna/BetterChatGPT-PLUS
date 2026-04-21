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
