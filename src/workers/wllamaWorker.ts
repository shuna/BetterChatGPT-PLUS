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

// ---------------------------------------------------------------------------
// Worker environment shim
// ---------------------------------------------------------------------------
// The vendored wllama runtime internally calls absoluteUrl() which uses `document.baseURI`.
// Workers have no `document`, so we provide a minimal shim.
if (typeof document === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).document = {
    baseURI: self.location.href,
  };
}

import { Wllama, type AssetsPathConfig } from '../vendor/wllama';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let wllama: Wllama | null = null;
let currentAbortController: AbortController | null = null;

// ---------------------------------------------------------------------------
// WASM path resolution
// ---------------------------------------------------------------------------

/**
 * Check if the current environment supports multi-threaded WASM.
 * Requires SharedArrayBuffer + crossOriginIsolated (COOP/COEP headers).
 */
function canUseMultiThread(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      (self as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated === true
    );
  } catch {
    return false;
  }
}

/**
 * Resolve WASM binary paths relative to the worker's location.
 *
 * - Only includes multi-thread WASM when the environment supports it,
 *   avoiding unnecessary downloads on single-thread-only browsers.
 * - The project always uses the custom-built WASM from vendor/wllama/.
 * - Rebuilding vendor/wllama/*.wasm is therefore required for any runtime changes.
 */
function getWasmPaths(useOnebit = false) {
  const multiThread = canUseMultiThread();

  const paths: AssetsPathConfig = {
    'single-thread/wllama.wasm': new URL(
      '../../vendor/wllama/single-thread.wasm',
      import.meta.url,
    ).href,
  };
  if (multiThread) {
    paths['multi-thread/wllama.wasm'] = new URL(
      '../../vendor/wllama/multi-thread.wasm',
      import.meta.url,
    ).href;
  }
  console.info('[wllamaWorker] Using vendored WASM paths:', paths, 'isOnebit:', useOnebit);
  return paths;
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface InitRequest { id: number; type: 'init'; isOnebit?: boolean }
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

function postDiagnostic(phase: string, payload: Record<string, unknown>) {
  self.postMessage({ id: 0, type: '__diagnostic', phase, payload });
}

/** Forward logs to main thread since worker console is not visible in preview tools */
function forwardLog(level: string, ...args: unknown[]) {
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  self.postMessage({ id: 0, type: '__log', level, text: `[wllama-native] ${text}` });
  // Collect error/warn logs for inclusion in user-facing error messages
  if (level === 'error' || level === 'warn') {
    recentNativeLogs.push(text);
    if (recentNativeLogs.length > 20) recentNativeLogs.shift();
  }
}

/** Recent native error/warn logs for diagnostic messages */
const recentNativeLogs: string[] = [];

const workerLogger = {
  debug: (...args: unknown[]) => forwardLog('debug', ...args),
  log: (...args: unknown[]) => forwardLog('info', ...args),
  info: (...args: unknown[]) => forwardLog('info', ...args),
  warn: (...args: unknown[]) => forwardLog('warn', ...args),
  error: (...args: unknown[]) => forwardLog('error', ...args),
};

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

async function handleInit(req: InitRequest) {
  try {
    const useOnebit = req.isOnebit ?? false;
    const paths = getWasmPaths(useOnebit);
    postDiagnostic('worker-init', {
      isOnebit: useOnebit,
      wasmPaths: paths,
      multiThreadCapable: canUseMultiThread(),
    });
    console.info('[wllamaWorker] init, isOnebit:', useOnebit, 'WASM paths:', paths);
    wllama = new Wllama(paths, {
      suppressNativeLog: false,
      logger: workerLogger,
    });
    console.info('[wllamaWorker] init success');
    respond(req.id, 'ready');
  } catch (e) {
    const err = e as Error;
    console.error('[wllamaWorker] init error:', err.message);
    respondError(req.id,
      `WASMランタイムの初期化に失敗しました: ${err.message}。` +
      'ブラウザがWebAssemblyをサポートしていないか、WASMバイナリの読み込みに失敗した可能性があります。');
  }
}

async function handleLoad(req: LoadRequest) {
  if (!wllama) {
    respondError(req.id, 'Worker not initialized. Call init first.');
    return;
  }

  // Clear native log buffer before each load attempt
  recentNativeLogs.length = 0;

  try {
    console.info('[wllamaWorker] handleLoad start, file:', req.file.name, 'size:', req.file.size);
    postDiagnostic('worker-load-start', {
      fileName: req.file.name,
      fileSize: req.file.size,
    });

    // Validate GGUF magic header before passing to wllama
    if (req.file.size < 4) {
      respondError(req.id,
        `GGUFファイルの検証に失敗しました: ファイルサイズが${req.file.size}バイトしかありません（最低4バイト必要）。` +
        'ダウンロードが中断された可能性があります。モデルを削除して再ダウンロードしてください。');
      return;
    }
    const magic = new Uint8Array(await req.file.slice(0, 4).arrayBuffer());
    const magicHex = Array.from(magic).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    console.info('[wllamaWorker] GGUF magic bytes:', magicHex);
    if (magic[0] !== 0x47 || magic[1] !== 0x47 || magic[2] !== 0x55 || magic[3] !== 0x46) {
      respondError(req.id,
        `GGUFファイルの検証に失敗しました: ファイル先頭のマジックバイトが不正です（検出: ${magicHex}、期待: 0x47 0x47 0x55 0x46 "GGUF"）。` +
        'ファイルが破損しているか、GGUF以外の形式です。モデルを削除して再ダウンロードしてください。');
      return;
    }

    console.info('[wllamaWorker] GGUF magic valid, calling wllama.loadModel...');
    // wllama.loadModel accepts Blob[] — wrap the single File in an array
    await wllama.loadModel([req.file], {
      n_ctx: 512,
      n_threads: 1,  // Single-thread until COOP/COEP is configured (Phase 8)
    });

    const info = wllama.getLoadedContextInfo();
    postDiagnostic('worker-load-success', {
      contextLength: info.n_ctx,
      nVocab: info.n_vocab,
      nLayer: info.n_layer,
    });
    respond(req.id, 'loaded', {
      contextLength: info.n_ctx,
      nVocab: info.n_vocab,
      nLayer: info.n_layer,
    });
  } catch (e) {
    const err = e as Error;
    const msg = err.message;
    const stack = err.stack ?? '(no stack)';

    // Forward full stack trace to main thread console
    forwardLog('error', `loadModel error: ${msg}\nStack: ${stack}`);

    // Build diagnostic detail from native llama.cpp logs + JS stack
    const nativeDetail = recentNativeLogs.length > 0
      ? '\n\n[llama.cpp ログ]\n' + recentNativeLogs.join('\n')
      : '';
    const stackDetail = `\n\n[Stack Trace]\n${stack}`;

    if (msg.includes('Invalid magic number')) {
      const hasUnsupportedType = recentNativeLogs.some(l => l.includes('invalid ggml type'));
      const typeMatch = recentNativeLogs.find(l => l.includes('invalid ggml type'))?.match(/ggml type (\d+)/);
      if (hasUnsupportedType) {
        respondError(req.id,
          `モデルの読み込みに失敗しました: このGGUFファイルに含まれるテンソルの量子化形式（ggml type ${typeMatch?.[1] ?? '不明'}）は、` +
          '現在の独自ビルド wllama ランタイムでサポートされていません。' +
          nativeDetail + stackDetail);
      } else {
        respondError(req.id,
          'モデルの読み込みに失敗しました: llama.cppがモデルを処理できませんでした（wllama Glueプロトコルエラー: Invalid magic number）。' +
          nativeDetail + stackDetail);
      }
    } else {
      respondError(req.id,
        `モデルの読み込みに失敗しました: ${msg}` +
        nativeDetail + stackDetail);
    }
  }
}

async function handleGenerate(req: GenerateRequest) {
  if (!wllama || !wllama.isModelLoaded()) {
    respondError(req.id, 'No model loaded');
    return;
  }

  currentAbortController = new AbortController();

  // Track generated text outside try/catch so we can return partial text on abort
  let fullText = '';
  let tokensGenerated = 0;

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

    let stopped = false;

    console.info('[wllamaWorker] generate start, prompt length:', req.prompt.length, 'maxTokens:', req.maxTokens);

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

    console.info('[wllamaWorker] generate done, tokensGenerated:', tokensGenerated, 'fullText length:', fullText.length, 'stopped:', stopped);
    respond(req.id, 'done', { fullText, tokensGenerated });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      // Return partial text generated so far instead of empty string
      respond(req.id, 'done', { fullText, tokensGenerated, aborted: true });
    } else {
      const nativeDetail = recentNativeLogs.length > 0
        ? '\n\n[llama.cpp ログ]\n' + recentNativeLogs.join('\n')
        : '';
      respondError(req.id, `テキスト生成に失敗しました: ${err.message}${nativeDetail}`);
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
    respondError(req.id, `モデルのアンロードに失敗しました: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Global error handlers — catch WASM traps & unhandled rejections
// ---------------------------------------------------------------------------

self.onerror = (event) => {
  const msg = typeof event === 'string' ? event :
    (event as ErrorEvent).message ?? 'unknown error';
  const stack = (event as ErrorEvent).error?.stack ?? '';
  forwardLog('error', `[GLOBAL onerror] ${msg}\n${stack}`);
};

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack ?? '' : '';
  forwardLog('error', `[GLOBAL unhandledrejection] ${msg}\n${stack}`);
};

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
