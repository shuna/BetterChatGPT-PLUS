/**
 * KV Cache + Model total memory optimization design.
 *
 * Phase 4 scope: interfaces, estimation functions, and comparison matrix.
 * Runtime implementation (C++ kernel changes) is deferred to Phase 5.
 *
 * References:
 *   - KIVI (ICML 2024): per-channel Key, per-token Value, 2-bit, training-free
 *   - TurboQuant (ICLR 2026): random rotation + PolarQuant — deferred (custom kernel)
 *   - KVQuant (NeurIPS 2024): per-channel + non-uniform — lower priority
 *
 * Measurement principle:
 *   Total memory = model body + KV cache + inference scratch buffers
 *   KV cache = n_layers * 2 * n_kv_heads * head_dim * seq_len * bytes_per_element
 *
 * Key design question:
 *   Given a fixed WASM 4GB memory budget, what combination of model quant + KV policy
 *   maximizes quality? Heavy model + light KV, or light model + heavy KV?
 */

import { type KVQuantPolicy, kvKeyBytesPerElement, kvValueBytesPerElement } from './types';

// ---------------------------------------------------------------------------
// Re-export KVQuantPolicy for convenience
// ---------------------------------------------------------------------------

export type { KVQuantPolicy };

// ---------------------------------------------------------------------------
// Preset KV policies
// ---------------------------------------------------------------------------

/** No KV cache quantization (FP16, default llama.cpp behavior) */
export const KV_POLICY_FP16: KVQuantPolicy = {
  keyMethod: 'none',
  valueMethod: 'none',
  residualTokens: 0,
  applyRotation: false,
};

/** KIVI-style 2-bit: Keys per-channel-2bit, Values per-token-2bit */
export const KV_POLICY_KIVI_2BIT: KVQuantPolicy = {
  keyMethod: 'per_channel_2bit',
  valueMethod: 'per_token_2bit',
  residualTokens: 128, // keep first 128 tokens in FP16 (KIVI paper recommendation)
  applyRotation: false,
};

/** Conservative 4-bit: Keys per-channel-4bit, Values per-token-4bit */
export const KV_POLICY_4BIT: KVQuantPolicy = {
  keyMethod: 'per_channel_4bit',
  valueMethod: 'per_token_4bit',
  residualTokens: 64,
  applyRotation: false,
};

// ---------------------------------------------------------------------------
// Memory measurement types
// ---------------------------------------------------------------------------

/**
 * Memory breakdown for a given model + KV cache configuration.
 * All sizes in bytes.
 */
export interface MemoryMeasurement {
  /** Sum of all quantized tensor data in the GGUF file */
  modelBodyBytes: number;
  /** KV cache footprint at the given sequence length */
  kvCacheBytes: number;
  /**
   * Estimated peak inference memory:
   *   model body + KV cache + scratch buffers (ggml compute graph, ~10–20% of model body)
   * This is a rough estimate; exact value requires runtime profiling.
   */
  peakInferenceBytes: number;
  /** Sequence length at which kvCacheBytes was computed */
  seqLen: number;
  /** KV quantization policy applied */
  kvPolicy: KVQuantPolicy;
}

/**
 * Whether a given total memory estimate fits within the WASM 4 GB limit.
 * Conservative: assumes 256 MB overhead for WASM runtime and JS heap.
 */
const WASM_MEMORY_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const WASM_RUNTIME_OVERHEAD_BYTES = 256 * 1024 * 1024; // 256 MB

export function fitsIn4GB(totalBytes: number): boolean {
  return totalBytes + WASM_RUNTIME_OVERHEAD_BYTES <= WASM_MEMORY_LIMIT_BYTES;
}

// ---------------------------------------------------------------------------
// Estimation functions
// ---------------------------------------------------------------------------

/**
 * Estimate KV cache memory usage.
 *
 * Formula:
 *   KV(bytes) = n_layers * 2 * n_kv_heads * head_dim * seq_len * bytes_per_element
 *
 * The factor of 2 accounts for both K and V caches.
 * residualTokens are kept in FP16 (2 bytes), rest at policy bitwidth.
 *
 * @param params Model architecture parameters
 * @param seqLen Sequence length (context window)
 * @param policy KV quantization policy
 */
export function estimateKvCacheBytes(
  params: ModelArchParams,
  seqLen: number,
  policy: KVQuantPolicy,
): number {
  const { nLayers, nKvHeads, headDim } = params;
  const totalElements = nLayers * nKvHeads * headDim * seqLen;

  const residualElements = Math.min(policy.residualTokens * nLayers * nKvHeads * headDim, totalElements);
  const quantElements = totalElements - residualElements;

  // K cache
  const kBytes = residualElements * 2 // FP16 residual
    + quantElements * kvKeyBytesPerElement(policy);

  // V cache
  const vBytes = residualElements * 2 // FP16 residual
    + quantElements * kvValueBytesPerElement(policy);

  // Per-channel K scales: n_layers * n_kv_heads * head_dim * 2 bytes (FP16)
  const kScaleBytes = policy.keyMethod !== 'none'
    ? nLayers * nKvHeads * headDim * 2
    : 0;

  // Per-token V scales: n_layers * seq_len * 2 bytes (FP16) — roughly
  const vScaleBytes = policy.valueMethod !== 'none'
    ? nLayers * seqLen * 2
    : 0;

  return kBytes + vBytes + kScaleBytes + vScaleBytes;
}

/**
 * Build a full MemoryMeasurement for a given model + KV policy + seqLen.
 *
 * @param modelBodyBytes Converted model GGUF size in bytes (from conversion metrics)
 * @param params Model architecture parameters
 * @param seqLen Sequence length
 * @param policy KV quantization policy
 */
export function measureMemory(
  modelBodyBytes: number,
  params: ModelArchParams,
  seqLen: number,
  policy: KVQuantPolicy,
): MemoryMeasurement {
  const kvCacheBytes = estimateKvCacheBytes(params, seqLen, policy);
  // Scratch buffers: ggml compute graph allocations, roughly 10% of model body + 32 MB fixed
  const scratchBytes = Math.round(modelBodyBytes * 0.10) + 32 * 1024 * 1024;
  const peakInferenceBytes = modelBodyBytes + kvCacheBytes + scratchBytes;

  return {
    modelBodyBytes,
    kvCacheBytes,
    peakInferenceBytes,
    seqLen,
    kvPolicy: policy,
  };
}

/**
 * Find the maximum sequence length that fits within the 4 GB WASM limit.
 *
 * @param modelBodyBytes Model size in bytes
 * @param params Model architecture parameters
 * @param policy KV quantization policy
 * @param maxSeqLen Upper bound to search (default: 128K)
 */
export function maxSeqLenIn4GB(
  modelBodyBytes: number,
  params: ModelArchParams,
  policy: KVQuantPolicy,
  maxSeqLen = 131072,
): number {
  // Binary search
  let lo = 128;
  let hi = maxSeqLen;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const m = measureMemory(modelBodyBytes, params, mid, policy);
    if (fitsIn4GB(m.peakInferenceBytes)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Model architecture parameters
// ---------------------------------------------------------------------------

/**
 * Architecture parameters needed for KV cache estimation.
 * Values for specific models are provided as constants below.
 */
export interface ModelArchParams {
  name: string;
  arch: string;
  nLayers: number;
  nKvHeads: number;
  headDim: number;
}

/** SmolLM2-1.7B-Instruct (LlamaForCausalLM) */
export const SMOLLM2_1_7B_PARAMS: ModelArchParams = {
  name: 'SmolLM2-1.7B-Instruct',
  arch: 'llama',
  nLayers: 24,
  nKvHeads: 8,   // GQA: 32 Q heads, 8 KV heads
  headDim: 64,
};

/** Qwen 3.5 2B (hybrid SSM+attention) — attention layers only */
export const QWEN35_2B_PARAMS: ModelArchParams = {
  name: 'Qwen3.5-2B',
  arch: 'qwen35',
  nLayers: 28,
  nKvHeads: 8,
  headDim: 128,
};

/** Gemma 4 E2B */
export const GEMMA4_E2B_PARAMS: ModelArchParams = {
  name: 'Gemma-4-E2B',
  arch: 'gemma4',
  nLayers: 26,
  nKvHeads: 4,
  headDim: 256,
};

// ---------------------------------------------------------------------------
// Strategy comparison
// ---------------------------------------------------------------------------

/**
 * One row in the model × KV policy comparison matrix.
 */
export interface MemoryStrategyRow {
  label: string;
  modelQuantPreset: string;
  modelBodyBytes: number;
  kvPolicy: KVQuantPolicy;
  /** Measurements at standard sequence lengths */
  measurements: MemoryMeasurement[];
  /** Maximum seq_len fitting in 4 GB */
  maxSeqLen4GB: number;
}

/**
 * Build a strategy comparison matrix for a given model.
 *
 * @param params Model architecture parameters
 * @param variants Array of { label, preset, modelBodyBytes, kvPolicy } to compare
 * @param seqLens Sequence lengths to measure (default: 512, 2048, 4096, 8192)
 */
export function buildStrategyMatrix(
  params: ModelArchParams,
  variants: Array<{ label: string; preset: string; modelBodyBytes: number; kvPolicy: KVQuantPolicy }>,
  seqLens = [512, 2048, 4096, 8192],
): MemoryStrategyRow[] {
  return variants.map((v) => {
    const measurements = seqLens.map((seqLen) =>
      measureMemory(v.modelBodyBytes, params, seqLen, v.kvPolicy),
    );
    const maxSeqLen4GB = maxSeqLenIn4GB(v.modelBodyBytes, params, v.kvPolicy);

    return {
      label: v.label,
      modelQuantPreset: v.preset,
      modelBodyBytes: v.modelBodyBytes,
      kvPolicy: v.kvPolicy,
      measurements,
      maxSeqLen4GB,
    };
  });
}

/**
 * Format a strategy comparison as a Markdown table.
 *
 * @param rows Output of buildStrategyMatrix
 * @param seqLenForTotal Sequence length used for "Total Memory" column
 */
export function formatStrategyTable(rows: MemoryStrategyRow[], seqLenForTotal = 2048): string {
  const header = '| Strategy | Model Body | KV@' + seqLenForTotal + ' | Total@' + seqLenForTotal + ' | Max SeqLen (4GB) |';
  const sep = '|---|---|---|---|---|';
  const toMB = (b: number) => (b / 1024 / 1024).toFixed(0) + ' MB';

  const dataRows = rows.map((row) => {
    const m = row.measurements.find((x) => x.seqLen === seqLenForTotal) ?? row.measurements[0];
    return `| ${row.label} | ${toMB(row.modelBodyBytes)} | ${toMB(m.kvCacheBytes)} | ${toMB(m.peakInferenceBytes)} | ~${row.maxSeqLen4GB.toLocaleString()} |`;
  });

  return [header, sep, ...dataRows].join('\n');
}

// ---------------------------------------------------------------------------
// Runtime log format specification (Phase 5 C++ implementation target)
// ---------------------------------------------------------------------------

/**
 * Specification for runtime memory log messages emitted by the C++ side.
 * Phase 4: TypeScript-side spec only. C++ implementation is Phase 5.
 *
 * Expected format:
 *   @@INFO[lowbit-q] memory: model=880MB kv=50MB scratch=32MB total=962MB
 *   @@INFO[lowbit-q] kv_cache: policy=kivi_2bit residual=128 seq_len=2048
 *
 * These are parseable from Playwright test console output.
 */
export const RUNTIME_LOG_MEMORY_PREFIX = '@@INFO[lowbit-q] memory:';
export const RUNTIME_LOG_KV_PREFIX = '@@INFO[lowbit-q] kv_cache:';

/** Parse a runtime memory log line (for test validation) */
export function parseRuntimeMemoryLog(line: string): {
  modelMB: number;
  kvMB: number;
  scratchMB: number;
  totalMB: number;
} | null {
  if (!line.startsWith(RUNTIME_LOG_MEMORY_PREFIX)) return null;
  const nums = line.match(/(\w+)=(\d+)MB/g);
  if (!nums || nums.length < 4) return null;
  const parse = (s: string) => parseInt(s.split('=')[1]);
  return {
    modelMB: parse(nums[0]),
    kvMB: parse(nums[1]),
    scratchMB: parse(nums[2]),
    totalMB: parse(nums[3]),
  };
}
