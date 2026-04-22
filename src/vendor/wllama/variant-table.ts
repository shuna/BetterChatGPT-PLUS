/**
 * Variant table for wllama WASM builds.
 *
 * Each entry describes a WASM build variant, its capability requirements,
 * file names, and adapter flavor. The selection algorithm picks the highest-
 * priority eligible entry given the runtime capability snapshot.
 *
 * File naming convention:
 *   {single,multi}-thread-cpu-compat.wasm          — wasm32 compat, CPU only
 *   {single,multi}-thread-cpu-mem64.wasm           — Memory64, CPU only
 *   {single,multi}-thread-webgpu-compat.wasm       — wasm32 compat, WebGPU + JSPI
 *   {single,multi}-thread-webgpu-asyncify-compat.wasm — wasm32 compat, WebGPU + Asyncify (no JSPI)
 */

export type VariantCapability = 'jspi' | 'mt' | 'memory64' | 'webgpu' | 'exnref';

/**
 * Which JS glue bundle to use for this variant.
 * Each corresponds to a distinct file in src/vendor/wllama/:
 *   cpu-compat       → index.js                 (wasm32 CPU compat build)
 *   cpu-mem64        → mem64-index.js           (Memory64 CPU build)
 *   webgpu           → webgpu-index.js          (WebGPU + JSPI build)
 *   webgpu-asyncify  → webgpu-asyncify-index.js (WebGPU + Asyncify, no JSPI)
 *
 * This is the authoritative source — never derive the glue from WASM file names.
 */
export type GlueKind = 'cpu-compat' | 'cpu-mem64' | 'webgpu' | 'webgpu-asyncify';

/**
 * How the WASM exports are called from the worker:
 *   wrapped-jspi      — JSPI async exports (JSPI-enabled WebGPU WASM)
 *   wrapped-sync      — synchronous exports wrapped in Promise.resolve (CPU WASM)
 *   wrapped-asyncify  — Asyncify async exports (Asyncify WebGPU WASM, no JSPI)
 *   direct            — raw export call, no wrapping (reserved)
 */
export type ExportFlavor = 'direct' | 'wrapped-jspi' | 'wrapped-sync' | 'wrapped-asyncify';

/**
 * Where HEAP* views are available in the worker:
 *   module-proxy  — runtime-adapter.attach() proxies them onto Module
 *   global-view   — already in global scope (standard Emscripten non-modularized build)
 */
export type HeapAccess = 'module-proxy' | 'global-view';

export type VariantId =
  | 'mt-webgpu-jspi-compat'
  | 'st-webgpu-jspi-compat'
  | 'mt-webgpu-asyncify-compat'
  | 'st-webgpu-asyncify-compat'
  | 'mt-cpu-compat'
  | 'st-cpu-compat'
  | 'mt-cpu-mem64'
  | 'st-cpu-mem64';

/** The union of VariantId values with 'auto' for "let the table decide". */
export type VariantOverride = VariantId | 'auto';

export interface VariantEntry {
  readonly id: VariantId;
  /** Capabilities that must ALL be present for this variant to be eligible. */
  readonly required: readonly VariantCapability[];
  /**
   * WASM file names relative to the vendor/wllama/ asset directory.
   * `single` is always set for single-thread use (and as fallback for mt variants).
   * `multi` is set only for multi-thread variants.
   */
  readonly wasm: { readonly single?: string; readonly multi?: string };
  readonly exportFlavor: ExportFlavor;
  readonly heapAccess: HeapAccess;
  /** Higher priority wins when multiple variants are eligible. */
  readonly priority: number;
  /**
   * Which JS glue bundle to use. Authoritative — do not derive from wasm names.
   */
  readonly glue: GlueKind;
  /**
   * Value to assign to Module["pthreadPoolSize"] in attach().
   * Only defined for multi-thread variants; single-thread variants must NOT inject this.
   */
  readonly pthreadPoolSize?: number;
  /** When true, this entry is never selected (build not yet produced). */
  readonly disabled?: boolean;
}

export interface CapabilitySet {
  readonly jspi: boolean;
  readonly mt: boolean;
  readonly memory64: boolean;
  readonly webgpu: boolean;
  readonly exnref: boolean;
}

export interface SelectVariantOptions {
  /**
   * When false (default), memory64 variants are excluded from selection.
   * Set to true when the caller explicitly requests Memory64 mode.
   */
  readonly preferMemory64?: boolean;
  /**
   * Force a specific variant id, bypassing all capability checks.
   * Use only for development overrides.
   */
  readonly forceVariant?: VariantId;
}

export interface ConsideredEntry {
  id: VariantId;
  /** Capabilities that were missing, not requested, or special rejection reasons. */
  rejected: (VariantCapability | 'disabled' | 'no-wasm-path')[];
}

export interface VariantSelection {
  chosen: VariantEntry | null;
  considered: ConsideredEntry[];
  capsSnapshot: CapabilitySet;
}

// ---------------------------------------------------------------------------
// Variant table
// Priority ordering (high → low):
//   mt-webgpu-jspi-compat (100) > mt-webgpu-asyncify-compat (95) >
//   st-webgpu-jspi-compat (90)  > st-webgpu-asyncify-compat (85) >
//   mt-cpu-mem64 (50) > mt-cpu-compat (40) > st-cpu-mem64 (20) > st-cpu-compat (10)
//
// Rationale:
//   a. WebGPU beats CPU — GPU utilisation dominates at current model sizes.
//   b. JSPI WebGPU beats Asyncify WebGPU — lower overhead, smaller output.
//   c. Multi-thread beats single-thread within the same class.
//   d. Asyncify WebGPU variants are active for JSPI-less WebGPU environments.
//   e. st-cpu-compat is the unconditional fallback (no required capabilities).
// ---------------------------------------------------------------------------
export const VARIANT_TABLE: readonly VariantEntry[] = [
  // ── WebGPU + JSPI ─────────────────────────────────────────────────────────
  {
    id: 'mt-webgpu-jspi-compat',
    required: ['jspi', 'mt', 'webgpu'],
    wasm: {
      single: 'single-thread-webgpu-compat.wasm',
      multi: 'multi-thread-webgpu-compat.wasm',
    },
    exportFlavor: 'wrapped-jspi',
    heapAccess: 'module-proxy',
    glue: 'webgpu',
    priority: 100,
    pthreadPoolSize: 0,
  },
  {
    id: 'st-webgpu-jspi-compat',
    required: ['jspi', 'webgpu'],
    wasm: {
      single: 'single-thread-webgpu-compat.wasm',
    },
    exportFlavor: 'wrapped-jspi',
    heapAccess: 'module-proxy',
    glue: 'webgpu',
    priority: 90,
  },
  // ── WebGPU + Asyncify (no JSPI) ───────────────────────────────────────────
  // Targets environments that have WebGPU but not JSPI (e.g. Firefox, some mobile Chrome).
  // Build uses JS-based exceptions (not -fwasm-exceptions) because -sASYNCIFY=1 is
  // incompatible with -fwasm-exceptions under emsdk 5: Binaryen's Asyncify pass fails to
  // expose asyncify_start_unwind from wasmExports when native wasm EH is active.
  // Therefore 'exnref' is NOT required — exnref reflects browser wasm EH support,
  // not a requirement of this build. Documented in vendor/wllama/SpecAndStatus.md.
  // Active for limited rollout/testing in JSPI-less WebGPU environments.
  {
    id: 'mt-webgpu-asyncify-compat',
    required: ['mt', 'webgpu'],
    wasm: {
      single: 'single-thread-webgpu-asyncify-compat.wasm',
      multi: 'multi-thread-webgpu-asyncify-compat.wasm',
    },
    exportFlavor: 'wrapped-asyncify',
    heapAccess: 'module-proxy',
    glue: 'webgpu-asyncify',
    priority: 95,
    pthreadPoolSize: 0,
  },
  {
    id: 'st-webgpu-asyncify-compat',
    required: ['webgpu'],
    wasm: {
      single: 'single-thread-webgpu-asyncify-compat.wasm',
    },
    exportFlavor: 'wrapped-asyncify',
    heapAccess: 'module-proxy',
    glue: 'webgpu-asyncify',
    priority: 85,
  },
  // ── CPU Memory64 ──────────────────────────────────────────────────────────
  // File names reflect current build output; renamed to *-cpu-mem64.wasm in PR2.
  {
    id: 'mt-cpu-mem64',
    required: ['mt', 'memory64'],
    wasm: {
      single: 'single-thread-cpu-mem64.wasm',
      multi: 'multi-thread-cpu-mem64.wasm',
    },
    exportFlavor: 'wrapped-sync',
    heapAccess: 'module-proxy',
    glue: 'cpu-mem64',
    priority: 50,
    pthreadPoolSize: 0,
  },
  {
    id: 'st-cpu-mem64',
    required: ['memory64'],
    wasm: {
      single: 'single-thread-cpu-mem64.wasm',
    },
    exportFlavor: 'wrapped-sync',
    heapAccess: 'module-proxy',
    glue: 'cpu-mem64',
    priority: 20,
  },
  // ── CPU compat ────────────────────────────────────────────────────────────
  {
    id: 'mt-cpu-compat',
    required: ['mt'],
    wasm: {
      single: 'single-thread-cpu-compat.wasm',
      multi: 'multi-thread-cpu-compat.wasm',
    },
    exportFlavor: 'wrapped-sync',
    heapAccess: 'module-proxy',
    glue: 'cpu-compat',
    priority: 40,
    pthreadPoolSize: 0,
  },
  {
    id: 'st-cpu-compat',
    required: [],
    wasm: {
      single: 'single-thread-cpu-compat.wasm',
    },
    exportFlavor: 'wrapped-sync',
    heapAccess: 'module-proxy',
    glue: 'cpu-compat',
    priority: 10,
  },
] as const satisfies readonly VariantEntry[];

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Pure selection function that operates on an arbitrary variant table.
 * Use this in tests to inject a modified table (e.g. with specific variants disabled)
 * without touching the live VARIANT_TABLE or using module mocks.
 */
export function selectVariantFromTable(
  table: readonly VariantEntry[],
  caps: CapabilitySet,
  opts: SelectVariantOptions = {},
): VariantSelection {
  const { preferMemory64 = false, forceVariant } = opts;

  // Force override: select by id directly, but still reject disabled entries
  // and entries with no usable wasm paths to avoid a confusing late failure.
  if (forceVariant) {
    const entry = table.find(v => v.id === forceVariant) ?? null;
    if (!entry) {
      return { chosen: null, considered: [], capsSnapshot: caps };
    }
    if (entry.disabled) {
      return { chosen: null, considered: [{ id: entry.id, rejected: ['disabled'] }], capsSnapshot: caps };
    }
    if (!entry.wasm.single && !entry.wasm.multi) {
      return { chosen: null, considered: [{ id: entry.id, rejected: ['no-wasm-path'] }], capsSnapshot: caps };
    }
    return { chosen: entry, considered: [], capsSnapshot: caps };
  }

  const considered: ConsideredEntry[] = [];

  // When preferMemory64 is false, treat memory64 as absent so that mem64
  // variants are not selected even if the browser supports Memory64.
  const effectiveCaps: CapabilitySet = preferMemory64
    ? caps
    : { ...caps, memory64: false };

  const eligible: VariantEntry[] = [];

  for (const v of table) {
    if (v.disabled) continue;

    const missing = v.required.filter(
      cap => !effectiveCaps[cap as keyof CapabilitySet],
    ) as VariantCapability[];

    if (missing.length > 0) {
      considered.push({ id: v.id, rejected: missing });
    } else {
      eligible.push(v);
    }
  }

  // Higher priority first.
  eligible.sort((a, b) => b.priority - a.priority);
  const chosen = eligible[0] ?? null;

  return { chosen, considered, capsSnapshot: caps };
}

export function selectVariant(
  caps: CapabilitySet,
  opts: SelectVariantOptions = {},
): VariantSelection {
  return selectVariantFromTable(VARIANT_TABLE, caps, opts);
}
