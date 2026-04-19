/**
 * Runtime adapter interface for wllama WASM worker.
 *
 * The adapter abstracts the differences between:
 *   - JSPI vs non-JSPI export calling convention
 *   - Memory64 (BigInt pointers) vs wasm32 (Number pointers)
 *   - Single-thread vs multi-thread Module["pthreadPoolSize"] injection
 *   - HEAP* view availability (module-proxy vs global-view)
 *
 * PR1: This file defines the interface and the ExportFlavor dispatch type.
 * The actual implementation lives in the LLAMA_CPP_WORKER_CODE string
 * (vendor/wllama-src/src/workers-code/llama-cpp.js), which will be
 * restructured in PR3 to match this interface explicitly.
 *
 * Usage:
 *   The worker calls Module._wllama_* directly today; the adapter will
 *   wrap those calls and provide a uniform async surface regardless of
 *   variant flavor.
 */

import type { VariantEntry } from './variant-table';

/** Pointer type — Number for wasm32 (compat), BigInt for Memory64. */
export type Ptr = number | bigint;

/**
 * Uniform async interface for calling wllama WASM exports.
 * All methods return Promises regardless of whether the underlying
 * WASM build is synchronous (wrapped-sync) or JSPI-async (wrapped-jspi).
 */
export interface WllamaRuntime {
  readonly variantId: string;
  readonly variant: VariantEntry;

  /**
   * Called once after the Emscripten Module is ready.
   * Performs:
   *   - HEAP* view proxy onto Module (heapAccess === 'module-proxy')
   *   - Module["pthreadPoolSize"] injection (multi-thread variants only)
   */
  attach(Module: unknown): void;

  /** Normalise a raw pointer value to the JS number space. */
  fromPtr(p: Ptr): number;

  /** Allocate `size` bytes in WASM heap. Returns the pointer. */
  malloc(size: number): Promise<Ptr>;

  /** Invoke wllama_start(). Returns pointer to result string (or 0). */
  start(): Promise<Ptr>;

  /**
   * Invoke wllama_action(actionId, heapPtr).
   * Returns pointer to output buffer (or 0 on failure).
   */
  action(actionId: Ptr, reqPtr: Ptr): Promise<Ptr>;

  /** Invoke wllama_exit(). Returns pointer to result string (or 0). */
  exit(): Promise<Ptr>;

  /**
   * Invoke wllama_debug(). Returns pointer to debug string, or null
   * when wllama_debug is not exported by this build.
   * Must NOT affect preflight success/failure.
   */
  debug(): Promise<Ptr | null>;
}

/**
 * Factory stub — in PR1 this is intentionally unimplemented.
 * It exists to satisfy import sites and will be replaced in PR3
 * when the worker string is restructured.
 *
 * @throws Always — call site should not reach this in PR1.
 */
export function createAdapter(_entry: VariantEntry): WllamaRuntime {
  throw new Error(
    'createAdapter is not yet implemented. ' +
    'Adapter logic lives in LLAMA_CPP_WORKER_CODE (PR3 work).',
  );
}
