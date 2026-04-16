/**
 * Type definitions for browser-based local LLM integration.
 *
 * Two engines are supported:
 * - wllama: GGUF models via llama.cpp WASM (CPU, single/multi-thread)
 * - transformers.js: ONNX models via Transformers.js (CPU WASM or WebGPU)
 */

// ---------------------------------------------------------------------------
// Engine & Task
// ---------------------------------------------------------------------------

export type LocalModelEngine = 'wllama' | 'transformers.js';

export type LocalModelTask = 'moderation' | 'quality' | 'analysis' | 'generation';

// ---------------------------------------------------------------------------
// Model file source
// ---------------------------------------------------------------------------

/**
 * How model files are supplied to the runtime.
 *
 * - ephemeral-file: User selects via <input type="file"> each session
 * - persistent-handle: File System Access API handle stored in IDB
 * - opfs: Stored in Origin Private File System
 * - remote-download: Downloaded from HF Hub or other URL
 */
export type LocalModelSource =
  | 'ephemeral-file'
  | 'persistent-handle'
  | 'opfs'
  | 'remote-download';

// ---------------------------------------------------------------------------
// Model manifest — describes the file(s) an engine needs
// ---------------------------------------------------------------------------

/**
 * wllama: a single GGUF file.
 */
export interface SingleFileManifest {
  kind: 'single-file';
  /** e.g. "qwen2.5-0.5b-instruct-q4_k_m.gguf" */
  entrypoint: string;
}

/**
 * Transformers.js: a directory of files (config.json, tokenizer.json, onnx/model.onnx, …).
 */
export interface MultiFileManifest {
  kind: 'multi-file';
  /** Relative paths required to load the model, e.g. ["config.json", "tokenizer.json", "onnx/model.onnx"] */
  requiredFiles: string[];
  /** The primary model file, e.g. "onnx/model.onnx" */
  entrypoint: string;
}

/**
 * wllama: split GGUF model across multiple shards (e.g. model-00001-of-00005.gguf).
 *
 * All shards must be present and are loaded together by wllama.loadModel(blobs[]).
 * Note: Phase 1 infrastructure only — shards still occupy WASM heap in full.
 * WASMヒープ総量の削減はPhase 2 (OPFS-backed virtual FS) で対処する。
 */
export interface GgufShardedManifest {
  kind: 'gguf-sharded';
  /** 先頭シャードのファイル名 e.g. "model-00001-of-00005.gguf" */
  entrypoint: string;
  /** 全シャードファイル名（順序保証済み、entrypoint含む） */
  shards: string[];
  /** 全シャードの合計バイト数 */
  totalSize: number;
}

export type LocalModelManifest = SingleFileManifest | MultiFileManifest | GgufShardedManifest;

// ---------------------------------------------------------------------------
// Model definition (persisted in store)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Display metadata for UI
// ---------------------------------------------------------------------------

export interface LocalModelDisplayMeta {
  releaseDate?: string;
  supportsTextInference: boolean;
  supportsVision?: boolean;
  quantization?: string;
  parameterSizeLabel?: string;
  sourceLabel?: 'catalog' | 'search' | 'imported';
  recommended?: boolean;
  /** Model's trained context length (from GGUF n_ctx_train or known metadata) */
  contextLength?: number;
}

export interface LocalModelDefinition {
  id: string;
  engine: LocalModelEngine;
  tasks: LocalModelTask[];
  label: string;
  /** HuggingFace repo ID or user-given identifier */
  origin: string;
  source: LocalModelSource;
  manifest: LocalModelManifest;
  /** Total file size in bytes (informational) */
  fileSize?: number;
  /** Hint for re-selection (last chosen filename for wllama single-file) */
  lastFileName?: string;
  /** Display metadata for UI (capabilities, quantization, etc.) */
  displayMeta?: LocalModelDisplayMeta;
}

// ---------------------------------------------------------------------------
// Runtime status
// ---------------------------------------------------------------------------

/**
 * Lifecycle: idle → loading → ready ⇄ busy → unloaded
 * Error can occur from loading or busy.
 */
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error' | 'unloaded';

/** Why a model is currently busy — used for UI messaging and conflict resolution. */
export type LocalModelBusyReason = 'chat' | 'evaluation' | 'moderation' | 'test';

// ---------------------------------------------------------------------------
// Capabilities reported after model load
// ---------------------------------------------------------------------------

export interface LocalModelCapabilities {
  /** Allocated context length (what n_ctx was actually granted by the runtime) */
  contextLength?: number;
  /** Model's trained context length from GGUF metadata (n_ctx_train) */
  nativeContextLength?: number;
  supportsStreaming: boolean;
  engine: LocalModelEngine;
}

// ---------------------------------------------------------------------------
// Worker message protocol (shared between wllama and transformers workers)
// ---------------------------------------------------------------------------

export interface WorkerRequest {
  id: number;
  type: string;
  [key: string]: unknown;
}

export interface WorkerResponse {
  id: number;
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Generation options
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

// ---------------------------------------------------------------------------
// Classification result (from Transformers.js)
// ---------------------------------------------------------------------------

export interface ClassificationLabel {
  label: string;
  score: number;
}

// ---------------------------------------------------------------------------
// HF Search types
// ---------------------------------------------------------------------------

export type HfSupportStatus = 'supported' | 'needs-manual-review' | 'unsupported';
/** lightweight | standard | heavy | very-heavy | extreme */
export type GgufVariantStatus = 'supported' | 'not-recommended' | 'unsupported';

export interface HfSearchQuery {
  query: string;
  engine: 'all' | 'wllama' | 'transformers.js';
  sort: 'downloads' | 'lastModified';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  /** Full URL for cursor-based pagination (from Link header) */
  nextUrl?: string;
}

export interface HfSearchResponse {
  results: HfSearchResult[];
  /** URL for the next page, null if no more results */
  nextPageUrl: string | null;
}

export interface HfRepoFile {
  rfilename: string;
  size: number;
}

export interface HfSearchResult {
  repoId: string;
  repoUrl: string;
  description: string;
  tags: string[];
  downloads: number;
  lastModified: string;
  /**
   * Size of recommended variant. null until resolveGgufFiles() completes.
   * After variant resolution, updated to recommended variant's size.
   * After user selects a variant, UI reads GgufVariant.size directly.
   */
  bestCandidateSize: number | null;
  supportStatus: HfSupportStatus;
  supportReason: string;
  engine: LocalModelEngine | null;
}

// ---------------------------------------------------------------------------
// GGUF Variant (per-file within a repo)
// ---------------------------------------------------------------------------

export interface GgufVariant {
  fileName: string;
  size: number;
  /** Raw quantization string extracted from filename, null if unextractable */
  rawQuantization: string | null;
  /** Normalized: lowercase, separators → '-' (e.g. "q4-k-m") */
  normalizedQuantization: string;
  /** Architecture hint parsed from filename */
  architectureHint?: string | null;
  /** Context length hint if parseable from filename */
  contextLengthHint?: number | null;
  /** Per-variant support status */
  supportStatus: GgufVariantStatus;
  /** Reason for non-supported status */
  supportReason?: string;
  /** Human-readable label for UI display */
  label: string;
  /** Whether this is the auto-recommended pick */
  recommended: boolean;
  /**
   * For split GGUF models: all shard filenames in order (including fileName as first).
   * Undefined for single-file models.
   */
  shardFiles?: string[];
}

export interface GgufRepoResolution {
  variants: GgufVariant[];
  recommendedFile: string | null;
  /** Last modified date from repo detail API */
  lastModified?: string;
}

// ---------------------------------------------------------------------------
// Resolved candidate (variant-level, ready for download)
// ---------------------------------------------------------------------------

export interface ResolvedSearchCandidate {
  repoId: string;
  engine: LocalModelEngine;
  label: string;
  manifest: LocalModelManifest;
  downloadFiles: string[];
  estimatedSize: number;
  tasks: LocalModelTask[];
  selectedFile: string;
  displayMeta: LocalModelDisplayMeta;
}

// ---------------------------------------------------------------------------
// Download UI state (derived at render time, not stored)
// ---------------------------------------------------------------------------

export type DownloadUIState =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'resuming'
  | 'partial'
  | 'saved'
  | 'error';
