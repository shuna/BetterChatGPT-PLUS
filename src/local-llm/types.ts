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

export type LocalModelManifest = SingleFileManifest | MultiFileManifest;

// ---------------------------------------------------------------------------
// Model definition (persisted in store)
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Runtime status
// ---------------------------------------------------------------------------

/**
 * Lifecycle: idle → loading → ready ⇄ busy → unloaded
 * Error can occur from loading or busy.
 */
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error' | 'unloaded';

// ---------------------------------------------------------------------------
// Capabilities reported after model load
// ---------------------------------------------------------------------------

export interface LocalModelCapabilities {
  contextLength?: number;
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
