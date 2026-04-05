/**
 * URL → manifest key resolution for Transformers.js customCache.
 *
 * Transformers.js constructs URLs to fetch model files (config.json, tokenizer.json,
 * onnx/model.onnx, etc.). When using env.customCache, we intercept these URLs and
 * resolve them to keys in our local file map.
 *
 * Known URL patterns (must be verified against Transformers.js source):
 * 1. HF Hub:     https://huggingface.co/{modelId}/resolve/{revision}/{path}
 * 2. Custom host: {remoteHost}/{modelId}/resolve/{revision}/{path}
 * 3. Local model: {localModelPath}{modelId}/{path}
 */

import type { CustomCacheAdapter } from './fileProvider';

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

/** Pattern: .../resolve/{revision}/{path} */
const RESOLVE_PATTERN = /\/resolve\/[^/]+\/(.+)$/;

/**
 * Extract the relative file path from a Transformers.js URL.
 *
 * @param url The URL string that Transformers.js is trying to fetch
 * @param modelId The model identifier used with pipeline()
 * @returns The relative path (e.g. "config.json", "onnx/model.onnx") or null
 */
export function resolveUrlToPath(url: string, modelId: string): string | null {
  // Pattern 1 & 2: .../resolve/{revision}/{path}
  const resolveMatch = url.match(RESOLVE_PATTERN);
  if (resolveMatch) {
    return resolveMatch[1];
  }

  // Pattern 3: .../{modelId}/{path}
  const modelIdx = url.indexOf(modelId);
  if (modelIdx !== -1) {
    const afterModel = url.slice(modelIdx + modelId.length);
    if (afterModel.startsWith('/') && afterModel.length > 1) {
      return afterModel.slice(1);
    }
  }

  // Fallback: try last path segments
  try {
    const pathname = new URL(url).pathname;
    // Look for the modelId in the pathname
    const modelPathIdx = pathname.indexOf(modelId);
    if (modelPathIdx !== -1) {
      const afterModel = pathname.slice(modelPathIdx + modelId.length);
      if (afterModel.startsWith('/') && afterModel.length > 1) {
        return afterModel.slice(1);
      }
    }
  } catch {
    // Not a valid URL, ignore
  }

  return null;
}

// ---------------------------------------------------------------------------
// CustomCache adapter backed by a Map<string, Blob>
// ---------------------------------------------------------------------------

/**
 * Create a CustomCacheAdapter that resolves Transformers.js file requests
 * from a local Map<relativePath, Blob>.
 *
 * @param files Map from relative path to Blob (e.g. "config.json" → Blob)
 * @param modelId The model identifier used with pipeline()
 */
export function createLocalCustomCache(
  files: Map<string, Blob>,
  modelId: string,
): CustomCacheAdapter {
  return {
    async match(request: RequestInfo | URL): Promise<Response | undefined> {
      const url = typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.href
          : request.url;

      const path = resolveUrlToPath(url, modelId);
      if (!path) return undefined;

      const blob = files.get(path);
      if (!blob) return undefined;

      return new Response(blob, {
        headers: { 'Content-Type': guessMimeType(path) },
      });
    },

    async put(_request: RequestInfo | URL, _response: Response): Promise<void> {
      // No-op for now. OPFS persistence added in Phase 7.
    },
  };
}

// ---------------------------------------------------------------------------
// MIME type guessing
// ---------------------------------------------------------------------------

function guessMimeType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.onnx')) return 'application/octet-stream';
  if (path.endsWith('.txt')) return 'text/plain';
  if (path.endsWith('.model')) return 'application/octet-stream';
  return 'application/octet-stream';
}
