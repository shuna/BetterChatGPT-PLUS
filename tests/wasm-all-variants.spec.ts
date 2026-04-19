import { test, expect } from './helpers/persistent-chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const BASE_URL = 'http://localhost:5173/';
const WASM_ASSET_VERSION = '20260420-pr2-rename';
const MODEL_PATH = '/Users/suzuki/Downloads/smollm2-360m-instruct-q8_0.gguf';

interface VariantCase {
  label: string;
  singleThreadWasm: string;
  multiThreadWasm: string | null;
  nThreads: number;
  allowWebGPU: boolean;
  expectMultiThread: boolean;
}

const CASES: VariantCase[] = [
  {
    label: 'single-thread-cpu-compat',
    singleThreadWasm: 'single-thread-cpu-compat.wasm',
    multiThreadWasm: null,
    nThreads: 1,
    allowWebGPU: false,
    expectMultiThread: false,
  },
  {
    label: 'single-thread-cpu-mem64',
    singleThreadWasm: 'single-thread-cpu-mem64.wasm',
    multiThreadWasm: null,
    nThreads: 1,
    allowWebGPU: false,
    expectMultiThread: false,
  },
  {
    label: 'multi-thread-cpu-compat',
    singleThreadWasm: 'single-thread-cpu-compat.wasm',
    multiThreadWasm: 'multi-thread-cpu-compat.wasm',
    nThreads: 4,
    allowWebGPU: false,
    expectMultiThread: true,
  },
  {
    label: 'multi-thread-cpu-mem64',
    singleThreadWasm: 'single-thread-cpu-mem64.wasm',
    multiThreadWasm: 'multi-thread-cpu-mem64.wasm',
    nThreads: 4,
    allowWebGPU: false,
    expectMultiThread: true,
  },
  {
    label: 'single-thread-webgpu-compat',
    singleThreadWasm: 'single-thread-webgpu-compat.wasm',
    multiThreadWasm: null,
    nThreads: 1,
    allowWebGPU: true,
    expectMultiThread: false,
  },
  {
    label: 'single-thread-webgpu',
    singleThreadWasm: 'single-thread-webgpu.wasm',
    multiThreadWasm: null,
    nThreads: 1,
    allowWebGPU: true,
    expectMultiThread: false,
  },
  {
    label: 'multi-thread-webgpu-compat',
    singleThreadWasm: 'single-thread-webgpu-compat.wasm',
    multiThreadWasm: 'multi-thread-webgpu-compat.wasm',
    nThreads: 4,
    allowWebGPU: true,
    expectMultiThread: true,
  },
  {
    label: 'multi-thread-webgpu',
    singleThreadWasm: 'single-thread-webgpu.wasm',
    multiThreadWasm: 'multi-thread-webgpu.wasm',
    nThreads: 4,
    allowWebGPU: true,
    expectMultiThread: true,
  },
];

function startModelFileServer(filePath: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
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

// Shared model server – started once, shared across all tests in describe.
let _modelServer: { port: number; close: () => void } | null = null;

async function getModelServer(filePath: string): Promise<{ port: number; close: () => void }> {
  if (!_modelServer) {
    _modelServer = await startModelFileServer(filePath);
    console.log(`Model server started on port ${_modelServer.port}`);
  }
  return _modelServer;
}

test.describe('WASM all variants inference', () => {
  test.afterAll(() => {
    _modelServer?.close();
    _modelServer = null;
  });

  for (const tc of CASES) {
    test(tc.label, async ({ persistentPage: page }) => {
      // Per-variant timeout: 5 min for single-thread, 8 min for multi/webgpu
      test.setTimeout(tc.expectMultiThread || tc.allowWebGPU ? 8 * 60_000 : 5 * 60_000);

      if (!fs.existsSync(MODEL_PATH)) {
        test.skip(true, `Model file not found: ${MODEL_PATH}`);
        return;
      }

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

      const modelFileName = path.basename(MODEL_PATH);
      const srv = await getModelServer(MODEL_PATH);
      const modelServerUrl = `http://127.0.0.1:${srv.port}/`;
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
        modelServerUrl,
        modelFileName,
        singleThreadWasmUrl,
        multiThreadWasmUrl,
        nThreads,
        allowWebGPU,
      }) => {
        const logs: [string, string][] = [];
        const errors: string[] = [];

        const pushLog = (level: string, args: unknown[]) => {
          const msg = args.map(String).join(' ');
          logs.push([level, msg]);
          if (level === 'warn' || level === 'error') {
            errors.push(msg);
          }
        };

        try {
          console.log(`[${label}] stage1 import`);
          // WebGPU WASM variants require the WebGPU JS glue (different memory export key);
          // CPU WASM variants use the CPU glue built with the same emsdk version.
          const modulePath = allowWebGPU
            ? '/src/vendor/wllama/webgpu-index.js'
            : '/src/vendor/wllama/index.js';
          // @ts-ignore
          const mod = await import(modulePath);
          const { Wllama } = mod;
          console.log(`[${label}] stage2 imported`);

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
              log: (...args: unknown[]) => pushLog('log', args),
              info: (...args: unknown[]) => pushLog('info', args),
              warn: (...args: unknown[]) => pushLog('warn', args),
              error: (...args: unknown[]) => pushLog('error', args),
            },
          });

          console.log(`[${label}] stage3 fetch model`);
          const resp = await fetch(modelServerUrl);
          if (!resp.ok) {
            throw new Error(`Model fetch failed: ${resp.status}`);
          }
          const modelBlob = await resp.blob();
          const hdr = new Uint8Array(await modelBlob.slice(0, 4).arrayBuffer());
          const magic = String.fromCharCode(...hdr);
          if (magic !== 'GGUF') {
            throw new Error(`Bad magic: ${magic} (${hdr.join(',')})`);
          }
          const modelFile = new File([modelBlob], modelFileName, { type: 'application/octet-stream' });

          console.log(`[${label}] stage4 loadModel n_threads=${nThreads} n_gpu_layers=${allowWebGPU ? 999 : 0}`);
          await wllama.loadModel([modelFile], {
            n_ctx: 64,
            n_threads: nThreads,
            n_gpu_layers: allowWebGPU ? 999 : 0,
            use_mmap: false,
          });

          const isMultiThread = typeof wllama.isMultithread === 'function'
            ? wllama.isMultithread()
            : (wllama as { useMultiThread?: boolean }).useMultiThread ?? null;
          const numThreads = typeof wllama.getNumThreads === 'function'
            ? wllama.getNumThreads()
            : null;
          console.log(`[${label}] stage5 load complete isMultiThread=${String(isMultiThread)} numThreads=${String(numThreads)}`);

          // Per-step inference timeout: catch hangs quickly rather than waiting full test timeout
          const withStepTimeout = <T>(ms: number, step: string, p: Promise<T>): Promise<T> =>
            Promise.race([
              p,
              new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`step "${step}" timed out after ${ms}ms`)), ms)
              ),
            ]);

          console.log(`[${label}] stage5.1 creating stream`);
          const stream = await wllama.createCompletion('Hello', {
            nPredict: 8,
            sampling: { temp: 0.0 },
            stream: true,
          });
          console.log(`[${label}] stage5.2 stream created, iterating (60s per-token timeout)`);

          let generated = '';
          let tokenCount = 0;
          // Explicit per-token timeout so a hung decode surfaces as a clear error
          const iter = (stream as AsyncIterable<{ currentText: string }>)[Symbol.asyncIterator]();
          for (;;) {
            const next = await withStepTimeout(60_000, `token#${tokenCount + 1}`, iter.next());
            if (next.done) break;
            generated = next.value.currentText;
            tokenCount++;
            console.log(`[${label}] stage5.3 token#${tokenCount} text="${generated.slice(0, 40)}"`);
          }
          console.log(`[${label}] stage6 generated=${generated.slice(0, 80)}`);

          let exitTimedOut = false;
          try {
            await Promise.race([
              wllama.exit(),
              new Promise((_, reject) => setTimeout(() => {
                exitTimedOut = true;
                reject(new Error('wllama.exit timeout'));
              }, 5000)),
            ]);
          } catch (e) {
            pushLog('warn', [`exit warning: ${(e as Error).message}`]);
          }
          return { success: true, generated, isMultiThread, numThreads, logs, errors, exitTimedOut };
        } catch (e: unknown) {
          const err = e as Error;
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            success: false,
            error: err.message,
            stack: err.stack,
            logs,
            errors,
          };
        }
      }, {
        label: tc.label,
        modelServerUrl,
        modelFileName,
        singleThreadWasmUrl,
        multiThreadWasmUrl,
        nThreads: tc.nThreads,
        allowWebGPU: tc.allowWebGPU,
      });

      const keyLogs = (result.logs as [string, string][]).filter(
        ([level, msg]) => level === 'error'
          || level === 'warn'
          || msg.includes('wllama-')
          || msg.includes('thread')
          || msg.includes('pthread')
          || msg.includes('empty JSON')
          || msg.includes('null')
          || msg.includes('BigInt')
          || msg.includes('NaN')
      );
      for (const [level, msg] of keyLogs.slice(-40)) {
        console.log(`[diag:${tc.label}:${level}] ${msg.slice(0, 400)}`);
      }

      if (!result.success) {
        console.error(`[${tc.label}] FAILED: ${result.error}`);
        if (result.stack) {
          console.error(result.stack);
        }
      } else {
        console.log(`[${tc.label}] PASS generated="${(result.generated ?? '').slice(0, 80)}" isMultiThread=${String(result.isMultiThread)} numThreads=${String(result.numThreads)} exitTimedOut=${String((result as { exitTimedOut?: boolean }).exitTimedOut ?? false)}`);
        if (tc.expectMultiThread && result.isMultiThread === false) {
          console.warn(`[${tc.label}] expected multi-thread but runtime reported single-thread`);
        }
      }

      expect(result.success, `${tc.label} failed: ${result.error ?? result.errors?.join('; ')}`).toBe(true);
      expect((result.generated ?? '').length, `${tc.label}: expected generated text`).toBeGreaterThan(0);
    });
  }
});
