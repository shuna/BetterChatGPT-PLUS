/**
 * Web Worker for wllama (llama.cpp WASM) inference.
 *
 * Runs in a dedicated worker thread. Communicates with the main thread via
 * a request/response message protocol modeled after tokenizerWorker.ts.
 *
 * Status lifecycle: init → load (File/Blob) → generate ⇄ ready → unload
 *
 * WASM is loaded in single-thread mode by default (no COOP/COEP requirement).
 * Multi-thread support is added in Phase 8 after COOP/COEP headers are configured.
 */

import { Wllama } from '@wllama/wllama';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let wllama: Wllama | null = null;
let currentAbortController: AbortController | null = null;

// ---------------------------------------------------------------------------
// WASM path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve WASM binary paths relative to the worker's location.
 * In Vite, `new URL(path, import.meta.url)` resolves correctly for both
 * dev and production builds.
 */
function getWasmPaths() {
  // wllama requires an AssetsPathConfig with at least single-thread WASM.
  // The WASM files are in @wllama/wllama/esm/{single,multi}-thread/wllama.wasm
  // Vite resolves these at build time via import.meta.url.
  return {
    'single-thread/wllama.wasm': new URL(
      '@wllama/wllama/esm/single-thread/wllama.wasm',
      import.meta.url,
    ).href,
    'multi-thread/wllama.wasm': new URL(
      '@wllama/wllama/esm/multi-thread/wllama.wasm',
      import.meta.url,
    ).href,
  };
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface InitRequest { id: number; type: 'init' }
interface LoadRequest { id: number; type: 'load'; file: File }
interface GenerateRequest {
  id: number;
  type: 'generate';
  prompt: string;
  maxTokens: number;
  temperature: number;
  stop?: string[];
}
interface AbortRequest { id: number; type: 'abort' }
interface UnloadRequest { id: number; type: 'unload' }

type WorkerRequest = InitRequest | LoadRequest | GenerateRequest | AbortRequest | UnloadRequest;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function respond(id: number, type: string, payload: Record<string, unknown> = {}) {
  self.postMessage({ id, type, ...payload });
}

function respondError(id: number, message: string) {
  self.postMessage({ id, type: 'error', message });
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

async function handleInit(req: InitRequest) {
  try {
    const paths = getWasmPaths();
    wllama = new Wllama(paths, {
      suppressNativeLog: true,
    });
    respond(req.id, 'ready');
  } catch (e) {
    respondError(req.id, `Init failed: ${(e as Error).message}`);
  }
}

async function handleLoad(req: LoadRequest) {
  if (!wllama) {
    respondError(req.id, 'Worker not initialized. Call init first.');
    return;
  }

  try {
    // wllama.loadModel accepts Blob[] — wrap the single File in an array
    await wllama.loadModel([req.file], {
      n_ctx: 2048,
      n_threads: 1,  // Single-thread until COOP/COEP is configured (Phase 8)
    });

    const info = wllama.getLoadedContextInfo();
    respond(req.id, 'loaded', {
      contextLength: info.n_ctx,
      nVocab: info.n_vocab,
      nLayer: info.n_layer,
    });
  } catch (e) {
    respondError(req.id, `Model load failed: ${(e as Error).message}`);
  }
}

async function handleGenerate(req: GenerateRequest) {
  if (!wllama || !wllama.isModelLoaded()) {
    respondError(req.id, 'No model loaded');
    return;
  }

  currentAbortController = new AbortController();

  try {
    // wllama only supports stopTokens (token IDs), not string stop sequences.
    // Multi-token stop strings cannot be reliably mapped to single token IDs,
    // so we handle string stops via post-processing on the streamed text.
    const stopStrings = req.stop ?? [];

    const stream = await wllama.createCompletion(req.prompt, {
      nPredict: req.maxTokens,
      sampling: {
        temp: req.temperature,
      },
      abortSignal: currentAbortController.signal,
      stream: true,
    });

    let fullText = '';
    let tokensGenerated = 0;
    let stopped = false;

    for await (const chunk of stream) {
      fullText = chunk.currentText;
      tokensGenerated++;

      // Check if any stop sequence appears in the generated text
      if (stopStrings.length > 0) {
        for (const stop of stopStrings) {
          const idx = fullText.indexOf(stop);
          if (idx !== -1) {
            fullText = fullText.slice(0, idx);
            stopped = true;
            break;
          }
        }
      }

      respond(req.id, 'chunk', { text: fullText });

      if (stopped) {
        currentAbortController?.abort();
        break;
      }
    }

    respond(req.id, 'done', { fullText, tokensGenerated });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      respond(req.id, 'done', { fullText: '', tokensGenerated: 0, aborted: true });
    } else {
      respondError(req.id, `Generation failed: ${err.message}`);
    }
  } finally {
    currentAbortController = null;
  }
}

function handleAbort(_req: AbortRequest) {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  // No response needed for abort — the generate handler will send done/error
}

async function handleUnload(req: UnloadRequest) {
  try {
    if (wllama) {
      await wllama.exit();
      wllama = null;
    }
    respond(req.id, 'unloaded');
  } catch (e) {
    respondError(req.id, `Unload failed: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;

  switch (req.type) {
    case 'init':
      await handleInit(req);
      break;
    case 'load':
      await handleLoad(req);
      break;
    case 'generate':
      await handleGenerate(req);
      break;
    case 'abort':
      handleAbort(req);
      break;
    case 'unload':
      await handleUnload(req);
      break;
    default:
      respondError((req as { id: number }).id, `Unknown message type: ${(req as { type: string }).type}`);
  }
};
