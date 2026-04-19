/**
 * File supply abstraction for local LLM models.
 *
 * Handles the difference between:
 * - wllama: needs a single File/Blob (GGUF)
 * - Transformers.js: needs a set of files served via customCache
 *
 * Supports multiple source types:
 * - persistent-handle: File System Access API handles (stored in IDB)
 * - opfs: Origin Private File System
 * - remote-download: HF Hub download
 */

import type { LocalModelSource } from './types';

// ---------------------------------------------------------------------------
// ModelFileProvider interface
// ---------------------------------------------------------------------------

/**
 * Common interface for supplying model files to engines.
 *
 * Implementations are source-specific (ephemeral, persistent-handle, OPFS, etc.)
 * but engines consume them through this uniform interface.
 */
export interface ModelFileProvider {
  readonly source: LocalModelSource;

  /** Check if all required files are available */
  isAvailable(): Promise<boolean>;

  /**
   * For wllama (single-file manifest): return the GGUF File/Blob.
   * Throws if manifest is multi-file.
   */
  getFile(): Promise<File | Blob>;

  /**
   * For wllama (single-file or gguf-sharded manifest): return all GGUF blobs in order.
   *
   * - single-file  → [blob]   (length-1 array, same semantics as getFile())
   * - gguf-sharded → [shard1, shard2, …]  in shard-index order
   * - multi-file   → throws   (use getCustomCache()/getFileEntries() instead)
   *
   * Callers should prefer this over getFile() so that sharded models work
   * without separate code paths.
   */
  getGgufFiles(): Promise<(File | Blob)[]>;

  /**
   * For Transformers.js (multi-file manifest): return a Cache API-compatible
   * object that can be assigned to env.customCache.
   *
   * The match() method receives RequestInfo | URL from Transformers.js and
   * must resolve it to the correct Blob from the file set.
   */
  getCustomCache(): CustomCacheAdapter;

  /**
   * For Transformers.js worker: get file entries as serializable array.
   * Returns [relativePath, Blob][] pairs that can be posted to a Worker.
   * Async because OPFS-backed providers need I/O.
   */
  getFileEntries(): Promise<[string, Blob][]>;

  /** Release held resources (revoke object URLs, release handles, etc.) */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Cache API compatible adapter for Transformers.js
// ---------------------------------------------------------------------------

export interface CustomCacheAdapter {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
}

// ---------------------------------------------------------------------------
// URL → manifest key resolution for Transformers.js
// ---------------------------------------------------------------------------

/**
 * Known URL patterns that Transformers.js generates when resolving model files.
 * These must be verified against Transformers.js source during implementation.
 *
 * 1. HF Hub default: https://huggingface.co/{modelId}/resolve/{revision}/{path}
 * 2. Custom host:    {env.remoteHost}/{modelId}/resolve/{revision}/{path}
 * 3. Local model:    {env.localModelPath}{modelId}/{path}
 *
 * Since we set env.allowRemoteModels = false and env.allowLocalModels = false,
 * the URLs should still be constructed (for cache key purposes) but not fetched.
 */

const HF_RESOLVE_PATTERN = /\/resolve\/[^/]+\/(.+)$/;
const LOCAL_MODEL_PATTERN_SUFFIX = /\/([^/]+)\/(.+)$/;

/**
 * Extract the relative file path from a Transformers.js URL and combine with
 * the model ID to produce a manifest key.
 *
 * @returns The relative file path (e.g. "config.json", "onnx/model.onnx") or null if unrecognized.
 */
export function resolveUrlToManifestKey(url: string, modelId: string): string | null {
  // Pattern 1 & 2: .../resolve/{revision}/{path}
  const resolveMatch = url.match(HF_RESOLVE_PATTERN);
  if (resolveMatch) {
    return resolveMatch[1];
  }

  // Pattern 3: .../{modelId}/{path}
  if (url.includes(modelId)) {
    const idx = url.indexOf(modelId);
    const afterModelId = url.slice(idx + modelId.length);
    if (afterModelId.startsWith('/')) {
      return afterModelId.slice(1);
    }
  }

  // Fallback: try to extract filename from the URL path
  const localMatch = url.match(LOCAL_MODEL_PATTERN_SUFFIX);
  if (localMatch) {
    return localMatch[2];
  }

  return null;
}
