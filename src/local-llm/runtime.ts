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
  GenerateOptions,
  ClassificationLabel,
} from './types';
import type { ModelFileProvider } from './fileProvider';

// ---------------------------------------------------------------------------
// Worker proxy interfaces (engine-specific facades)
// ---------------------------------------------------------------------------

export interface WllamaWorkerProxy {
  generate(prompt: string, opts: GenerateOptions, onChunk: (text: string) => void): Promise<string>;
  abort(): void;
}

export interface TransformersWorkerProxy {
  classify(text: string): Promise<ClassificationLabel[]>;
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
}

// ---------------------------------------------------------------------------
// LocalModelRuntime
// ---------------------------------------------------------------------------

export class LocalModelRuntime {
  private engines = new Map<string, EngineEntry>();
  private listeners = new Set<() => void>();

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

  getCapabilities(modelId: string): LocalModelCapabilities | null {
    return this.engines.get(modelId)?.capabilities ?? null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async loadModel(def: LocalModelDefinition, provider: ModelFileProvider): Promise<void> {
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
      // Init worker
      await this.sendRequest(def.id, { type: 'init' });

      // Load model — engine-specific
      if (def.engine === 'wllama') {
        const file = await provider.getFile();
        const result = await this.sendRequest(def.id, { type: 'load', file }) as { contextLength?: number };
        entry.capabilities = {
          contextLength: result?.contextLength,
          supportsStreaming: true,
          engine: 'wllama',
        };
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
      this.setStatus(def.id, 'error');
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
  }

  // -------------------------------------------------------------------------
  // Engine-specific proxies
  // -------------------------------------------------------------------------

  getWllamaEngine(modelId: string): WllamaWorkerProxy | null {
    const entry = this.engines.get(modelId);
    if (!entry || entry.engine !== 'wllama') return null;
    if (!this.isLoaded(modelId)) return null;

    return {
      generate: async (prompt: string, opts: GenerateOptions, onChunk: (text: string) => void): Promise<string> => {
        if (this.isBusy(modelId)) {
          throw new Error(`Model ${modelId} is busy`);
        }
        this.setStatus(modelId, 'busy');
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
      classify: async (text: string): Promise<ClassificationLabel[]> => {
        if (this.isBusy(modelId)) {
          throw new Error(`Model ${modelId} is busy`);
        }
        this.setStatus(modelId, 'busy');

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

  private setStatus(modelId: string, status: LocalModelStatus): void {
    const entry = this.engines.get(modelId);
    if (entry) {
      entry.status = status;
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private sendRequest(modelId: string, payload: Record<string, unknown>): Promise<unknown> {
    const entry = this.engines.get(modelId);
    if (!entry) return Promise.reject(new Error(`No engine for model ${modelId}`));

    const id = entry.nextId++;
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
        pending.reject(new Error(data.message as string));
      }
      return;
    }

    // Success response
    const pending = entry.pending.get(id);
    if (pending) {
      entry.pending.delete(id);
      pending.resolve(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const localModelRuntime = new LocalModelRuntime();
