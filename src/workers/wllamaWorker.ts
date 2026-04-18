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
import { buildBackendSummary } from './wllamaBackendSummary';
import type { LoadDescriptor } from '../local-llm/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let wllama: Wllama | null = null;
let currentAbortController: AbortController | null = null;
let currentWasmUsesWebGPU = false;
let currentWebGpuSelectionReason = 'not-evaluated';
let currentFileCopyPercent = 0;
let currentNativeLoadPercent = 0;
let currentLoadActivityAt = 0;
let currentLoadSawCpuLayer = false;
let currentLoadSawGpuLayer = false;
let currentBackendCount: number | null = null;
let currentObservedGpuDevices = new Set<string>();
let currentFlashAttnAutoDisabled = false;
let currentFlashAttnCpuFallback = false;

const LOAD_HEARTBEAT_MS = 5_000;
const LOAD_NO_PROGRESS_TIMEOUT_MS = 30_000;
const WLLAMA_WASM_ASSET_VERSION = '20260416-align-fix-2';

type MinimalGpuDevice = {
  destroy: () => void;
};

type MinimalGpuAdapter = {
  features: Set<string>;
  requestDevice: (descriptor?: { requiredFeatures?: string[] }) => Promise<MinimalGpuDevice>;
};

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
 * Check if the browser supports WebAssembly Memory64 proposal.
 *
 * Memory64 enables 64-bit memory addressing, required for models >2 GB.
 * Browsers without Memory64 support will fail to parse WASM binaries
 * compiled with -sMEMORY64=1 (error: "Memory64 is not enabled").
 *
 * Detection: compile a minimal WASM module that declares a memory64-type
 * linear memory. If the browser rejects it, Memory64 is not available.
 */
function supportsWasmMemory64(): boolean {
  try {
    // Minimal valid WASM module with a memory64 memory declaration:
    //   magic  + version
    //   section 5 (memory), 3 bytes payload:
    //     1 memory, flags=0x04 (i64 index, no max), min=1 page
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // \0asm
      0x01, 0x00, 0x00, 0x00, // version 1
      0x05, 0x03, 0x01, 0x04, 0x01, // memory section: 1 mem, flags=4 (memory64), min=1
    ]);
    new WebAssembly.Module(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Cached result of Memory64 support detection */
let _memory64Supported: boolean | null = null;

function isMemory64Supported(): boolean {
  if (_memory64Supported === null) {
    _memory64Supported = supportsWasmMemory64();
  }
  return _memory64Supported;
}

/**
 * Check whether the browser supports the WebAssembly exception-handling
 * proposal with `exnref` (opcode 0x1f `try_table`).
 *
 * The WebGPU wllama WASM build is compiled with `-fwasm-exceptions`, which
 * emits `try_table`/`throw_ref`. Validation fails on browsers where the
 * proposal is disabled — in Firefox this maps to the about:config pref
 * `javascript.options.wasm_exnref`.
 */
function supportsWasmExnref(): boolean {
  try {
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
      0x03, 0x02, 0x01, 0x00,
      0x0a, 0x08, 0x01, 0x06, 0x00, 0x1f, 0x40, 0x00, 0x0b, 0x0b,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

let _exnrefSupported: boolean | null = null;

function isWasmExnrefSupported(): boolean {
  if (_exnrefSupported === null) {
    _exnrefSupported = supportsWasmExnref();
  }
  return _exnrefSupported;
}

function hasWebGPUApi(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch {
    return false;
  }
}

function hasWebAssemblyJspi(): boolean {
  const wasm = WebAssembly as unknown as {
    Suspending?: unknown;
    promising?: unknown;
  };
  return typeof wasm.Suspending === 'function' && typeof wasm.promising === 'function';
}

function hasSharedArrayBufferSupport(): boolean {
  try {
    if (typeof SharedArrayBuffer !== 'function') return false;
    void new SharedArrayBuffer(8);
    return true;
  } catch {
    return false;
  }
}

function isWorkerCrossOriginIsolated(): boolean {
  try {
    return (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  } catch {
    return false;
  }
}

function isWorkerSecureContext(): boolean {
  try {
    return (self as unknown as { isSecureContext?: boolean }).isSecureContext === true;
  } catch {
    return false;
  }
}

async function canUseWebGPU(allowWebGPU: boolean): Promise<boolean> {
  if (!allowWebGPU) {
    currentWebGpuSelectionReason = 'disabled-by-runtime-setting';
    console.info('[wllamaWorker] WebGPU disabled by runtime setting');
    return false;
  }
  if (!hasWebGPUApi()) {
    currentWebGpuSelectionReason = 'navigator-gpu-unavailable';
    console.info('[wllamaWorker] WebGPU API is not available in this worker environment');
    return false;
  }
  if (!hasWebAssemblyJspi()) {
    currentWebGpuSelectionReason = 'webassembly-jspi-unavailable';
    console.warn('[wllamaWorker] WebGPU WASM requires JSPI, but WebAssembly.Suspending/promising is not available');
    return false;
  }
  try {
    const adapter = await (navigator as Navigator & {
      gpu: {
        requestAdapter: () => Promise<MinimalGpuAdapter | null>;
      };
    }).gpu.requestAdapter();
    if (!adapter) {
      currentWebGpuSelectionReason = 'request-adapter-null';
      console.info('[wllamaWorker] WebGPU requestAdapter returned null');
      return false;
    }
    if (!adapter.features.has('shader-f16')) {
      currentWebGpuSelectionReason = 'shader-f16-unavailable';
      console.info('[wllamaWorker] WebGPU adapter does not expose shader-f16');
      return false;
    }
    const device = await adapter.requestDevice({ requiredFeatures: ['shader-f16'] });
    device.destroy();
    currentWebGpuSelectionReason = 'selected';
    return true;
  } catch (e) {
    currentWebGpuSelectionReason = `device-preflight-failed:${(e as Error).message}`;
    console.warn('[wllamaWorker] WebGPU device preflight failed:', (e as Error).message);
    return false;
  }
}

/**
 * Resolve WASM binary paths relative to the worker's location.
 *
 * - Only includes multi-thread WASM when the environment supports it,
 *   avoiding unnecessary downloads on single-thread-only browsers.
 * - Uses *-compat.wasm binaries unless the caller explicitly prefers Memory64
 *   and the browser supports it.
 * - The project always uses the custom-built WASM from vendor/wllama/.
 * - Rebuilding vendor/wllama/*.wasm is therefore required for any runtime changes.
 */
async function wasmAssetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function versionedWasmUrl(fileName: string): string {
  const url = new URL(`../../vendor/wllama/${fileName}`, import.meta.url);
  url.searchParams.set('v', WLLAMA_WASM_ASSET_VERSION);
  return url.href;
}

async function getWasmPaths(useLowbitQ = false, preferMemory64 = false, allowWebGPU = false) {
  const multiThread = canUseMultiThread();
  const memory64Available = isMemory64Supported();
  const mem64 = preferMemory64 && memory64Available;
  const webgpu = await canUseWebGPU(allowWebGPU);

  const singleThreadFile = webgpu
    ? (mem64 ? 'single-thread-webgpu.wasm' : 'single-thread-webgpu-compat.wasm')
    : (mem64 ? 'single-thread.wasm' : 'single-thread-compat.wasm');
  const multiThreadFile = webgpu
    ? (mem64 ? 'multi-thread-webgpu.wasm' : 'multi-thread-webgpu-compat.wasm')
    : (mem64 ? 'multi-thread.wasm' : 'multi-thread-compat.wasm');
  currentWasmUsesWebGPU = webgpu;

  const paths: AssetsPathConfig = {
    'single-thread/wllama.wasm': versionedWasmUrl(singleThreadFile),
  };
  if (multiThread) {
    paths['multi-thread/wllama.wasm'] = versionedWasmUrl(multiThreadFile);
  }
  console.info('[wllamaWorker] Using vendored WASM paths:', paths,
    'isLowbitQ:', useLowbitQ, 'memory64:', mem64, 'memory64Available:', memory64Available, 'multiThread:', multiThread, 'webgpu:', webgpu);
  return paths;
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface InitRequest { id: number; type: 'init'; isLowbitQ?: boolean; preferMemory64?: boolean; allowWebGPU?: boolean }
interface InspectRuntimeFeaturesRequest { id: number; type: 'inspectRuntimeFeatures' }
interface PreflightLoadRuntimeRequest { id: number; type: 'preflightLoadRuntime' }
interface LoadRequest { id: number; type: 'load'; descriptor: LoadDescriptor; expectedContextLength?: number }
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

type WorkerRequest = InspectRuntimeFeaturesRequest | InitRequest | PreflightLoadRuntimeRequest | LoadRequest | GenerateRequest | AbortRequest | UnloadRequest;

type FeatureState = 'ok' | 'no' | 'unknown';

type FeatureCheck = {
  state: FeatureState;
  detail: string;
};

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

function postLoadProgress(phase: string, percent: number, detail: string) {
  self.postMessage({ id: 0, type: '__load_progress', phase, percent, detail });
}

function featureCheck(state: FeatureState, detail: string): FeatureCheck {
  return { state, detail };
}

function formatLogArgs(args: unknown[]) {
  return args.map(a => {
    if (typeof a === 'object' && a !== null) {
      if (typeof Event !== 'undefined' && a instanceof Event) {
        const ev = a as ErrorEvent;
        return [
          `${a.constructor.name}: type=${a.type}`,
          ev.message ? `message=${ev.message}` : '',
          ev.filename ? `file=${ev.filename}:${ev.lineno}:${ev.colno}` : '',
          ev.error instanceof Error ? `error=${ev.error.name}: ${ev.error.message}\n${ev.error.stack ?? ''}` : '',
        ].filter(Boolean).join(' ');
      }
      // ErrorEvent has .message/.filename/.lineno but JSON.stringify can't capture them
      const ev = a as Record<string, unknown>;
      if ('message' in ev && 'filename' in ev) {
        return `ErrorEvent: ${ev.message} at ${ev.filename}:${ev.lineno}`;
      }
      // Error objects
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
      }
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

/** Forward logs to main thread since worker console is not visible in preview tools */
function postLog(level: string, source: string, ...args: unknown[]) {
  const text = formatLogArgs(args);
  self.postMessage({ id: 0, type: '__log', level, text: `${source}: ${text}` });
  // Collect error/warn logs for inclusion in user-facing error messages
  if (level === 'error' || level === 'warn') {
    recentNativeLogs.push(`${source}: ${text}`);
    if (recentNativeLogs.length > 100) recentNativeLogs.shift();
  }
}

function shouldForwardNativeLog(level: string, text: string, isFirstCpuLayer: boolean, sawGpuLayer: boolean): boolean {
  if ((level === 'warn' || level === 'error') && text.includes(WEBGPU_MAP_ERROR_SIGNATURE)) {
    suppressedWebgpuMapErrors++;
    return false;
  }
  if (level === 'warn' || level === 'error') return true;
  if (text.includes('wllama-')) return true;
  if (isFirstCpuLayer || sawGpuLayer) return true;
  if (text.includes('backend_ptrs.size()')) return true;
  if (text.includes('CPU KV buffer size') || text.includes('CPU compute buffer size')) return true;
  return false;
}

function forwardLog(level: string, ...args: unknown[]) {
  const text = formatLogArgs(args);
  const fileStageMatch = text.match(/(?:^|\s)wllama-file-stage:([a-z0-9_.-]+)(?:\s|$)/);
  if (fileStageMatch) {
    currentLoadActivityAt = performance.now();
    postDiagnostic('file-load-stage', { stage: fileStageMatch[1], text });
  }

  const fileProgressMatch = text.match(/(?:^|\s)wllama-file-progress:(\d{1,3})(?:\s|$)/);
  if (fileProgressMatch) {
    const filePercent = Math.max(0, Math.min(100, Number(fileProgressMatch[1])));
    if (filePercent >= currentFileCopyPercent) {
      currentLoadActivityAt = performance.now();
      currentFileCopyPercent = filePercent;
      postLoadProgress(
        'model-file-copy',
        Math.round(20 + filePercent * 0.25),
        `モデルデータを WASM メモリへ転送中 (${filePercent}%)`,
      );
    }
  }

  const stageMatch = text.match(/(?:^|\s)wllama-load-stage:([a-z0-9_.-]+)(?:\s|$)/);
  if (stageMatch) {
    currentLoadActivityAt = performance.now();
    postDiagnostic('native-load-stage', { stage: stageMatch[1], text });
  }

  const progressMatch = text.match(/(?:^|\s)wllama-load-progress:(\d{1,3})(?:\s|$)/);
  if (progressMatch) {
    const nativePercent = Math.max(0, Math.min(100, Number(progressMatch[1])));
    if (nativePercent >= currentNativeLoadPercent) {
      currentLoadActivityAt = performance.now();
      currentNativeLoadPercent = nativePercent;
      postLoadProgress(
        'model-load-native',
        Math.round(45 + nativePercent * 0.5),
        `モデルデータをロード中 (${nativePercent}%)`,
      );
    }
  }

  const backendSummaryMatch = text.match(/wllama-backend-summary:\s+reg_count=(\d+)\s+dev_count=(\d+)/);
  if (backendSummaryMatch) {
    currentBackendCount = Number(backendSummaryMatch[2]);
    postDiagnostic('native-backend-summary', {
      registryCount: Number(backendSummaryMatch[1]),
      deviceCount: Number(backendSummaryMatch[2]),
      webgpuWasmSelected: currentWasmUsesWebGPU,
      text,
    });
  }

  const backendDeviceMatch = text.match(/wllama-backend-device:(?:(\S+)\s+)?index=(\d+)\s+name=([^\s]+)\s+description=(.*?)\s+type=(\d+)/);
  if (backendDeviceMatch) {
    postDiagnostic('native-backend-device', {
      stage: backendDeviceMatch[1] ?? null,
      index: Number(backendDeviceMatch[2]),
      name: backendDeviceMatch[3],
      description: backendDeviceMatch[4],
      type: Number(backendDeviceMatch[5]),
      webgpuWasmSelected: currentWasmUsesWebGPU,
      text,
    });
  }

  const webgpuNativeMatch = text.match(/(?:^|\s)(wllama-webgpu-(?:reg|device):[^\n]+)/);
  if (webgpuNativeMatch) {
    currentLoadActivityAt = performance.now();
    postDiagnostic('native-webgpu', {
      webgpuWasmSelected: currentWasmUsesWebGPU,
      text: webgpuNativeMatch[1],
    });
  }

  const gpuLayerMatch = text.match(/load_tensors:\s+layer\s+\d+\s+assigned to device (?!CPU\b)([^\s,]+)/);
  if (gpuLayerMatch) {
    currentLoadSawGpuLayer = true;
    currentObservedGpuDevices.add(gpuLayerMatch[1]);
    postDiagnostic('effective-backend', {
      selectedWasm: currentWasmUsesWebGPU ? 'webgpu' : 'cpu',
      effectiveDevice: gpuLayerMatch[1],
      reason: 'llama.cpp assigned model layers to a non-CPU device',
      text,
    });
  }

  const cpuLayerMatch = text.match(/load_tensors:\s+layer\s+\d+\s+assigned to device CPU/);
  const isFirstCpuLayer = !!cpuLayerMatch && !currentLoadSawCpuLayer;
  if (cpuLayerMatch) {
    currentLoadSawCpuLayer = true;
    if (isFirstCpuLayer) {
      postDiagnostic('effective-backend', {
        selectedWasm: currentWasmUsesWebGPU ? 'webgpu' : 'cpu',
        effectiveDevice: 'CPU',
        reason: currentWasmUsesWebGPU
          ? 'WebGPU WASM was selected, but llama.cpp assigned model layers to CPU'
          : `CPU WASM selected before model load (${currentWebGpuSelectionReason})`,
        text,
      });
    }
  }

  if (text.includes('Flash Attention tensor is assigned to device CPU')) {
    currentFlashAttnCpuFallback = true;
  }

  if (text.includes('Flash Attention was auto, set to disabled')) {
    currentFlashAttnAutoDisabled = true;
  }

  const backendPtrsMatch = text.match(/backend_ptrs\.size\(\)\s*=\s*(\d+)/);
  if (backendPtrsMatch) {
    postDiagnostic('native-backend-active', {
      backendCount: Number(backendPtrsMatch[1]),
      webgpuWasmSelected: currentWasmUsesWebGPU,
      webgpuSelectionReason: currentWebGpuSelectionReason,
      text,
    });
  }

  if (shouldForwardNativeLog(level, text, isFirstCpuLayer, !!gpuLayerMatch)) {
    postLog(level, 'native', text);
  }
}

function installConsoleForwarding() {
  const original = {
    debug: console.debug.bind(console),
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const wrap = (level: keyof typeof original) => (...args: unknown[]) => {
    original[level](...args);
    postLog(level === 'log' ? 'info' : level, 'worker', ...args);
  };
  console.debug = wrap('debug');
  console.log = wrap('log');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.error = wrap('error');
}

installConsoleForwarding();

/** Recent native error/warn logs for diagnostic messages */
const recentNativeLogs: string[] = [];

/**
 * Count of suppressed WebGPU "Failed to map error buffer" messages during the
 * current generation. The underlying condition is a known race in the ggml
 * WebGPU backend; the fork recovers from each failure (see vendor/wllama/BUILD.md
 * §13), so individual occurrences are noise. We suppress them from the debug
 * view and surface a single summary at generate start/end instead.
 */
const WEBGPU_MAP_ERROR_SIGNATURE = 'Failed to map error buffer: Buffer was destroyed';
let suppressedWebgpuMapErrors = 0;

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
    const useLowbitQ = req.isLowbitQ ?? false;
    const preferMemory64 = req.preferMemory64 ?? false;
    const allowWebGPU = req.allowWebGPU ?? false;
    const mem64 = isMemory64Supported();
    const paths = await getWasmPaths(useLowbitQ, preferMemory64, allowWebGPU);
    postDiagnostic('worker-init', {
      isLowbitQ: useLowbitQ,
      wasmPaths: paths,
      multiThreadCapable: canUseMultiThread(),
      memory64Supported: mem64,
      memory64Selected: preferMemory64 && mem64,
      memory64Required: preferMemory64,
      webgpuAllowed: allowWebGPU,
      webgpuCapable: hasWebGPUApi(),
      webgpuWasmSelected: currentWasmUsesWebGPU,
      webgpuSelectionReason: currentWebGpuSelectionReason,
    });
    console.info('[wllamaWorker] init, isLowbitQ:', useLowbitQ, 'memory64Available:', mem64, 'preferMemory64:', preferMemory64, 'allowWebGPU:', allowWebGPU, 'WASM paths:', paths);
    wllama = new Wllama(paths, {
      suppressNativeLog: false,
      logger: workerLogger,
    });
    console.info('[wllamaWorker] init success');
    respond(req.id, 'ready');
  } catch (e) {
    const err = e as Error;
    console.error('[wllamaWorker] init error:', err.message);

    // Detect Memory64-related failures and provide a specific message
    const mem64 = isMemory64Supported();
    if (!mem64 && (err.message.includes('Memory64') || err.message.includes("doesn't parse"))) {
      respondError(req.id,
        'WASMランタイムの初期化に失敗しました: お使いのブラウザはWebAssembly Memory64をサポートしていません。' +
        'Chrome 133以降、Edge 133以降、またはFirefox 134以降をお使いください。' +
        '互換モード用のWASMバイナリ（*-compat.wasm）がまだビルドされていない可能性もあります。');
    } else {
      respondError(req.id,
        `WASMランタイムの初期化に失敗しました: ${err.message}。` +
        'ブラウザがWebAssemblyをサポートしていないか、WASMバイナリの読み込みに失敗した可能性があります。');
    }
  }
}

async function handleInspectRuntimeFeatures(req: InspectRuntimeFeaturesRequest) {
  const checks: Record<string, FeatureCheck> = {};

  const secureContext = isWorkerSecureContext();
  checks.secureContext = secureContext
    ? featureCheck('ok', 'Secure Context なので Service Worker や OPFS を安定して使えます。モデル保存と再読み込みの前提になります。')
    : featureCheck('no', 'Secure Context ではないため Service Worker や OPFS に制約が出ます。保存済みモデルの再利用が不安定になります。');

  const memory64 = isMemory64Supported();
  checks.memory64 = memory64
    ? featureCheck('ok', 'Memory64 が使えるので CPU 側の WASM ヒープを現行実装で最大 16 GB まで広げられます。大きい GGUF を載せやすくなります。')
    : featureCheck('no', 'Memory64 がないため compat 経路になります。現行実装では CPU 単スレッドは 2 GB、WebGPU compat 単スレッドでも 4 GB 止まりです。');

  const jspi = hasWebAssemblyJspi();
  checks.jspi = jspi
    ? featureCheck('ok', 'JSPI (WebAssembly.Suspending/promising) があるので、このアプリの WebGPU 用 wllama WASM が使う非同期初期化を通せます。Firefox では about:config の javascript.options.wasm_js_promise_integration が true 相当です。')
    : featureCheck('no', 'JSPI (WebAssembly.Suspending/promising) がないため、このアプリの WebGPU 用 wllama WASM は初期化できません。Firefox では about:config の javascript.options.wasm_js_promise_integration を true にしてください。');

  const exnref = isWasmExnrefSupported();
  checks.exnref = exnref
    ? featureCheck('ok', 'WebAssembly 例外処理 (exnref / try_table) が使えます。WebGPU 用 wllama WASM の C++ 例外を処理できます。Firefox では about:config の javascript.options.wasm_exnref が true 相当です。')
    : featureCheck('no', 'WebAssembly 例外処理 (exnref / try_table) が無効です。WebGPU 用 wllama WASM は -fwasm-exceptions で生成されているため検証が失敗します。Firefox では about:config の javascript.options.wasm_exnref を true にしてください。');

  const sab = hasSharedArrayBufferSupport();
  checks.sharedArrayBuffer = sab
    ? featureCheck('ok', 'SharedArrayBuffer を使えるので、worker 間でメモリ共有する multi-thread WASM の前提の一つを満たします。')
    : featureCheck('no', 'SharedArrayBuffer がないため multi-thread WASM を使えません。モデル実行は単スレッド前提になります。');

  const crossOriginIsolated = isWorkerCrossOriginIsolated();
  checks.crossOriginIsolated = crossOriginIsolated
    ? featureCheck('ok', 'crossOriginIsolated = true なので SharedArrayBuffer を安全に使う条件が揃います。multi-thread WASM の有効化に必要です。')
    : featureCheck('no', 'crossOriginIsolated = false なので SharedArrayBuffer 前提の multi-thread WASM を有効にできません。');

  const multiThread = canUseMultiThread();
  if (multiThread) {
    checks.multiThread = featureCheck('ok', 'multi-thread WASM を使えます。wllama が hardwareConcurrency/2 スレッドで実行します。');
  } else if (!sab || !crossOriginIsolated) {
    const missing = [
      !sab ? 'SharedArrayBuffer' : null,
      !crossOriginIsolated ? 'crossOriginIsolated' : null,
    ].filter(Boolean).join(', ');
    checks.multiThread = featureCheck('no', `multi-thread WASM を使えません。不足している前提: ${missing}`);
  } else {
    checks.multiThread = featureCheck('unknown', 'multi-thread WASM を使えるか断定できません。');
  }

  if (!hasWebGPUApi()) {
    checks.webgpuApi = featureCheck('no', 'WebGPU API 自体がないため、モデルレイヤを GPU に逃がす経路を使えません。');
    checks.requestAdapter = featureCheck('unknown', 'WebGPU API がないため GPU 候補の列挙まで進めません。');
    checks.shaderF16 = featureCheck('unknown', 'GPU 候補を取れないため、ggml-webgpu が使う半精度演算の確認まで進めません。');
    checks.requestDevice = featureCheck('unknown', 'GPU 候補を取れないため、モデル実行用の GPUDevice を開けません。');
    respond(req.id, 'runtime-features', { checks });
    return;
  }

  checks.webgpuApi = featureCheck('ok', 'WebGPU API はあります。モデルレイヤを GPU 側へ割り当てる候補があります。');

  let adapter: MinimalGpuAdapter | null = null;
  try {
    adapter = await (navigator as Navigator & {
      gpu: {
        requestAdapter: () => Promise<MinimalGpuAdapter | null>;
      };
    }).gpu.requestAdapter();
  } catch (e) {
    checks.requestAdapter = featureCheck('unknown', `GPUAdapter の取得に失敗しました: ${(e as Error).message}`);
    checks.shaderF16 = featureCheck('unknown', 'GPUAdapter を取れないため、半精度演算対応を確認できません。');
    checks.requestDevice = featureCheck('unknown', 'GPUAdapter を取れないため、モデル実行用 GPUDevice を開けません。');
    respond(req.id, 'runtime-features', { checks });
    return;
  }

  if (!adapter) {
    checks.requestAdapter = featureCheck('no', 'GPUAdapter を取得できませんでした。使える GPU 経路を選べません。');
    checks.shaderF16 = featureCheck('unknown', 'GPUAdapter がないため、半精度演算対応を確認できません。');
    checks.requestDevice = featureCheck('unknown', 'GPUAdapter がないため、モデル実行用 GPUDevice を開けません。');
    respond(req.id, 'runtime-features', { checks });
    return;
  }

  checks.requestAdapter = featureCheck('ok', 'GPUAdapter を取得できました。GPU 実行先の候補までは見えています。');

  const shaderF16 = adapter.features.has('shader-f16');
  checks.shaderF16 = shaderF16
    ? featureCheck('ok', '現行実装は shader-f16 前提です。半精度演算を使えるので、GPU 実行時のメモリ使用量を抑えやすくなります。')
    : featureCheck('no', 'WebGPU 一般では必須ではありませんが、このアプリの現行 ggml-webgpu 実装は shader-f16 前提です。そのため GPU 実行経路を使えません。');

  if (!shaderF16) {
    checks.requestDevice = featureCheck('no', 'shader-f16 前提を満たさないため、現行実装のモデル実行用 GPUDevice は開けません。');
    respond(req.id, 'runtime-features', { checks });
    return;
  }

  try {
    const device = await adapter.requestDevice({ requiredFeatures: ['shader-f16'] });
    device.destroy();
    checks.requestDevice = featureCheck('ok', 'GPUDevice を開けました。JSPI も揃えば、このアプリの WebGPU 用 wllama でモデル実行を試せます。');
  } catch (e) {
    checks.requestDevice = featureCheck('no', `GPUDevice を開けませんでした: ${(e as Error).message}`);
  }

  respond(req.id, 'runtime-features', { checks });
}

async function handleLoad(req: LoadRequest) {
  if (!wllama) {
    respondError(req.id, 'Worker not initialized. Call init first.');
    return;
  }

  // Clear native log buffer before each load attempt
  recentNativeLogs.length = 0;
  currentFileCopyPercent = 0;
  currentNativeLoadPercent = 0;
  currentLoadSawCpuLayer = false;
  currentLoadSawGpuLayer = false;
  currentBackendCount = null;
  currentObservedGpuDevices = new Set();
  currentFlashAttnAutoDisabled = false;
  currentFlashAttnCpuFallback = false;
  const loadStartTime = performance.now();
  currentLoadActivityAt = loadStartTime;

  const { descriptor } = req;
  const isOpfsDirect = descriptor.mode === 'opfs-direct';

  // Collect opfs stats after load (success or failure) for opfs-direct mode
  const collectOpfsStats = async () => {
    if (!isOpfsDirect || !wllama) return;
    try {
      // Access proxy via type assertion — opfsStats() is on ProxyToWorker, not on Wllama public API
      const stats = await (wllama as unknown as { proxy: { opfsStats: () => Promise<{ opfsReadCount: number; opfsBytesRead: number }> } }).proxy?.opfsStats();
      if (stats) {
        postDiagnostic('worker-opfs-stats', {
          opfsReadCount: stats.opfsReadCount,
          opfsBytesRead: stats.opfsBytesRead,
        });
      }
    } catch {
      // best-effort — don't let stats collection break load result reporting
    }
  };

  try {
    let firstFileName: string;
    let shardCount: number;
    let totalSize: number;

    if (descriptor.mode === 'opfs-direct') {
      shardCount = descriptor.shards.length;
      firstFileName = descriptor.shards[0] ?? 'unknown';
      totalSize = 0; // not available without reading OPFS metadata; size is informational only
    } else {
      const files = descriptor.files;
      firstFileName = (files[0] as File).name ?? 'unknown';
      shardCount = files.length;
      totalSize = files.reduce((s, f) => s + f.size, 0);
    }

    const totalSizeMB = totalSize > 0 ? (totalSize / 1024 / 1024).toFixed(1) : '?';
    const modeLabel = isOpfsDirect ? 'opfs-direct' : 'files';
    const fileLabel = shardCount > 1
      ? `${firstFileName} (${shardCount} shards, ${totalSizeMB} MB total, mode=${modeLabel})`
      : `${firstFileName} (${totalSizeMB} MB, mode=${modeLabel})`;
    console.info('[wllamaWorker] handleLoad start, file:', fileLabel);
    postDiagnostic('worker-load-start', {
      fileName: firstFileName,
      fileSize: totalSize,
      shardCount,
      mode: modeLabel,
    });
    postLoadProgress('validating', 0, `${isOpfsDirect ? 'OPFS直接ロード準備中' : `GGUFヘッダを検証中 (${totalSizeMB} MB${shardCount > 1 ? `, ${shardCount} shards` : ''})`}`);

    if (!isOpfsDirect) {
      // Validate GGUF magic header on the first file before passing to wllama
      const firstFile = descriptor.files[0];
      if (firstFile.size < 4) {
        respondError(req.id,
          `GGUFファイルの検証に失敗しました: ファイルサイズが${firstFile.size}バイトしかありません（最低4バイト必要）。` +
          'ダウンロードが中断された可能性があります。モデルを削除して再ダウンロードしてください。');
        return;
      }
      const magic = new Uint8Array(await firstFile.slice(0, 4).arrayBuffer());
      const magicHex = Array.from(magic).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
      console.info('[wllamaWorker] GGUF magic bytes:', magicHex);
      if (magic[0] !== 0x47 || magic[1] !== 0x47 || magic[2] !== 0x55 || magic[3] !== 0x46) {
        respondError(req.id,
          `GGUFファイルの検証に失敗しました: ファイル先頭のマジックバイトが不正です（検出: ${magicHex}、期待: 0x47 0x47 0x55 0x46 "GGUF"）。` +
          'ファイルが破損しているか、GGUF以外の形式です。モデルを削除して再ダウンロードしてください。');
        return;
      }
      console.info('[wllamaWorker] GGUF magic valid, calling wllama.loadModel...');
    }

    postLoadProgress('wasm-init', 10, 'WASM ランタイムを初期化中');
    postLoadProgress('model-load', 20, `モデルをロード中 (${totalSizeMB} MB${shardCount > 1 ? `, ${shardCount} shards` : ''}, mode=${modeLabel})`);

    // Use expected context length from catalog/store if available,
    // otherwise fall back to a safe default. Cap at MAX_BROWSER_CTX for memory safety.
    const MAX_BROWSER_CTX = 8192;
    const requestedCtx = Math.min(req.expectedContextLength ?? MAX_BROWSER_CTX, MAX_BROWSER_CTX);
    const loadOptions = {
      n_ctx: requestedCtx,
      n_gpu_layers: currentWasmUsesWebGPU ? 999 : 0,
      use_mmap: false,  // WASM emulated mmap fails on large files (>2GB)
    };
    console.info('[wllamaWorker] load options:', loadOptions, 'mode:', modeLabel);

    let rejectNoProgress: ((error: Error) => void) | null = null;
    const noProgressPromise = new Promise<never>((_, reject) => {
      rejectNoProgress = reject;
    });
    const heartbeat = self.setInterval(() => {
      const elapsed = ((performance.now() - loadStartTime) / 1000).toFixed(1);
      const idleMs = performance.now() - currentLoadActivityAt;
      const overallPercent = currentNativeLoadPercent > 0
        ? Math.round(45 + currentNativeLoadPercent * 0.5)
        : Math.round(20 + currentFileCopyPercent * 0.25);
      postLoadProgress(
        'model-load',
        overallPercent,
        `モデルロード継続中 (${elapsed}s, idle=${(idleMs / 1000).toFixed(1)}s, fileCopy=${currentFileCopyPercent}%, native=${currentNativeLoadPercent}%, WebGPU=${currentWasmUsesWebGPU}, n_gpu_layers=${loadOptions.n_gpu_layers}, ctx=${requestedCtx}, mode=${modeLabel})`,
      );
      console.info('[wllamaWorker] load still pending, elapsedSec:', elapsed, 'webgpu:', currentWasmUsesWebGPU, 'mode:', modeLabel);

      if (currentWasmUsesWebGPU && idleMs >= LOAD_NO_PROGRESS_TIMEOUT_MS) {
        const message = `WebGPU WASM initialization made no progress for ${(idleMs / 1000).toFixed(1)}s`;
        postDiagnostic('load-no-progress-timeout', {
          elapsedSec: Number(elapsed),
          idleSec: Number((idleMs / 1000).toFixed(1)),
          fileCopyPercent: currentFileCopyPercent,
          nativeLoadPercent: currentNativeLoadPercent,
          webgpu: currentWasmUsesWebGPU,
        });
        rejectNoProgress?.(new Error(message));
      }
    }, LOAD_HEARTBEAT_MS);

    try {
      if (descriptor.mode === 'opfs-direct') {
        await Promise.race([
          wllama.loadModelFromOpfs(descriptor.modelId, descriptor.shards, loadOptions),
          noProgressPromise,
        ]);
      } else {
        // wllama.loadModel accepts multiple Blobs for split GGUF; internally calls sortFileByShard
        await Promise.race([
          wllama.loadModel(descriptor.files, loadOptions),
          noProgressPromise,
        ]);
      }
    } finally {
      self.clearInterval(heartbeat);
    }

    if (currentWasmUsesWebGPU && currentLoadSawCpuLayer && !currentLoadSawGpuLayer) {
      const summary = buildBackendSummary({
        selectedWasm: 'webgpu',
        webgpuSelectionReason: currentWebGpuSelectionReason,
        backendCount: currentBackendCount,
        sawCpuLayer: currentLoadSawCpuLayer,
        sawGpuLayer: currentLoadSawGpuLayer,
        observedGpuDevices: Array.from(currentObservedGpuDevices),
        flashAttentionAutoDisabled: currentFlashAttnAutoDisabled,
        flashAttentionCpuFallback: currentFlashAttnCpuFallback,
      });
      postDiagnostic('effective-backend-summary', {
        ...summary,
        selectedWasm: 'webgpu',
        webgpuSelectionReason: currentWebGpuSelectionReason,
      });
      postDiagnostic('effective-backend-mismatch', {
        selectedWasm: 'webgpu',
        effectiveDevice: 'CPU',
        nGpuLayers: loadOptions.n_gpu_layers,
        reason: 'WebGPU WASM was selected, but llama.cpp assigned all observed layers to CPU',
      });
      throw new Error('WebGPU WASM loaded, but llama.cpp assigned the model to CPU');
    }

    const info = wllama.getLoadedContextInfo();
    const nativeContextLength = info.n_ctx_train ?? info.n_ctx;
    // The granted n_ctx may differ from what we requested; also cap to native length
    const grantedCtx = Math.min(info.n_ctx, nativeContextLength);

    const elapsed = ((performance.now() - loadStartTime) / 1000).toFixed(1);
    postLoadProgress('complete', 100, `ロード完了 (${elapsed}s, ctx=${grantedCtx}, n_ctx_train=${nativeContextLength}, layers=${info.n_layer})`);
    const summary = buildBackendSummary({
      selectedWasm: currentWasmUsesWebGPU ? 'webgpu' : 'cpu',
      webgpuSelectionReason: currentWebGpuSelectionReason,
      backendCount: currentBackendCount,
      sawCpuLayer: currentLoadSawCpuLayer,
      sawGpuLayer: currentLoadSawGpuLayer,
      observedGpuDevices: Array.from(currentObservedGpuDevices),
      flashAttentionAutoDisabled: currentFlashAttnAutoDisabled,
      flashAttentionCpuFallback: currentFlashAttnCpuFallback,
    });
    postDiagnostic('effective-backend-summary', {
      ...summary,
      selectedWasm: currentWasmUsesWebGPU ? 'webgpu' : 'cpu',
      webgpuSelectionReason: currentWebGpuSelectionReason,
    });
    postDiagnostic('worker-load-success', {
      contextLength: grantedCtx,
      nativeContextLength,
      nVocab: info.n_vocab,
      nLayer: info.n_layer,
      elapsedSec: parseFloat(elapsed),
    });
    await collectOpfsStats();
    respond(req.id, 'loaded', {
      contextLength: grantedCtx,
      nativeContextLength,
      nVocab: info.n_vocab,
      nLayer: info.n_layer,
    });
  } catch (e) {
    const err = e as Error;
    const msg = err.message;
    const stack = err.stack ?? '(no stack)';

    const elapsed = ((performance.now() - loadStartTime) / 1000).toFixed(1);
    postLoadProgress('error', -1, `ロード失敗 (${elapsed}s): ${msg.slice(0, 120)}`);

    // Forward full stack trace to main thread console
    forwardLog('error', `loadModel error: ${msg}\nStack: ${stack}`);

    // Build diagnostic detail from native llama.cpp logs + JS stack
    const nativeDetail = recentNativeLogs.length > 0
      ? '\n\n[llama.cpp ログ]\n' + recentNativeLogs.join('\n')
      : '';
    const stackDetail = `\n\n[Stack Trace]\n${stack}`;

    // File size context — always include in error message for diagnostics.
    // For opfs-direct, we don't have byte sizes readily available; use shard names instead.
    const fileSizeDetail = descriptor.mode === 'opfs-direct'
      ? `\n\n[ファイル情報] mode=opfs-direct modelId=${descriptor.modelId} shards=${descriptor.shards.join(', ')}`
      : (() => {
          const files = descriptor.files;
          const firstFile = files[0];
          const totalBytes = files.reduce((s, f) => s + f.size, 0);
          return files.length > 1
            ? `\n\n[ファイル情報] name=${(firstFile as File).name ?? 'unknown'} (${files.length} shards) totalSize=${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`
            : `\n\n[ファイル情報] name=${(firstFile as File).name ?? 'unknown'} size=${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`;
        })();

    if (msg.includes('Invalid magic number')) {
      const hasUnsupportedType = recentNativeLogs.some(l => l.includes('invalid ggml type'));
      const typeMatch = recentNativeLogs.find(l => l.includes('invalid ggml type'))?.match(/ggml type (\d+)/);
      if (hasUnsupportedType) {
        respondError(req.id,
          `モデルの読み込みに失敗しました: このGGUFファイルに含まれるテンソルの量子化形式（ggml type ${typeMatch?.[1] ?? '不明'}）は、` +
          '現在の独自ビルド wllama ランタイムでサポートされていません。' +
          fileSizeDetail + nativeDetail + stackDetail);
      } else {
        respondError(req.id,
          'モデルの読み込みに失敗しました: llama.cppがモデルを処理できませんでした（wllama Glueプロトコルエラー: Invalid magic number）。' +
          fileSizeDetail + nativeDetail + stackDetail);
      }
    } else if (msg.includes('Invalid typed array length') || msg.includes('Out of memory') || msg.includes('memory access out of bounds')) {
      // WASM allocation failures — almost always caused by file larger than expected.
      respondError(req.id,
        `モデルの読み込みに失敗しました: WASMメモリ不足 (${msg})。` +
        'ファイルサイズが大きすぎるか、変換後のGGUFファイルが破損している可能性があります。' +
        fileSizeDetail + nativeDetail + stackDetail);
    } else if (msg.includes('Memory64') || msg.includes("doesn't parse")) {
      // Memory64-related WASM parse failure
      respondError(req.id,
        'モデルの読み込みに失敗しました: WASMバイナリの解析に失敗しました（Memory64非対応）。' +
        'お使いのブラウザはWebAssembly Memory64をサポートしていません。' +
        'Chrome 133以降、Edge 133以降、またはFirefox 134以降にアップデートするか、' +
        '互換モード用WASMバイナリ（*-compat.wasm）をビルドしてください。' +
        fileSizeDetail + nativeDetail + stackDetail);
    } else {
      respondError(req.id,
        `モデルの読み込みに失敗しました: ${msg}` +
        fileSizeDetail + nativeDetail + stackDetail);
    }
    await collectOpfsStats();
  }
}

async function handlePreflightLoadRuntime(req: PreflightLoadRuntimeRequest) {
  if (!wllama) {
    respondError(req.id, 'Worker not initialized. Call init first.');
    return;
  }

  recentNativeLogs.length = 0;
  currentFileCopyPercent = 0;
  currentNativeLoadPercent = 0;
  const start = performance.now();
  currentLoadActivityAt = start;

  const emptyGguf = new File([new Uint8Array([0x47, 0x47, 0x55, 0x46])], '__wllama_preflight__.gguf');

  try {
    postLoadProgress('wasm-preflight', 10, 'WebGPU WASM グルーを検証中');
    let rejectNoProgress: ((error: Error) => void) | null = null;
    const noProgressPromise = new Promise<never>((_, reject) => {
      rejectNoProgress = reject;
    });
    const heartbeat = self.setInterval(() => {
      const idleMs = performance.now() - currentLoadActivityAt;
      const elapsedMs = performance.now() - start;
      postLoadProgress(
        'wasm-preflight',
        10,
        `WebGPU WASM グルー検証中 (${(elapsedMs / 1000).toFixed(1)}s, idle=${(idleMs / 1000).toFixed(1)}s)`,
      );
      if (idleMs >= 10_000) {
        postDiagnostic('wasm-preflight-no-progress', {
          elapsedSec: Number((elapsedMs / 1000).toFixed(1)),
          idleSec: Number((idleMs / 1000).toFixed(1)),
          webgpu: currentWasmUsesWebGPU,
        });
        rejectNoProgress?.(new Error(`WebGPU WASM glue made no progress for ${(idleMs / 1000).toFixed(1)}s`));
      }
    }, 2_000);

    try {
      await Promise.race([
        wllama.loadModel([emptyGguf], { n_ctx: 16, n_threads: 1, n_gpu_layers: currentWasmUsesWebGPU ? 1 : 0 }),
        noProgressPromise,
      ]);
      // A 4-byte dummy GGUF should not load successfully. If it does, still
      // report the runtime as usable and unload it immediately.
      await wllama.exit();
      wllama = null;
      respond(req.id, 'preflight-ok');
    } catch (e) {
      const err = e as Error;
      const webGpuDeviceFailed = recentNativeLogs.some((line) =>
        line.includes('wllama-webgpu-device:device-failed')
        || line.includes('ggml_webgpu: Failed to get a device')
        || line.includes('ggml_webgpu: Device lost')
      );
      const reachedRuntime = currentFileCopyPercent > 0
        || currentNativeLoadPercent > 0
        || recentNativeLogs.some((line) =>
          line.includes('inner-runtime-initialized')
          || line.includes('inner-cwrap-ready')
          || line.includes('file-write-begin')
          || line.includes('wllama-load-stage')
          || line.includes('Invalid')
          || line.includes('GGUF')
        );
      if (webGpuDeviceFailed) {
        throw err;
      }
      if (reachedRuntime && !err.message.includes('made no progress')) {
        respond(req.id, 'preflight-ok', { expectedFailure: err.message });
      } else {
        throw err;
      }
    } finally {
      self.clearInterval(heartbeat);
    }
  } catch (e) {
    const err = e as Error;
    forwardLog('error', `preflightLoadRuntime error: ${err.message}\nStack: ${err.stack ?? '(no stack)'}`);
    respondError(req.id, `WebGPU WASMランタイムの検証に失敗しました: ${err.message}`);
  }
}

async function handleGenerate(req: GenerateRequest) {
  if (!wllama || !wllama.isModelLoaded()) {
    respondError(req.id, 'No model loaded');
    return;
  }

  currentAbortController = new AbortController();

  // Reset suppression counter and announce filtering for this generation.
  // The WebGPU "map error buffer" failures are known-recoverable (BUILD.md §13)
  // but fire 100s of times per generation — we hide them and show a summary.
  suppressedWebgpuMapErrors = 0;
  if (currentWasmUsesWebGPU) {
    postLog('info', 'native', 'ggml_webgpu: 既知の回復可能エラー (Failed to map error buffer) をデバッグビューから抑制します');
  }

  // Track generated text outside try/catch so we can return partial text on abort
  let fullText = '';
  let tokensGenerated = 0;

  try {
    // Apply chat template if the model has one. Instruct-tuned models (SmolLM2,
    // Qwen, Gemma, etc.) expect prompts wrapped in their chat template — passing
    // raw text causes immediate EOS or garbage output.
    let prompt = req.prompt;
    const chatTemplate = wllama.getChatTemplate();
    if (chatTemplate) {
      try {
        prompt = await wllama.formatChat(
          [{ role: 'user', content: req.prompt }],
          true, // addAssistant: append assistant turn start
        );
        console.info('[wllamaWorker] chat template applied, prompt length:', req.prompt.length, '->', prompt.length);
      } catch (e) {
        // Fall back to raw prompt if template formatting fails
        console.warn('[wllamaWorker] chat template formatting failed, using raw prompt:', (e as Error).message);
      }
    }

    // wllama only supports stopTokens (token IDs), not string stop sequences.
    // Multi-token stop strings cannot be reliably mapped to single token IDs,
    // so we handle string stops via post-processing on the streamed text.
    const stopStrings = req.stop ?? [];

    const stream = await wllama.createCompletion(prompt, {
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
    if (suppressedWebgpuMapErrors > 0) {
      postLog(
        'info',
        'native',
        `ggml_webgpu: 回復可能エラー (Failed to map error buffer) を ${suppressedWebgpuMapErrors} 回抑制しました`,
      );
    }
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
    case 'inspectRuntimeFeatures':
      await handleInspectRuntimeFeatures(req);
      break;
    case 'init':
      await handleInit(req);
      break;
    case 'preflightLoadRuntime':
      await handlePreflightLoadRuntime(req);
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
