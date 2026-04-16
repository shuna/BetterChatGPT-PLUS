/**
 * LocalModelRuntime — manages the lifecycle of local LLM engine workers.
 *
 * UI code accesses engines exclusively through this class.
 * Each loaded model gets its own Web Worker; the runtime tracks status,
 * capabilities, and provides abort/busy guards.
 *
 * Status lifecycle: idle → loading → ready ⇄ busy → unloaded
 * Error can occur from loading or busy states.
 */

import type {
  LocalModelDefinition,
  LocalModelStatus,
  LocalModelCapabilities,
  LocalModelEngine,
  LocalModelManifest,
  LocalModelTask,
  GenerateOptions,
  ClassificationLabel,
  LocalModelBusyReason,
} from './types';
import type { ModelFileProvider } from './fileProvider';
import { CURATED_MODELS } from './catalog';
import { isLowbitQModelId } from './lowbit-q/lowbitQManager';
import { debugLog, debugReport } from '@store/debug-store';

// ---------------------------------------------------------------------------
// Worker proxy interfaces (engine-specific facades)
// ---------------------------------------------------------------------------

export interface WllamaWorkerProxy {
  generate(prompt: string, opts: GenerateOptions, onChunk: (text: string) => void, reason?: LocalModelBusyReason): Promise<string>;
  abort(): void;
}

export interface TransformersWorkerProxy {
  classify(text: string, reason?: LocalModelBusyReason): Promise<ClassificationLabel[]>;
}

export interface RuntimeLogEvent {
  modelId: string;
  level: string;
  text: string;
  timestamp: number;
}

export interface RuntimeDiagnosticEvent {
  modelId: string;
  phase: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface RuntimeLoadProgressEvent {
  modelId: string;
  phase: string;
  percent: number;
  detail: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal engine entry
// ---------------------------------------------------------------------------

interface EngineEntry {
  worker: Worker;
  engine: LocalModelEngine;
  status: LocalModelStatus;
  capabilities: LocalModelCapabilities | null;
  /** Monotonically increasing request ID for the worker message protocol */
  nextId: number;
  /** Pending request resolvers keyed by request ID */
  pending: Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>;
  /** Current streaming chunk callback (for wllama generate) */
  onChunk: ((text: string) => void) | null;
  /** Abort flag — checked by the worker to stop generation */
  abortRequested: boolean;
  /** Why this model is currently busy (only meaningful when status === 'busy') */
  busyReason?: LocalModelBusyReason;
}

interface LoadModelOptions {
  forceDisableWebGPU?: boolean;
}

function formatDebugValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizePayload(payload: Record<string, unknown>): string {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'fullText' && typeof value === 'string') {
      clone.fullTextLength = value.length;
    } else if (key === 'text' && typeof value === 'string') {
      clone.textLength = value.length;
    } else if (key === 'file' && value instanceof Blob) {
      clone[key] = {
        name: value instanceof File ? value.name : '(blob)',
        size: value.size,
        type: value.type,
      };
    } else if (key === 'files' && Array.isArray(value) && value.every((v) => v instanceof Blob)) {
      const blobs = value as Blob[];
      clone[key] = {
        count: blobs.length,
        totalSize: blobs.reduce((s, b) => s + b.size, 0),
        names: blobs.map((b) => (b instanceof File ? b.name : '(blob)')),
      };
    } else if (key === 'fileEntries' && Array.isArray(value)) {
      clone[key] = value.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const obj = entry as Record<string, unknown>;
        const file = obj.file;
        return {
          ...obj,
          file: file instanceof Blob ? {
            name: file instanceof File ? file.name : '(blob)',
            size: file.size,
            type: file.type,
          } : file,
        };
      });
    } else if (typeof value === 'string' && value.length > 500) {
      clone[key] = `${value.slice(0, 500)}... (${value.length} chars)`;
    } else {
      clone[key] = value;
    }
  }
  return formatDebugValue(clone);
}

function emitRuntimeDebugLog(modelId: string, level: string, message: string, timestamp = Date.now()): void {
  debugLog({
    source: `llm:${formatModelLogName(modelId)}`,
    level,
    message,
    timestamp,
  });
}

function shouldLogWorkerInfo(text: string): boolean {
  return !(
    text.startsWith('worker: [wllamaWorker] generate start')
    || text.startsWith('worker: [wllamaWorker] generate done')
  );
}

function formatModelLogName(modelId: string): string {
  const preflightPrefix = '__wllama_webgpu_preflight__:';
  if (modelId.startsWith(preflightPrefix)) return 'webgpu-preflight';

  const localFileMatch = modelId.match(/^local-file--[^-]+--(.+)$/);
  if (localFileMatch) return localFileMatch[1];

  const trimmed = modelId.replace(/^local-file--/, '');
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed;
}

// ---------------------------------------------------------------------------
// WASM capabilities (in-memory only — not persisted to store)
// ---------------------------------------------------------------------------

export interface WasmCapabilities {
  webgpu: boolean;
  memory64: boolean;
  multiThread: boolean;
}

// ---------------------------------------------------------------------------
// LocalModelRuntime
// ---------------------------------------------------------------------------

export class LocalModelRuntime {
  private engines = new Map<string, EngineEntry>();
  private wasmCaps = new Map<string, WasmCapabilities>();
  private webGpuEnabled: boolean | null = null;
  private listeners = new Set<() => void>();
  private logListeners = new Set<(event: RuntimeLogEvent) => void>();
  private diagnosticListeners = new Set<(event: RuntimeDiagnosticEvent) => void>();
  private loadProgressListeners = new Set<(event: RuntimeLoadProgressEvent) => void>();

  // -------------------------------------------------------------------------
  // Status queries
  // -------------------------------------------------------------------------

  getStatus(modelId: string): LocalModelStatus {
    return this.engines.get(modelId)?.status ?? 'idle';
  }

  isLoaded(modelId: string): boolean {
    const s = this.getStatus(modelId);
    return s === 'ready' || s === 'busy';
  }

  isBusy(modelId: string): boolean {
    return this.getStatus(modelId) === 'busy';
  }

  getBusyReason(modelId: string): LocalModelBusyReason | undefined {
    return this.engines.get(modelId)?.busyReason;
  }

  getCapabilities(modelId: string): LocalModelCapabilities | null {
    return this.engines.get(modelId)?.capabilities ?? null;
  }

  getWasmCapabilities(modelId: string): WasmCapabilities | null {
    return this.wasmCaps.get(modelId) ?? null;
  }

  getWebGpuEnabled(): boolean | null {
    return this.webGpuEnabled;
  }

  setWebGpuEnabled(enabled: boolean | null): void {
    this.webGpuEnabled = enabled;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async preflightWllamaWebGPU(): Promise<boolean> {
    const modelId = `__wllama_webgpu_preflight__:${Date.now()}`;
    const worker = this.createWorker('wllama');
    const entry: EngineEntry = {
      worker,
      engine: 'wllama',
      status: 'loading',
      capabilities: null,
      nextId: 1,
      pending: new Map(),
      onChunk: null,
      abortRequested: false,
    };
    this.engines.set(modelId, entry);

    worker.onmessage = (ev: MessageEvent) => {
      this.handleWorkerMessage(modelId, ev.data);
    };

    worker.onerror = (err: ErrorEvent) => {
      for (const [, p] of entry.pending) {
        p.reject(new Error(err.message));
      }
      entry.pending.clear();
    };

    try {
      this.emitDiagnostic({
        modelId,
        phase: 'runtime-webgpu-preflight-request',
        timestamp: Date.now(),
        payload: { allowWebGPU: true },
      });
      await this.sendRequest(modelId, {
        type: 'init',
        isLowbitQ: false,
        preferMemory64: false,
        allowWebGPU: true,
      });
      if (this.wasmCaps.get(modelId)?.webgpu !== true) return false;
      await this.sendRequest(modelId, { type: 'preflightLoadRuntime' });
      return true;
    } catch (e) {
      console.warn('[LocalModelRuntime] WebGPU preflight failed:', (e as Error).message);
      return false;
    } finally {
      worker.terminate();
      for (const [, p] of entry.pending) {
        p.reject(new Error('WebGPU preflight worker terminated'));
      }
      entry.pending.clear();
      this.engines.delete(modelId);
      this.wasmCaps.delete(modelId);
    }
  }

  async loadModel(def: LocalModelDefinition, provider: ModelFileProvider, options: LoadModelOptions = {}): Promise<void> {
    if (this.isLoaded(def.id)) {
      throw new Error(`Model ${def.id} is already loaded`);
    }

    const worker = this.createWorker(def.engine);
    const entry: EngineEntry = {
      worker,
      engine: def.engine,
      status: 'loading',
      capabilities: null,
      nextId: 1,
      pending: new Map(),
      onChunk: null,
      abortRequested: false,
    };
    this.engines.set(def.id, entry);
    this.notifyListeners();

    worker.onmessage = (ev: MessageEvent) => {
      this.handleWorkerMessage(def.id, ev.data);
    };

    worker.onerror = (err: ErrorEvent) => {
      this.setStatus(def.id, 'error');
      // Reject all pending requests
      for (const [, p] of entry.pending) {
        p.reject(new Error(err.message));
      }
      entry.pending.clear();
    };

    try {
      let wllamaFiles: (File | Blob)[] = [];
      let preferMemory64 = false;
      let allowWebGPU = false;
      if (def.engine === 'wllama') {
        wllamaFiles = await provider.getGgufFiles();
        // 32-bit compat builds are more broadly stable. Memory64 is only
        // required once the total model size can exceed 32-bit address/file-size limits.
        // NOTE: preferMemory64 selects the Memory64 WASM build, but does NOT guarantee
        // load success — the WASM heap must still accommodate the total model size.
        const totalSize = wllamaFiles.reduce((s, f) => s + f.size, 0);
        preferMemory64 = totalSize >= 2 * 1024 * 1024 * 1024;
        const webGpuSetting = this.webGpuEnabled;
        // Large (>2 GiB) GGUF files require Memory64. Our current WebGPU
        // Memory64 runtime path is still unstable, so keep those loads on the
        // rebuilt CPU WASM path instead of failing once and retrying.
        allowWebGPU = !preferMemory64 && !options.forceDisableWebGPU && webGpuSetting !== false;
      }

      // Init worker — pass flags so the worker can select the right WASM.
      const isLowbitQ = def.engine === 'wllama' && isLowbitQModelId(def.id);
      this.emitDiagnostic({
        modelId: def.id,
        phase: 'runtime-init-request',
        timestamp: Date.now(),
        payload: {
          engine: def.engine,
          isLowbitQ,
          preferMemory64,
          allowWebGPU,
          forceDisableWebGPU: options.forceDisableWebGPU === true,
          webGpuSetting: this.webGpuEnabled,
        },
      });
      console.info('[LocalModelRuntime] init worker for', def.id, 'engine:', def.engine, 'isLowbitQ:', isLowbitQ, 'preferMemory64:', preferMemory64, 'allowWebGPU:', allowWebGPU);
      await this.sendRequest(def.id, { type: 'init', isLowbitQ, preferMemory64, allowWebGPU });
      console.info('[LocalModelRuntime] init done for', def.id);

      // Load model — engine-specific
      if (def.engine === 'wllama') {
        const totalFileSize = wllamaFiles.reduce((s, f) => s + f.size, 0);
        const shardInfo = wllamaFiles.length > 1 ? ` (${wllamaFiles.length} shards)` : '';
        console.info('[LocalModelRuntime] loading model file:', (wllamaFiles[0] as File).name ?? '(blob)', shardInfo, 'totalSize:', totalFileSize);
        // Look up expected context length from catalog/store so the worker
        // allocates the right amount of KV cache instead of a fixed default.
        const expectedCtx = this.lookupExpectedContextLength(def.id);
        const result = await this.sendRequest(def.id, {
          type: 'load', files: wllamaFiles, ...(expectedCtx ? { expectedContextLength: expectedCtx } : {}),
        }) as {
          contextLength?: number;
          nativeContextLength?: number;
        };
        console.info('[LocalModelRuntime] model loaded, contextLength:', result?.contextLength, 'nativeContextLength:', result?.nativeContextLength);
        entry.capabilities = {
          contextLength: result?.contextLength,
          nativeContextLength: result?.nativeContextLength,
          supportsStreaming: true,
          engine: 'wllama',
        };
        // Persist discovered context length to the store so modelLookup can use it
        this.persistContextLength(def.id, result?.contextLength, result?.nativeContextLength);
      } else {
        // Transformers.js — send file entries to worker for customCache
        const fileEntries = await provider.getFileEntries();
        await this.sendRequest(def.id, {
          type: 'loadClassifier',
          modelId: def.origin,
          fileEntries,
        });
        entry.capabilities = {
          supportsStreaming: false,
          engine: 'transformers.js',
        };
      }

      this.setStatus(def.id, 'ready');
    } catch (e) {
      const selectedWebGPU = this.wasmCaps.get(def.id)?.webgpu === true;
      console.error('[LocalModelRuntime] loadModel failed for', def.id, ':', (e as Error).message);
      this.setStatus(def.id, 'error');
      if (def.engine === 'wllama' && selectedWebGPU && !options.forceDisableWebGPU) {
        this.emitDiagnostic({
          modelId: def.id,
          phase: 'runtime-webgpu-fallback',
          timestamp: Date.now(),
          payload: {
            reason: (e as Error).message,
          },
        });
        console.warn('[LocalModelRuntime] WebGPU load failed for', def.id, 'retrying with CPU WASM');
        emitRuntimeDebugLog(def.id, 'warn', 'WebGPU load failed; retrying this load with CPU WASM without changing the WebGPU setting');
        worker.terminate();
        entry.pending.clear();
        this.engines.delete(def.id);
        this.wasmCaps.delete(def.id);
        this.notifyListeners();
        await this.loadModel(def, provider, { forceDisableWebGPU: true });
        return;
      }
      throw e;
    }
  }

  async unloadModel(modelId: string): Promise<void> {
    const entry = this.engines.get(modelId);
    if (!entry) return;

    try {
      await this.sendRequest(modelId, { type: 'unload' });
    } catch {
      // Best-effort
    }

    entry.worker.terminate();
    entry.pending.clear();
    this.engines.delete(modelId);
    this.notifyListeners();
  }

  abort(modelId: string): void {
    const entry = this.engines.get(modelId);
    if (!entry || entry.status !== 'busy') return;
    entry.abortRequested = true;
    // Send abort message to worker
    entry.worker.postMessage({ id: 0, type: 'abort' });
    // Reject all pending generate requests immediately so the generate()
    // proxy doesn't hang waiting for the worker response.  The worker will
    // still process the abort and send a 'done' message, but by then the
    // pending map is already empty so the late response is silently ignored.
    const abortError = new DOMException('Generation aborted', 'AbortError');
    for (const [id, pending] of entry.pending) {
      entry.pending.delete(id);
      pending.reject(abortError);
    }
  }

  /**
   * Ensure a model is loaded and ready. If already loaded, returns immediately.
   * If currently loading, waits for the load to complete.
   * Otherwise, looks up the model definition and loads it from OPFS.
   */
  async ensureLoaded(modelId: string): Promise<void> {
    if (this.isLoaded(modelId)) return;

    const status = this.getStatus(modelId);
    if (status === 'loading') {
      return this.waitForLoad(modelId);
    }

    const def = findModelDefinition(modelId);
    if (!def) throw new Error(`Model ${modelId} not found in store or catalog`);
    if (def.source === 'ephemeral-file') throw new Error('Cannot auto-load ephemeral model');

    // Import OpfsFileProvider lazily to avoid circular dependency
    const { OpfsFileProvider } = await import('./storage');
    const provider = new OpfsFileProvider(modelId, def.manifest);
    await this.loadModel(def, provider);
  }

  /**
   * Wait for a model that is currently loading to become ready.
   */
  private waitForLoad(modelId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const unsub = this.subscribe(() => {
        const s = this.getStatus(modelId);
        if (s === 'ready' || s === 'busy') {
          unsub();
          resolve();
        } else if (s === 'error' || s === 'idle' || s === 'unloaded') {
          unsub();
          reject(new Error(`Model ${modelId} failed to load (status: ${s})`));
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Engine-specific proxies
  // -------------------------------------------------------------------------

  getWllamaEngine(modelId: string): WllamaWorkerProxy | null {
    const entry = this.engines.get(modelId);
    if (!entry || entry.engine !== 'wllama') return null;
    if (!this.isLoaded(modelId)) return null;

    return {
      generate: async (prompt: string, opts: GenerateOptions, onChunk: (text: string) => void, reason?: LocalModelBusyReason): Promise<string> => {
        if (this.isBusy(modelId)) {
          throw new Error(`Model ${modelId} is busy`);
        }
        this.setStatus(modelId, 'busy', reason ?? 'chat');
        entry.onChunk = onChunk;
        entry.abortRequested = false;

        try {
          const result = await this.sendRequest(modelId, {
            type: 'generate',
            prompt,
            maxTokens: opts.maxTokens ?? 256,
            temperature: opts.temperature ?? 0.7,
            stop: opts.stop,
          }) as { fullText: string; tokensGenerated: number };

          return result.fullText;
        } finally {
          entry.onChunk = null;
          if (entry.status === 'busy') {
            this.setStatus(modelId, 'ready');
          }
        }
      },
      abort: () => this.abort(modelId),
    };
  }

  getTransformersEngine(modelId: string): TransformersWorkerProxy | null {
    const entry = this.engines.get(modelId);
    if (!entry || entry.engine !== 'transformers.js') return null;
    if (!this.isLoaded(modelId)) return null;

    return {
      classify: async (text: string, reason?: LocalModelBusyReason): Promise<ClassificationLabel[]> => {
        if (this.isBusy(modelId)) {
          throw new Error(`Model ${modelId} is busy`);
        }
        this.setStatus(modelId, 'busy', reason ?? 'moderation');

        try {
          const result = await this.sendRequest(modelId, {
            type: 'classify',
            text,
          }) as { labels: ClassificationLabel[] };

          return result.labels;
        } finally {
          if (entry.status === 'busy') {
            this.setStatus(modelId, 'ready');
          }
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Change listeners (for React integration)
  // -------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeLogs(listener: (event: RuntimeLogEvent) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  subscribeDiagnostics(listener: (event: RuntimeDiagnosticEvent) => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  subscribeLoadProgress(listener: (event: RuntimeLoadProgressEvent) => void): () => void {
    this.loadProgressListeners.add(listener);
    return () => this.loadProgressListeners.delete(listener);
  }

  /** Snapshot of all model statuses for useSyncExternalStore */
  getSnapshot(): ReadonlyMap<string, LocalModelStatus> {
    const snapshot = new Map<string, LocalModelStatus>();
    for (const [id, entry] of this.engines) {
      snapshot.set(id, entry.status);
    }
    return snapshot;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Persist discovered context length to the Zustand store so that
   * modelLookup can access it before the model is loaded next time.
   */
  private persistContextLength(
    modelId: string,
    contextLength?: number,
    nativeContextLength?: number,
  ): void {
    if (!_storeGetter || (!contextLength && !nativeContextLength)) return;
    const state = _storeGetter();
    const def = state.localModels.find((m) => m.id === modelId);
    if (!def) return;

    const existingMeta = def.displayMeta;
    const newContextLength = nativeContextLength ?? contextLength;
    // Only update if the value actually changed
    if (existingMeta?.contextLength === newContextLength) return;

    state.updateLocalModel(modelId, {
      displayMeta: {
        ...existingMeta,
        supportsTextInference: existingMeta?.supportsTextInference ?? true,
        contextLength: newContextLength,
      },
    });
  }

  /**
   * Look up expected context length from the store or catalog so the worker
   * can allocate the right n_ctx instead of a fixed default.
   */
  private lookupExpectedContextLength(modelId: string): number | undefined {
    // Check store first (persisted from a previous load)
    if (_storeGetter) {
      const def = _storeGetter().localModels.find((m) => m.id === modelId);
      if (def?.displayMeta?.contextLength) return def.displayMeta.contextLength;
    }
    // Fallback to curated catalog
    const cat = CURATED_MODELS.find((c) => c.id === modelId);
    return cat?.displayMeta?.contextLength ?? undefined;
  }

  private createWorker(engine: LocalModelEngine): Worker {
    if (engine === 'wllama') {
      return new Worker(
        new URL('../workers/wllamaWorker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return new Worker(
      new URL('../workers/transformersWorker.ts', import.meta.url),
      { type: 'module' },
    );
  }

  private setStatus(modelId: string, status: LocalModelStatus, busyReason?: LocalModelBusyReason): void {
    const entry = this.engines.get(modelId);
    if (entry) {
      entry.status = status;
      entry.busyReason = status === 'busy' ? busyReason : undefined;
      debugReport(`local-model:${modelId}`, {
        label: 'Local model',
        status: status === 'error' ? 'error' : status === 'loading' || status === 'busy' ? 'active' : 'done',
        detail: `${modelId} ${status}${busyReason ? ` (${busyReason})` : ''}`,
      });
      emitRuntimeDebugLog(modelId, status === 'error' ? 'error' : 'debug', `status=${status}${busyReason ? ` busyReason=${busyReason}` : ''}`);
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitLog(event: RuntimeLogEvent): void {
    emitRuntimeDebugLog(event.modelId, event.level, event.text, event.timestamp);
    for (const listener of this.logListeners) {
      listener(event);
    }
  }

  private emitDiagnostic(event: RuntimeDiagnosticEvent): void {
    emitRuntimeDebugLog(event.modelId, 'debug', `diagnostic ${event.phase}: ${formatDebugValue(event.payload)}`, event.timestamp);
    for (const listener of this.diagnosticListeners) {
      listener(event);
    }
  }

  private emitLoadProgress(event: RuntimeLoadProgressEvent): void {
    debugReport(`local-load:${event.modelId}`, {
      label: 'Local model load',
      status: event.phase === 'error' ? 'error' : event.phase === 'complete' ? 'done' : 'active',
      detail: `${event.phase} ${Math.max(0, Math.round(event.percent))}% ${event.detail}`,
    });
    emitRuntimeDebugLog(event.modelId, event.phase === 'error' ? 'error' : 'debug', `load-progress ${event.phase} ${event.percent}% ${event.detail}`, event.timestamp);
    for (const listener of this.loadProgressListeners) {
      listener(event);
    }
  }

  private sendRequest(modelId: string, payload: Record<string, unknown>): Promise<unknown> {
    const entry = this.engines.get(modelId);
    if (!entry) return Promise.reject(new Error(`No engine for model ${modelId}`));

    const id = entry.nextId++;
    emitRuntimeDebugLog(modelId, 'debug', `request #${id} ${String(payload.type ?? 'unknown')}: ${summarizePayload(payload)}`);
    return new Promise((resolve, reject) => {
      entry.pending.set(id, { resolve, reject });
      entry.worker.postMessage({ ...payload, id });
    });
  }

  private handleWorkerMessage(modelId: string, data: Record<string, unknown>): void {
    const entry = this.engines.get(modelId);
    if (!entry) return;

    const id = data.id as number;
    const type = data.type as string;

    // Worker log forwarding (worker console is not visible in preview tools)
    if (type === '__log') {
      const level = data.level as string;
      const text = data.text as string;
      if (level === 'error') console.error(text);
      else console.info(text);
      if (level !== 'info' || shouldLogWorkerInfo(text)) {
        this.emitLog({
          modelId,
          level,
          text,
          timestamp: Date.now(),
        });
      }
      return;
    }

    if (type === '__diagnostic') {
      const phase = String(data.phase ?? 'unknown');
      const payload = (data.payload as Record<string, unknown> | undefined) ?? {};
      // Capture WASM capabilities from worker-init diagnostic
      if (phase === 'worker-init') {
        this.wasmCaps.set(modelId, {
          webgpu: !!payload.webgpuWasmSelected,
          memory64: !!payload.memory64Selected,
          multiThread: !!payload.multiThreadCapable,
        });
        this.notifyListeners();
      }
      this.emitDiagnostic({
        modelId,
        phase,
        timestamp: Date.now(),
        payload,
      });
      return;
    }

    if (type === '__load_progress') {
      this.emitLoadProgress({
        modelId,
        phase: String(data.phase ?? 'unknown'),
        percent: (data.percent as number) ?? 0,
        detail: String(data.detail ?? ''),
        timestamp: Date.now(),
      });
      return;
    }

    // Streaming chunks don't resolve the pending promise
    if (type === 'chunk') {
      entry.onChunk?.(data.text as string);
      return;
    }

    // Error response
    if (type === 'error') {
      const pending = entry.pending.get(id);
      if (pending) {
        entry.pending.delete(id);
        emitRuntimeDebugLog(modelId, 'error', `response #${id} error: ${String(data.message ?? '')}`);
        pending.reject(new Error(data.message as string));
      }
      return;
    }

    // Success response
    const pending = entry.pending.get(id);
    if (pending) {
      entry.pending.delete(id);
      emitRuntimeDebugLog(modelId, 'debug', `response #${id} ${type}: ${summarizePayload(data)}`);
      pending.resolve(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Model definition lookup (used by ensureLoaded)
// ---------------------------------------------------------------------------

/**
 * Find a model definition by ID.
 * Checks the Zustand store first, then falls back to the curated catalog.
 *
 * Uses lazy import of store to avoid circular dependency.
 */
let _storeGetter: (() => {
  localModels: LocalModelDefinition[];
  updateLocalModel: (id: string, patch: Partial<LocalModelDefinition>) => void;
}) | null = null;

/** Called once by the app to wire up the store for findModelDefinition. */
export function setRuntimeStoreGetter(getter: () => {
  localModels: LocalModelDefinition[];
  updateLocalModel: (id: string, patch: Partial<LocalModelDefinition>) => void;
}): void {
  _storeGetter = getter;
}

export function findModelDefinition(modelId: string): LocalModelDefinition | null {
  if (_storeGetter) {
    const def = _storeGetter().localModels.find((m) => m.id === modelId);
    if (def) return def;
  }

  // Fallback: check curated catalog
  const cat = CURATED_MODELS.find((c) => c.id === modelId);
  if (cat) {
    return {
      id: cat.id,
      engine: cat.engine,
      tasks: cat.tasks,
      label: cat.label,
      origin: cat.huggingFaceRepo,
      source: 'opfs',
      manifest: cat.manifest,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const localModelRuntime = new LocalModelRuntime();
