/**
 * lowbit-Q conversion manager — end-to-end integration with weavelet-canvas.
 *
 * Manages the full conversion lifecycle:
 *   1. Reads source GGUF from OPFS (or a File handle)
 *   2. Spawns conversion worker
 *   3. Saves converted lowbit-Q GGUF to OPFS
 *   4. Generates a LocalModelDefinition for the catalog
 *
 * This module is the single entry-point that the UI calls. It bridges
 * the lowbit-Q conversion pipeline with the existing model management
 * infrastructure (storage.ts, fileProvider.ts, runtime.ts).
 */

import type {
  ConversionProgress,
  ConversionProgressMessage,
  ConversionDoneMessage,
  ConversionErrorMessage,
} from './types';
import type {
  LocalModelDefinition,
  LocalModelDisplayMeta,
} from '../types';
import {
  saveFile,
  readFile,
  verifyStoredModel,
} from '../storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LowbitQConversionResult {
  /** Generated lowbit-Q model definition, ready for catalog/store insertion */
  modelDef: LocalModelDefinition;
  /** Original file size in bytes */
  originalSize: number;
  /** Converted file size in bytes (as stored in OPFS) */
  convertedSize: number;
  /** Compression ratio (convertedSize / originalSize) */
  compressionRatio: number;
  /** Per-tensor conversion records (if computeQuality was requested) */
  tensorRecords?: Array<{
    name: string;
    layerIndex: number | null;
    family: string;
    converted: boolean;
    nmse: number | null;
    originalSizeBytes: number;
    lowbitQSizeBytes: number | null;
    dims: number[];
  }>;
}

export interface LowbitQConversionCallbacks {
  onProgress?: (progress: ConversionProgress) => void;
  onComplete?: (result: LowbitQConversionResult) => void;
  onError?: (error: string) => void;
  /** lowbit-Q conversion mode (which tensors to convert). Default: 'all' */
  convertMode?: string;
  /** Whether to compute per-tensor quality metrics (NMSE). Default: false */
  computeQuality?: boolean;
}

// ---------------------------------------------------------------------------
// Model ID / filename generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic model ID for a lowbit-Q-converted model.
 *
 * Always appends --lowbit-q to preserve the source variant identity:
 *   hf--prism-ml--bonsai-8b-gguf--q4_k_m → hf--prism-ml--bonsai-8b-gguf--q4_k_m--lowbit-q
 *   hf--prism-ml--bonsai-8b-gguf--q8_0   → hf--prism-ml--bonsai-8b-gguf--q8_0--lowbit-q
 *   smollm2-360m-instruct-q8              → smollm2-360m-instruct-q8--lowbit-q
 */
export function generateLowbitQModelId(sourceModelId: string): string {
  return `${sourceModelId}--lowbit-q`;
}

/**
 * Check if a model ID represents a lowbit-Q-converted model.
 * Also accepts the legacy `--onebit` suffix for pre-rename models.
 */
export function isLowbitQModelId(modelId: string): boolean {
  return modelId.endsWith('--lowbit-q') || modelId.endsWith('--onebit');
}

/**
 * Generate the filename for a lowbit-Q GGUF stored in OPFS.
 */
export function generateLowbitQFilename(sourceFileName: string): string {
  return sourceFileName.replace(/\.gguf$/i, '.lowbit-q.gguf');
}

// ---------------------------------------------------------------------------
// Conversion manager
// ---------------------------------------------------------------------------

export class LowbitQConversionManager {
  private worker: Worker | null = null;
  private pendingResolve: ((result: LowbitQConversionResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private callbacks: LowbitQConversionCallbacks = {};

  /**
   * Convert a source model to lowbit-Q format and persist to OPFS.
   *
   * This is the primary integration point. The full flow is:
   *   1. Read source GGUF from OPFS (via sourceModelId + sourceFileName)
   *   2. Spawn conversion worker → produce lowbit-Q GGUF blob
   *   3. Save lowbit-Q GGUF blob to OPFS under the lowbit-Q model ID
   *   4. Return a LocalModelDefinition ready for catalog insertion
   *
   * @param sourceModelId  - Model ID of the source model in OPFS
   * @param sourceFileName - GGUF filename within the source model's OPFS dir
   * @param sourceLabel    - Human-readable label for the source model
   * @param callbacks      - Progress and completion callbacks
   */
  async convertFromOpfs(
    sourceModelId: string,
    sourceFileName: string,
    sourceLabel: string,
    callbacks: LowbitQConversionCallbacks = {},
  ): Promise<LowbitQConversionResult> {
    // Step 1: Read source file from OPFS
    const sourceFile = await readFile(sourceModelId, sourceFileName);
    return this.convertFromFile(sourceFile, sourceModelId, sourceLabel, callbacks);
  }

  /**
   * Convert a source GGUF File to lowbit-Q format and persist to OPFS.
   *
   * Use this when the source file is provided directly (e.g. from
   * <input type="file"> or from a just-completed download).
   */
  async convertFromFile(
    sourceFile: File,
    sourceModelId: string,
    sourceLabel: string,
    callbacks: LowbitQConversionCallbacks = {},
  ): Promise<LowbitQConversionResult> {
    this.callbacks = callbacks;

    return new Promise<LowbitQConversionResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.worker = new Worker(
        new URL('../../workers/lowbitQConversionWorker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = (ev: MessageEvent) => {
        this.handleWorkerMessage(
          ev.data, sourceModelId, sourceLabel, sourceFile.name,
        );
      };

      this.worker.onerror = (ev: ErrorEvent) => {
        const errorMsg = `変換ワーカーエラー: ${ev.message}`;
        this.callbacks.onError?.(errorMsg);
        this.pendingReject?.(new Error(errorMsg));
        this.cleanup();
      };

      this.worker.postMessage({
        id: 1,
        type: 'start',
        sourceFile,
        convertMode: callbacks.convertMode,
        computeQuality: callbacks.computeQuality,
      });
    });
  }

  /**
   * Cancel an in-progress conversion.
   */
  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.pendingReject?.(new Error('変換がキャンセルされました'));
      this.cleanup();
    }
  }

  private async handleWorkerMessage(
    msg: ConversionProgressMessage | ConversionDoneMessage | ConversionErrorMessage,
    sourceModelId: string,
    sourceLabel: string,
    sourceFileName: string,
  ): Promise<void> {
    switch (msg.type) {
      case 'progress':
        this.callbacks.onProgress?.(msg.progress);
        break;

      case 'done': {
        try {
          const lowbitQModelId = generateLowbitQModelId(sourceModelId);
          const lowbitQFileName = generateLowbitQFilename(sourceFileName);

          // Step 3: Save converted blob to OPFS
          this.callbacks.onProgress?.({
            stage: 'writing',
            currentTensor: 0,
            totalTensors: 0,
            currentTensorName: 'OPFSに保存中...',
            percent: 95,
          });

          await saveFile(lowbitQModelId, lowbitQFileName, msg.result);

          // Step 4: Build model definition
          const displayMeta: LocalModelDisplayMeta = {
            supportsTextInference: true,
            quantization: 'lowbit-q',
            sourceLabel: 'search',
          };

          const modelDef: LocalModelDefinition = {
            id: lowbitQModelId,
            engine: 'wllama',
            tasks: ['generation'],
            label: `${sourceLabel} (lowbit-Q)`,
            origin: sourceModelId,
            source: 'opfs',
            manifest: {
              kind: 'single-file',
              entrypoint: lowbitQFileName,
            },
            fileSize: msg.convertedSize,
            lastFileName: lowbitQFileName,
            displayMeta,
          };

          // Verify the saved file
          const verifyResult = await verifyStoredModel(lowbitQModelId, modelDef.manifest);
          if (verifyResult !== 'saved') {
            throw new Error(
              `OPFS検証に失敗しました: 保存状態=${verifyResult}。ストレージに問題がある可能性があります。`,
            );
          }

          const result: LowbitQConversionResult = {
            modelDef,
            originalSize: msg.originalSize,
            convertedSize: msg.convertedSize,
            compressionRatio: msg.convertedSize / msg.originalSize,
            tensorRecords: msg.tensorRecords,
          };

          this.callbacks.onProgress?.({
            stage: 'done',
            currentTensor: 0,
            totalTensors: 0,
            currentTensorName: '',
            percent: 100,
          });

          this.callbacks.onComplete?.(result);
          this.pendingResolve?.(result);
        } catch (e) {
          const err = e as Error;
          this.callbacks.onError?.(err.message);
          this.pendingReject?.(err);
        } finally {
          this.cleanup();
        }
        break;
      }

      case 'error':
        this.callbacks.onError?.(msg.message);
        this.pendingReject?.(new Error(msg.message));
        this.cleanup();
        break;
    }
  }

  private cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingResolve = null;
    this.pendingReject = null;
    this.callbacks = {};
  }
}

/**
 * Check if a GGUF file is a lowbit-Q-converted file by reading its metadata.
 */
export async function isLowbitQGGUF(file: File | Blob): Promise<boolean> {
  if (file.size < 32) return false;

  const headerSize = Math.min(file.size, 16384);
  const buffer = await file.slice(0, headerSize).arrayBuffer();

  try {
    const { parseGGUFHeader } = await import('./ggufParser');
    const header = parseGGUFHeader(buffer);
    return header.metadata.has('lowbit-q.version') || header.metadata.has('onebit.version');
  } catch {
    return false;
  }
}

/**
 * Check if a lowbit-Q-converted version already exists in OPFS.
 *
 * Uses getDirectoryHandle WITHOUT { create: true } to avoid
 * creating empty directories as a side effect.
 */
export async function hasLowbitQVersion(sourceModelId: string): Promise<boolean> {
  const lowbitQModelId = generateLowbitQModelId(sourceModelId);
  try {
    const root = await navigator.storage.getDirectory();
    const modelsRoot = await root.getDirectoryHandle('models', { create: false });
    const dir = await modelsRoot.getDirectoryHandle(lowbitQModelId, { create: false });
    for await (const [name, handle] of (dir as any).entries()) {
      if (handle.kind === 'file' && (name.endsWith('.lowbit-q.gguf') || name.endsWith('.onebit.gguf'))) {
        const file = await handle.getFile();
        if (file.size > 0) return true;
      }
    }
  } catch {
    // Directory doesn't exist → no lowbit-Q version
  }
  return false;
}
