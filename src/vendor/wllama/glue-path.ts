/**
 * Maps GlueKind to the corresponding JS glue bundle path.
 *
 * Used by both wllamaWorker.ts (for dynamic import) and Playwright tests
 * (for direct browser-side import). This is the single source of truth —
 * never derive glue paths from WASM file names.
 */
import type { GlueKind } from './variant-table';

const GLUE_FILE: Record<GlueKind, string> = {
  'cpu-compat': 'index.js',
  'cpu-mem64':  'mem64-index.js',
  'webgpu':     'webgpu-index.js',
};

/**
 * Returns the browser-accessible URL path for a given glue kind.
 * Used in Playwright tests and other browser-context dynamic imports.
 */
export function glueUrlPath(glue: GlueKind): string {
  return `/src/vendor/wllama/${GLUE_FILE[glue]}`;
}

/**
 * Returns the relative module path from src/workers/ for dynamic import
 * inside wllamaWorker.ts.
 */
export function glueWorkerRelPath(glue: GlueKind): string {
  return `../vendor/wllama/${GLUE_FILE[glue]}`;
}
