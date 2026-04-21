import { test, expect } from './helpers/persistent-chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const BASE_URL = 'http://localhost:5173/';
const WASM_ASSET_VERSION = '20260421-pr2-timedwaitany-fix';
const MODEL_PATH = '/Users/suzuki/Downloads/smollm2-360m-instruct-q8_0.gguf';

function startModelFileServer(filePath: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return; }
      const stat = fs.statSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': stat.size, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

test('mt-cpu-compat-diag', async ({ persistentPage: page }) => {
  test.setTimeout(90_000);
  const srv = await startModelFileServer(MODEL_PATH);
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    
    const modelFileName = path.basename(MODEL_PATH);
    const modelServerUrl = `http://127.0.0.1:${srv.port}/`;
    const stWasmUrl = `http://localhost:5173/vendor/wllama/single-thread-cpu-compat.wasm?v=${WASM_ASSET_VERSION}`;
    const mtWasmUrl = `http://localhost:5173/vendor/wllama/multi-thread-cpu-compat.wasm?v=${WASM_ASSET_VERSION}`;
    const gluePath = '/src/vendor/wllama/index.js';

    page.on('console', msg => {
      const text = msg.text();
      if (text.length > 0) console.log(`[BROWSER] ${text.slice(0, 500)}`);
    });

    const result = await page.evaluate(async ({ modelServerUrl, modelFileName, stWasmUrl, mtWasmUrl, gluePath }) => {
      const logs: string[] = [];
      const log = (s: string) => { logs.push(s); console.log(s); };

      try {
        log('STEP1: importing wllama');
        // @ts-ignore
        const { Wllama } = await import(gluePath);
        log('STEP2: wllama imported');

        const pathConfig: Record<string, string> = {
          'single-thread/wllama.wasm': stWasmUrl,
          'multi-thread/wllama.wasm': mtWasmUrl,
        };

        const wllama = new Wllama(pathConfig, {
          suppressNativeLog: false,
          logger: {
            debug: (...a: unknown[]) => { const m = a.map(String).join(' '); if (m.includes('wllama-') || m.includes('thread') || m.includes('pthread') || m.includes('Worker')) console.log('[wllama:debug]', m.slice(0, 200)); },
            log: (...a: unknown[]) => {},
            info: (...a: unknown[]) => {},
            warn: (...a: unknown[]) => { const m = a.map(String).join(' '); console.log('[wllama:WARN]', m.slice(0, 300)); },
            error: (...a: unknown[]) => { const m = a.map(String).join(' '); console.log('[wllama:ERROR]', m.slice(0, 300)); },
          },
        });

        log('STEP3: fetching model');
        const resp = await fetch(modelServerUrl);
        const modelBlob = await resp.blob();
        log(`STEP4: model blob size=${modelBlob.size}`);

        const hdr = new Uint8Array(await modelBlob.slice(0, 4).arrayBuffer());
        const magic = String.fromCharCode(...hdr);
        if (magic !== 'GGUF') throw new Error(`Bad magic: ${magic}`);

        const modelFile = new File([modelBlob], modelFileName, { type: 'application/octet-stream' });

        log('STEP5: loadModel n_threads=4 timeout=30s');
        await Promise.race([
          wllama.loadModel([modelFile], { n_ctx: 64, n_threads: 4, use_mmap: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('loadModel timeout 30s')), 30_000)),
        ]);
        
        const isMultiThread = wllama.isMultithread?.() ?? null;
        log(`STEP6: loadModel done — isMultiThread=${isMultiThread}`);

        // Now check PThread state BEFORE first decode
        // @ts-ignore
        const runningWorkers = (window as any).__wllamaPThreadCount ?? 'N/A';
        log(`STEP6.5: About to decode (pthreads created by pthread_create should be starting)`);

        log('STEP7: tokenize Hello');
        // tokenize is the first action that calls decode-related ops
        
        // Try a single decode with very short timeout to catch the deadlock quickly
        await Promise.race([
          (async () => {
            const stream = await wllama.createCompletion('Hello', {
              nPredict: 2,
              sampling: { temp: 0.0 },
              stream: true,
            });
            let gen = '';
            for await (const chunk of stream as AsyncIterable<{ currentText: string }>) {
              gen = chunk.currentText;
              log(`STEP8: token generated: "${gen.slice(0, 30)}"`);
            }
            log(`STEP9: generation complete: "${gen}"`);
            return gen;
          })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('createCompletion timeout 45s')), 45_000)),
        ]);

        await wllama.exit();
        return { success: true, logs };
      } catch (e: unknown) {
        const err = e as Error;
        await new Promise(r => setTimeout(r, 500));
        return { success: false, error: err.message, logs };
      }
    }, { modelServerUrl, modelFileName, stWasmUrl, mtWasmUrl, gluePath });

    console.log(`\nResult: success=${result.success}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }
    console.log('Logs:', result.logs.join('\n'));
  } finally {
    srv.close();
  }
});
