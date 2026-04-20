/**
 * WASM multi-thread vs single-thread verification test.
 *
 * Tests all 4 CPU variants with SmolLM2-360M Q8_0 to verify which work:
 *   A) single-thread-compat (32-bit ST baseline — should always pass)
 *   B) single-thread        (Memory64 ST — should pass on Memory64-capable browsers)
 *   C) multi-thread-compat  (32-bit MT — requires SharedArrayBuffer + crossOriginIsolated)
 *   D) multi-thread         (Memory64 MT — requires both MT env + Memory64)
 *
 * WebGPU variants are excluded — environment-dependent and separate concern.
 *
 * Requires:
 *   - Vite dev server running on http://localhost:5173
 *   - Model file at /Users/suzuki/Downloads/smollm2-360m-instruct-q8_0.gguf
 *
 * Run:
 *   cd /Users/suzuki/weavelet-canvas && npx playwright test tests/wasm-thread-verify.spec.ts --headed --config playwright.config.ts
 */

import { test, expect } from './helpers/persistent-chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const BASE_URL = 'http://localhost:5173/';
const WASM_ASSET_VERSION = '20260421-pr2-active-variants-fix';
const MODEL_PATH = '/Users/suzuki/Downloads/smollm2-360m-instruct-q8_0.gguf';

interface ThreadTestCase {
  label: string;
  singleThreadWasm: string;
  multiThreadWasm: string | null;
  expectMultiThread: boolean;
  nThreads: number;
  /** Browser-accessible URL path for the JS glue bundle. Authoritative — never derive from wasm names. */
  gluePath: string;
}

const CASES: ThreadTestCase[] = [
  {
    label: 'A) single-thread-cpu-compat',
    singleThreadWasm: 'single-thread-cpu-compat.wasm',
    multiThreadWasm: null,
    expectMultiThread: false,
    nThreads: 1,
    gluePath: '/src/vendor/wllama/index.js',
  },
  {
    label: 'B) single-thread-cpu-mem64',
    singleThreadWasm: 'single-thread-cpu-mem64.wasm',
    multiThreadWasm: null,
    expectMultiThread: false,
    nThreads: 1,
    gluePath: '/src/vendor/wllama/mem64-index.js',
  },
  {
    label: 'C) multi-thread-cpu-compat',
    singleThreadWasm: 'single-thread-cpu-compat.wasm',
    multiThreadWasm: 'multi-thread-cpu-compat.wasm',
    expectMultiThread: true,
    nThreads: 4,
    gluePath: '/src/vendor/wllama/index.js',
  },
  {
    label: 'D) multi-thread-cpu-mem64',
    singleThreadWasm: 'single-thread-cpu-mem64.wasm',
    multiThreadWasm: 'multi-thread-cpu-mem64.wasm',
    expectMultiThread: true,
    nThreads: 4,
    gluePath: '/src/vendor/wllama/mem64-index.js',
  },
];

function startModelFileServer(filePath: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end(); return;
      }
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

test.describe.serial('WASM thread variant verification', () => {
  let modelServer: { port: number; close: () => void };

  test.beforeAll(async () => {
    if (!fs.existsSync(MODEL_PATH)) {
      console.warn(`WARNING: model file not found: ${MODEL_PATH}`);
    }
    modelServer = await startModelFileServer(MODEL_PATH);
    console.log(`Model server started on port ${modelServer.port}`);
  });

  test.afterAll(() => {
    modelServer?.close();
  });

  for (const tc of CASES) {
    test(tc.label, async ({ persistentPage: page }) => {
      test.setTimeout(10 * 60_000);

      if (!fs.existsSync(MODEL_PATH)) {
        test.skip(true, `Model file not found: ${MODEL_PATH}`);
        return;
      }

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

      const modelFileName = path.basename(MODEL_PATH);
      const modelServerUrl = `http://127.0.0.1:${modelServer.port}/`;
      const singleThreadWasmUrl = `http://localhost:5173/vendor/wllama/${tc.singleThreadWasm}?v=${WASM_ASSET_VERSION}`;
      const multiThreadWasmUrl = tc.multiThreadWasm
        ? `http://localhost:5173/vendor/wllama/${tc.multiThreadWasm}?v=${WASM_ASSET_VERSION}`
        : null;

      console.log(`[${tc.label}] ST wasm: ${tc.singleThreadWasm}`);
      if (tc.multiThreadWasm) console.log(`[${tc.label}] MT wasm: ${tc.multiThreadWasm}`);

      // Forward browser console in real-time for diagnosing hangs
      page.on('console', msg => {
        const text = msg.text();
        if (text.length > 0) console.log(`  [BROWSER:${msg.type()}] ${text.slice(0, 400)}`);
      });

      const result = await page.evaluate(async ({
        modelServerUrl, modelFileName, singleThreadWasmUrl, multiThreadWasmUrl, nThreads, label, gluePath,
      }) => {
        const logs: [string, string][] = [];
        const errors: string[] = [];

        const withLoadTimeout = <T>(ms: number, step: string, p: Promise<T>): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error(
                `[${label}] "${step}" timed out after ${ms}ms — check WASM/glue ABI mismatch`,
              )), ms)
            ),
          ]);

        try {
          console.log(`[${label}] STAGE 1: importing wllama gluePath=${gluePath}`);
          // @ts-ignore
          const mod = await import(gluePath);
          const { Wllama } = mod;
          console.log(`[${label}] STAGE 2: wllama imported`);

          const pathConfig: Record<string, string> = {
            'single-thread/wllama.wasm': singleThreadWasmUrl,
          };
          if (multiThreadWasmUrl) {
            pathConfig['multi-thread/wllama.wasm'] = multiThreadWasmUrl;
          }

          const wllama = new Wllama(pathConfig, {
            suppressNativeLog: false,
            logger: {
              debug: (...a: unknown[]) => {
                const m = a.map(String).join(' ');
                logs.push(['debug', m]);
                if (m.includes('WASM') || m.includes('thread') || m.includes('pthread') || m.includes('wllama-')) {
                  console.log(`[${label}:debug]`, m.slice(0, 300));
                }
              },
              log:   (...a: unknown[]) => { logs.push(['log',   a.map(String).join(' ')]); },
              info:  (...a: unknown[]) => { logs.push(['info',  a.map(String).join(' ')]); },
              warn:  (...a: unknown[]) => {
                const m = a.map(String).join(' ');
                logs.push(['warn', m]);
                errors.push(m);
                console.log(`[${label}:warn]`, m.slice(0, 300));
              },
              error: (...a: unknown[]) => {
                const m = a.map(String).join(' ');
                logs.push(['error', m]);
                errors.push(m);
                console.log(`[${label}:error]`, m.slice(0, 300));
              },
            },
          });

          console.log(`[${label}] STAGE 3: fetching model`);
          const resp = await fetch(modelServerUrl);
          if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
          const modelBlob = await resp.blob();
          console.log(`[${label}] STAGE 4: blob size=${modelBlob.size}`);

          // Validate GGUF magic
          const hdr = new Uint8Array(await modelBlob.slice(0, 4).arrayBuffer());
          const magic = String.fromCharCode(...hdr);
          if (magic !== 'GGUF') throw new Error(`Bad magic: ${magic} (${hdr.join(',')})`);

          const modelFile = new File([modelBlob], modelFileName, { type: 'application/octet-stream' });

          console.log(`[${label}] STAGE 5: loadModel n_threads=${nThreads} timeout=120s`);
          await withLoadTimeout(120_000, 'loadModel', wllama.loadModel([modelFile], {
            n_ctx: 64,
            n_threads: nThreads,
            use_mmap: false,
          }));

          // Record actual threading state
          const isMultiThread = typeof wllama.isMultithread === 'function'
            ? wllama.isMultithread()
            : (wllama as any).useMultiThread ?? null;
          const numThreads = typeof wllama.getNumThreads === 'function'
            ? wllama.getNumThreads()
            : null;

          console.log(`[${label}] STAGE 6: loadModel done — isMultiThread=${isMultiThread} numThreads=${numThreads}`);

          let generated = '';
          const stream = await wllama.createCompletion('Hello', {
            nPredict: 8,
            sampling: { temp: 0.0 },
            stream: true,
          });
          for await (const chunk of stream) {
            generated = (chunk as { currentText: string }).currentText;
          }
          console.log(`[${label}] STAGE 7: generated="${generated.slice(0, 60)}"`);

          await wllama.exit();
          return { success: true, generated, isMultiThread, numThreads, logs, errors };
        } catch (e: unknown) {
          const err = e as Error;
          await new Promise(r => setTimeout(r, 500));
          return { success: false, error: err.message, stack: err.stack, isMultiThread: null, numThreads: null, logs, errors };
        }
      }, { modelServerUrl, modelFileName, singleThreadWasmUrl, multiThreadWasmUrl, nThreads: tc.nThreads, label: tc.label, gluePath: tc.gluePath });

      // Print key diagnostic logs
      const keyLogs = (result.logs as [string, string][]).filter(
        ([level, msg]) => level === 'error' || level === 'warn'
          || msg.includes('thread') || msg.includes('pthread') || msg.includes('wllama-')
          || msg.includes('SharedArrayBuffer') || msg.includes('Memory') || msg.includes('WASM')
          || msg.includes('NaN') || msg.includes('BigInt'),
      );
      for (const [level, msg] of keyLogs.slice(-30)) {
        console.log(`  [${level}] ${msg.slice(0, 300)}`);
      }

      if (!result.success) {
        console.error(`[${tc.label}] FAILED: ${result.error}`);
        if (result.stack) console.error(result.stack);
        console.log(`--- All logs (${(result.logs as unknown[]).length} entries) ---`);
        for (const [level, msg] of (result.logs as [string, string][]).slice(-40)) {
          console.log(`  [${level}] ${msg.slice(0, 250)}`);
        }
      } else {
        const threadInfo = result.isMultiThread !== null
          ? ` | isMultiThread=${result.isMultiThread} numThreads=${result.numThreads}`
          : '';
        console.log(`[${tc.label}] PASS — generated: "${result.generated?.slice(0, 80)}"${threadInfo}`);

        if (tc.expectMultiThread && result.isMultiThread === false) {
          console.warn(`[${tc.label}] WARNING: expected multi-thread but ran single-thread. Environment may not support SharedArrayBuffer+crossOriginIsolated.`);
        }
      }

      expect(result.success, `${tc.label} failed: ${result.error ?? result.errors?.join('; ')}`).toBe(true);
      expect((result.generated ?? '').length, `${tc.label}: expected some generated text`).toBeGreaterThan(0);
    });
  }
});
