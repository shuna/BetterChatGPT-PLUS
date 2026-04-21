/**
 * WASM variant smoke test — verify all 4 execution paths after the raw-export refactor.
 *
 * Tests (in order):
 *   A) SmolLM2 1.7B (≤2 GB) + WebGPU  → single-thread-webgpu-compat.wasm (compat+JSPI)
 *   B) Bonsai-8B    (>2 GB) + WebGPU  → single-thread-webgpu-compat.wasm (compat+JSPI; no WebGPU mem64 variant built)
 *   C) SmolLM2 1.7B           + CPU    → single-thread-cpu-compat.wasm   (compat, sync)
 *   D) Bonsai-8B               + CPU   → single-thread-cpu-mem64.wasm    (Memory64, sync)
 *
 * Requires:
 *   - Vite dev server running on http://localhost:5173
 *   - Model files at /Volumes/2TB-LLM/wllama-verification/Original/
 *
 * Run:
 *   cd /Users/suzuki/weavelet-canvas && npx playwright test tests/wasm-variant-verify.spec.ts --headed --config playwright.config.ts
 */

import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { test, expect } from './helpers/persistent-chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const BASE_URL = 'http://localhost:5173/';
// 検証のための変更: PR2 後の版に合わせる。モデルは手元の 360M Q8_0 のみ使用。
const MODEL_DIR = '/Users/suzuki/Downloads';
const MODEL_FILE = 'smollm2-360m-instruct-q8_0.gguf';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const WASM_ASSET_VERSION = '20260421-pr2-timedwaitany-fix';

interface WasmTestCase {
  label: string;
  modelPath: string;
  /** false → compat, true → memory64 */
  preferMemory64: boolean;
  allowWebGPU: boolean;
  expectedWasm: string;
  /** Browser-accessible URL path for the JS glue bundle. Authoritative — never derive from allowWebGPU. */
  gluePath: string;
}

const CASES: WasmTestCase[] = [
  { label: 'A) SmolLM2-360M + WebGPU → webgpu-compat', modelPath: MODEL_PATH, preferMemory64: false, allowWebGPU: true,  expectedWasm: 'single-thread-webgpu-compat.wasm', gluePath: '/src/vendor/wllama/webgpu-index.js' },
  { label: 'B) SmolLM2-360M + CPU → cpu-compat',        modelPath: MODEL_PATH, preferMemory64: false, allowWebGPU: false, expectedWasm: 'single-thread-cpu-compat.wasm',      gluePath: '/src/vendor/wllama/index.js' },
  { label: 'C) SmolLM2-360M + CPU → cpu-mem64',         modelPath: MODEL_PATH, preferMemory64: true,  allowWebGPU: false, expectedWasm: 'single-thread-cpu-mem64.wasm',       gluePath: '/src/vendor/wllama/mem64-index.js' },
];

/** Simple file server for GGUF; avoids page.evaluate base64 conversion of large files */
function startModelServer(modelDir: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(req.url!.slice(1));
      const filePath = path.join(modelDir, name);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end();
        return;
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

// Use non-serial describe so a WebGPU environment failure does not block CPU cases.
test.describe('WASM variant verification', () => {
  let modelServer: { port: number; close: () => void };

  test.beforeAll(async () => {
    if (!fs.existsSync(MODEL_PATH)) {
      console.warn(`WARNING: model file not found: ${MODEL_PATH}`);
    }
    modelServer = await startModelServer(MODEL_DIR);
    console.log(`Model server started on port ${modelServer.port}`);
  });

  test.afterAll(() => {
    modelServer?.close();
  });

  for (const tc of CASES) {
    test(tc.label, async ({ persistentContext, persistentPage: page }) => {
      test.setTimeout(10 * 60_000);

      if (!fs.existsSync(tc.modelPath)) {
        test.skip(true, `Model file not found: ${tc.modelPath}`);
        return;
      }

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

      const wasmFile = tc.expectedWasm;
      const modelFileName = path.basename(tc.modelPath);
      const modelServerUrl = `http://127.0.0.1:${modelServer.port}/${encodeURIComponent(modelFileName)}`;
      const wasmUrl = `http://localhost:5173/vendor/wllama/${wasmFile}?v=${WASM_ASSET_VERSION}`;
      const allowWebGPU = tc.allowWebGPU;

      console.log(`[${tc.label}] Testing WASM: ${wasmFile}`);
      console.log(`[${tc.label}] Model: ${modelFileName} (${allowWebGPU ? 'WebGPU' : 'CPU'})`);
      console.log(`[${tc.label}] Model server: ${modelServerUrl}`);

      // Capture browser console in real-time so we can diagnose hangs
      page.on('console', msg => {
        const text = msg.text();
        if (text.length > 0) {
          console.log(`  [BROWSER:${msg.type()}] ${text.slice(0, 300)}`);
        }
      });

      const result = await page.evaluate(async ({ wasmUrl, modelServerUrl, modelFileName, allowWebGPU, gluePath }) => {
        const logs: [string, string][] = [];
        const errors: string[] = [];

        const withLoadTimeout = <T>(ms: number, step: string, p: Promise<T>): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error(
                `"${step}" timed out after ${ms}ms — check WASM/glue ABI mismatch or inner worker crash`,
              )), ms)
            ),
          ]);

        try {
          console.log(`[STAGE 1] importing wllama gluePath=${gluePath}`);
          // For WebGPU cases, verify the adapter is available first.
          if (allowWebGPU) {
            const adapter = typeof navigator !== 'undefined' && 'gpu' in navigator
              ? await (navigator as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
              : null;
            if (!adapter) {
              console.log('[STAGE 1.5] WebGPU adapter unavailable — skipping WebGPU test');
              return { success: null, generated: '', logs, errors, skipped: true, skipReason: 'WebGPU adapter unavailable' };
            }
            // SwiftShader known issue: JSPI callback stalls in headless Playwright.
            const adapterInfo = (adapter as { info?: { vendor?: string; device?: string } }).info ?? {};
            const isSwiftShader = (adapterInfo.vendor ?? '').toLowerCase().includes('google')
              && (adapterInfo.device ?? '').toLowerCase().includes('swiftshader');
            if (isSwiftShader) {
              console.warn('[known-issue:swiftshader-jspi-callback-stall] WebGPU on SwiftShader skipped — JSPI callback unreliable in headless Playwright');
              return { success: null, generated: '', logs, errors, skipped: true, skipReason: 'SwiftShader: known JSPI callback stall (swiftshader-jspi-callback-stall)' };
            }
            console.log('[STAGE 1.5] WebGPU adapter available');
          }
          // Each glue bundle embeds a different LLAMA_CPP_WORKER_CODE (compat/mem64/webgpu ABI).
          // gluePath is authoritative — do not substitute based on allowWebGPU.
          // @ts-ignore
          const mod = await import(gluePath);
          const { Wllama } = mod;
          console.log('[STAGE 2] wllama imported');

          const pathConfig = {
            'single-thread/wllama.wasm': wasmUrl,
          };

          const wllama = new Wllama(pathConfig, {
            suppressNativeLog: false,
            logger: {
              debug: (...a: unknown[]) => { const m = a.map(String).join(' '); logs.push(['debug', m]); if (m.includes('map error') || m.includes('Failed') || m.includes('ABORT') || m.includes('wllama-load')) console.log('[wllama:debug]', m.slice(0, 200)); },
              log:   (...a: unknown[]) => { const m = a.map(String).join(' '); logs.push(['log',   m]); },
              info:  (...a: unknown[]) => { const m = a.map(String).join(' '); logs.push(['info',  m]); },
              warn:  (...a: unknown[]) => { const m = a.map(String).join(' '); logs.push(['warn', m]); errors.push(m); console.log('[wllama:warn]', m.slice(0, 200)); },
              error: (...a: unknown[]) => { const m = a.map(String).join(' '); logs.push(['error', m]); errors.push(m); console.log('[wllama:error]', m.slice(0, 200)); },
            },
          });

          // Fetch the model from the local server (fast, no copy)
          console.log('[STAGE 3] fetching model');
          const resp = await fetch(modelServerUrl);
          if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
          const modelBlob = await resp.blob();
          console.log(`[STAGE 4] model blob received size=${modelBlob.size}`);
          logs.push(['debug', `blob size=${modelBlob.size}`]);
          // Validate GGUF magic
          const hdr = new Uint8Array(await modelBlob.slice(0, 4).arrayBuffer());
          const magic = String.fromCharCode(...hdr);
          logs.push(['debug', `blob magic=${magic} (${hdr.join(',')})`]);
          if (magic !== 'GGUF') throw new Error(`Blob magic mismatch: expected GGUF got ${magic}`);
          const modelFile = new File([modelBlob], modelFileName, { type: 'application/octet-stream' });

          console.log('[STAGE 5] calling loadModel n_gpu_layers=' + (allowWebGPU ? 999 : 0) + ' timeout=120s');
          await withLoadTimeout(120_000, 'loadModel', wllama.loadModel([modelFile], {
            n_ctx: 64,
            n_threads: 1,
            n_gpu_layers: allowWebGPU ? 999 : 0,
            use_mmap: false,
          }));
          console.log('[STAGE 6] loadModel complete, starting generation');

          let generated = '';
          const stream = await wllama.createCompletion('Hello', {
            nPredict: 8,
            sampling: { temp: 0.0 },
            stream: true,
          });
          for await (const chunk of stream) {
            generated = (chunk as { currentText: string }).currentText;
          }
          console.log('[STAGE 7] generation complete: ' + generated.slice(0, 60));

          await wllama.exit();
          return { success: true, generated, logs, errors };
        } catch (e: unknown) {
          const err = e as Error;
          // Wait a bit for any queued postMessage from JSPI fiber to arrive
          await new Promise(r => setTimeout(r, 500));
          return { success: false, error: err.message, stack: err.stack, logs, errors };
        }
      }, { wasmUrl, modelServerUrl, modelFileName, allowWebGPU, gluePath: tc.gluePath });

      // Print diagnostic logs
      const keyLogs = (result.logs as [string, string][]).filter(
        ([level, msg]) => level === 'error' || level === 'warn'
          || msg.includes('NaN') || msg.includes('BigInt') || msg.includes('wllama-')
          || msg.includes('inner-cwrap') || msg.includes('wasm') || msg.includes('blob')
          || msg.includes('magic') || msg.includes('ptr') || msg.includes('size=')
          || msg.includes('patchMEMFS') || msg.includes('heapfs') || msg.includes('memfs-read')
          || msg.includes('patchStream')
      );
      for (const [level, msg] of keyLogs.slice(-50)) {
        console.log(`  [${level}] ${msg.slice(0, 300)}`);
      }

      if ((result as { skipped?: boolean }).skipped) {
        console.log(`[${tc.label}] SKIPPED — ${(result as { skipReason?: string }).skipReason}`);
        test.skip(true, (result as { skipReason?: string }).skipReason);
        return;
      } else if (!result.success) {
        console.error(`[${tc.label}] FAILED: ${result.error}`);
        if (result.stack) console.error(result.stack);
        if (result.errors.length) console.error('Errors:', result.errors.join('\n'));
        // Print ALL logs on failure for full diagnosis
        console.log(`--- All logs (${(result.logs as any[]).length} entries) ---`);
        for (const [level, msg] of (result.logs as [string, string][]).slice(-60)) {
          console.log(`  [${level}] ${msg.slice(0, 200)}`);
        }
      } else {
        console.log(`[${tc.label}] PASS — generated: "${result.generated.slice(0, 80)}"`);
      }

      expect(result.success, `${tc.label} failed: ${result.error ?? result.errors.join('; ')}`).toBe(true);
      expect((result.generated ?? '').length, `${tc.label}: expected some generated text`).toBeGreaterThan(0);
    });
  }
});
