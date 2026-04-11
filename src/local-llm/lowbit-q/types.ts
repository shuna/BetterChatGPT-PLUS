/**
 * Type definitions for the lowbit-Q quantization pipeline.
 *
 * Custom lowbit-Q GGUF format stores OneBit decomposition components
 * (a, b, sign) as separate tensors per Linear layer, enabling
 * per-row/per-column scaling inference instead of block-level quantization.
 */

// ---------------------------------------------------------------------------
// GGUF low-level types
// ---------------------------------------------------------------------------

/** GGUF metadata value types (subset relevant to our use) */
export enum GGUFValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

/** GGUF tensor data types */
export enum GGMLType {
  F32 = 0,
  F16 = 1,
  Q4_0 = 2,
  Q4_1 = 3,
  Q5_0 = 6,
  Q5_1 = 7,
  Q8_0 = 8,
  Q8_1 = 9,
  Q2_K = 10,
  Q3_K = 11,
  Q4_K = 12,
  Q5_K = 13,
  Q6_K = 14,
  Q8_K = 15,
  IQ2_XXS = 16,
  IQ2_XS = 17,
  IQ3_XXS = 18,
  IQ1_S = 19,
  IQ4_NL = 20,
  IQ3_S = 21,
  IQ2_S = 22,
  IQ4_XS = 23,
  I8 = 24,
  I16 = 25,
  I32 = 26,
  I64 = 27,
  F64 = 28,
  IQ1_M = 29,
  BF16 = 30,
  // Note: type 41 (TQ1_0) is used by Bonsai-8B etc. but is NOT part of
  // our lowbit-Q format. Our format uses F16 for a/b and I8 for sign bits.
}

/** Block sizes for quantized types (elements per block) */
export const GGML_BLOCK_SIZES: Partial<Record<GGMLType, number>> = {
  [GGMLType.F32]: 1,
  [GGMLType.F16]: 1,
  [GGMLType.BF16]: 1,
  [GGMLType.Q8_0]: 32,
  [GGMLType.Q4_0]: 32,
  [GGMLType.Q4_1]: 32,
  [GGMLType.Q2_K]: 256,  // K-quant super-block
  [GGMLType.Q3_K]: 256,  // K-quant super-block
  [GGMLType.Q4_K]: 256,
  [GGMLType.Q5_K]: 256,
  [GGMLType.Q6_K]: 256,
  [GGMLType.Q8_K]: 256,
};

/** Bytes per block for quantized types */
export const GGML_TYPE_SIZES: Partial<Record<GGMLType, number>> = {
  [GGMLType.F32]: 4,
  [GGMLType.F16]: 2,
  [GGMLType.BF16]: 2,   // bfloat16: 2 bytes per element, same as F16
  [GGMLType.Q8_0]: 34,   // 2 (scale fp16) + 32 (int8 values)
  [GGMLType.Q4_0]: 18,   // 2 (scale fp16) + 16 (4-bit values)
  [GGMLType.Q4_1]: 20,   // 2 + 2 (scale, min fp16) + 16
  [GGMLType.Q2_K]: 84,   // 2+2 (d,dmin fp16) + 16 (scales) + 64 (qs 2-bit packed)
  [GGMLType.Q3_K]: 110,  // 32 (hmask) + 64 (qs low-2bit) + 12 (6-bit scales) + 2 (d fp16)
  [GGMLType.Q4_K]: 144,  // super-block: 256 elements
  [GGMLType.Q5_K]: 176,
  [GGMLType.Q6_K]: 210,
  [GGMLType.Q8_K]: 292,
};

// ---------------------------------------------------------------------------
// GGUF parsed structures
// ---------------------------------------------------------------------------

export interface GGUFMetadataEntry {
  key: string;
  type: GGUFValueType;
  value: string | number | boolean | bigint | GGUFMetadataEntry[];
}

export interface GGUFTensorInfo {
  name: string;
  nDims: number;
  dims: bigint[];
  type: GGMLType;
  offset: bigint;
}

export interface GGUFHeader {
  version: number;
  tensorCount: bigint;
  metadataCount: bigint;
  metadata: Map<string, GGUFMetadataEntry>;
  tensors: GGUFTensorInfo[];
  /** Byte offset where tensor data begins */
  dataOffset: number;
}

// ---------------------------------------------------------------------------
// Lowbit-Q format constants
// ---------------------------------------------------------------------------

/** GGUF metadata key for lowbit-Q format version */
export const LOWBIT_Q_VERSION_KEY = 'lowbit-q.version';
/** GGUF metadata key for list of lowbit-Q layer indices */
export const LOWBIT_Q_LAYERS_KEY = 'lowbit-q.layers';
/** GGUF metadata key for sign bit packing order */
export const LOWBIT_Q_PACKING_KEY = 'lowbit-q.sign_packing';

/** Tensor name suffixes for lowbit-Q decomposition components */
export const LOWBIT_Q_SUFFIX_A = '.lowbit_q_a';
export const LOWBIT_Q_SUFFIX_B = '.lowbit_q_b';
export const LOWBIT_Q_SUFFIX_SIGN = '.lowbit_q_sign';

/** Current lowbit-Q format version (v1: SVID 1-bit only) */
export const LOWBIT_Q_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Lowbit-Q v2 format constants
// ---------------------------------------------------------------------------

/** Format version 2: mixed-bit allocation + KV cache metadata */
export const LOWBIT_Q_V2_FORMAT_VERSION = 2;

/** v2: source model name (string) */
export const LOWBIT_Q_SOURCE_MODEL_KEY = 'lowbit-q.source_model';
/** v2: target size ratio used by allocator (float32, 0.0–1.0) */
export const LOWBIT_Q_SIZE_BUDGET_KEY = 'lowbit-q.size_budget';
/** v2: JSON-encoded TensorAllocRecord[] array (string) */
export const LOWBIT_Q_TENSOR_ALLOC_KEY = 'lowbit-q.tensor_alloc';
/** v2: KV cache K quantization method (string) */
export const LOWBIT_Q_KV_CACHE_K_METHOD_KEY = 'lowbit-q.kv_cache.k_method';
/** v2: KV cache K bit width (uint32) */
export const LOWBIT_Q_KV_CACHE_K_BITS_KEY = 'lowbit-q.kv_cache.k_bitwidth';
/** v2: KV cache V quantization method (string) */
export const LOWBIT_Q_KV_CACHE_V_METHOD_KEY = 'lowbit-q.kv_cache.v_method';
/** v2: KV cache V bit width (uint32) */
export const LOWBIT_Q_KV_CACHE_V_BITS_KEY = 'lowbit-q.kv_cache.v_bitwidth';
/** v2: weighted mean NMSE across converted tensors (float32) */
export const LOWBIT_Q_QUALITY_NMSE_MEAN_KEY = 'lowbit-q.quality.nmse_mean';
/** v2: maximum NMSE across converted tensors (float32) */
export const LOWBIT_Q_QUALITY_NMSE_MAX_KEY = 'lowbit-q.quality.nmse_max';

// ---------------------------------------------------------------------------
// Legacy (onebit) format constants — for reading pre-rename GGUF files
// ---------------------------------------------------------------------------

/** @deprecated Legacy metadata key — accept on read, never write */
export const LEGACY_ONEBIT_VERSION_KEY = 'onebit.version';
/** @deprecated Legacy metadata key */
export const LEGACY_ONEBIT_LAYERS_KEY = 'onebit.layers';
/** @deprecated Legacy metadata key */
export const LEGACY_ONEBIT_PACKING_KEY = 'onebit.sign_packing';
/** @deprecated Legacy tensor suffix */
export const LEGACY_ONEBIT_SUFFIX_A = '.onebit_a';
/** @deprecated Legacy tensor suffix */
export const LEGACY_ONEBIT_SUFFIX_B = '.onebit_b';
/** @deprecated Legacy tensor suffix */
export const LEGACY_ONEBIT_SUFFIX_SIGN = '.onebit_sign';

/** Sign bit packing order: MSB first (matching OneCompression's my_pack) */
export const LOWBIT_Q_SIGN_PACKING = 'msb_first';

// ---------------------------------------------------------------------------
// Lowbit-Q v2 quantization types and interfaces
// ---------------------------------------------------------------------------

/**
 * Quantization type assigned to a single weight tensor.
 * Used by the v2 bitwidth allocator.
 */
export enum LowbitQQuantType {
  /** Keep tensor unchanged (embeddings, norms, critical layers) */
  PASSTHROUGH = 'passthrough',
  /** RTN 4-bit block quantization (ggml Q4_0 native format) */
  Q4_0 = 'q4_0',
  /** RTN 8-bit block quantization (ggml Q8_0 native format) */
  Q8_0 = 'q8_0',
  /** OneBit (arXiv:2402.11295) SVID 1-bit decomposition into (a, sign, b) triplet */
  SVID_1BIT = 'svid_1bit',
  /** K-quant 3-bit block quantization (ggml Q3_K native format, 256 elements/block, ~110 bytes) */
  Q3_K = 'q3_k',
  /** K-quant 2-bit block quantization (ggml Q2_K native format, 256 elements/block, ~84 bytes) */
  Q2_K = 'q2_k',
}

/** KV cache quantization method for runtime use */
export enum KVCacheQuantMethod {
  /** No KV cache quantization */
  NONE = 'none',
  /** Per-channel quantization (KIVI K-cache style) */
  PER_CHANNEL = 'per_channel',
  /** Per-token quantization (KIVI V-cache style) */
  PER_TOKEN = 'per_token',
}

/** Per-tensor allocation record (stored in v2 GGUF as JSON) */
export interface TensorAllocRecord {
  /** Full tensor name, e.g. "blk.0.attn_q.weight" */
  name: string;
  /** Quantization type assigned by the allocator */
  quantType: LowbitQQuantType;
  /** Tensor family classification (attn-q, ffn-gate, other, …) */
  family: string;
  /** Layer index extracted from name, or null */
  layerIndex: number | null;
  /** Whether random Hadamard rotation was applied before quantization */
  rotationApplied: boolean;
  /** NMSE computed at conversion time (populated when computeQuality is true) */
  nmse?: number;
  /** Original tensor data size in bytes */
  originalBytes: number;
  /** Quantized tensor data size in bytes */
  quantizedBytes: number;
}

/** KV cache quantization parameters stored in v2 GGUF metadata */
export interface KVCacheQuantParams {
  kMethod: KVCacheQuantMethod;
  kBitwidth: number;
  vMethod: KVCacheQuantMethod;
  vBitwidth: number;
}

/**
 * KV cache quantization policy used for memory estimation and future runtime use.
 *
 * KIVI (ICML 2024) style: Keys per-channel, Values per-token.
 * TurboQuant (ICLR 2026) style: requires online rotation — deferred.
 *
 * Phase 4 scope: TypeScript estimation only. C++ runtime implementation is Phase 5.
 */
export interface KVQuantPolicy {
  /** Key quantization method */
  keyMethod: 'none' | 'per_channel_2bit' | 'per_channel_4bit';
  /** Value quantization method */
  valueMethod: 'none' | 'per_token_2bit' | 'per_token_4bit';
  /**
   * Number of "residual" tokens at sequence start kept at full precision.
   * KIVI paper recommends keeping the first 32–128 tokens in FP16.
   */
  residualTokens: number;
  /**
   * Apply online rotation before quantization (TurboQuant/QuaRot style).
   * Deferred to Phase 5 — requires custom WASM kernel.
   */
  applyRotation: boolean;
}

/** Bytes per KV element for a given policy (key side) */
export function kvKeyBytesPerElement(policy: KVQuantPolicy): number {
  switch (policy.keyMethod) {
    case 'per_channel_2bit': return 2 / 8; // + negligible per-channel scale overhead
    case 'per_channel_4bit': return 4 / 8;
    case 'none':
    default: return 2; // FP16
  }
}

/** Bytes per KV element for a given policy (value side) */
export function kvValueBytesPerElement(policy: KVQuantPolicy): number {
  switch (policy.valueMethod) {
    case 'per_token_2bit': return 2 / 8;
    case 'per_token_4bit': return 4 / 8;
    case 'none':
    default: return 2; // FP16
  }
}

/** Aggregated quality metrics stored in v2 GGUF metadata */
export interface LowbitQQualityMetrics {
  nmseMean: number;
  nmseMax: number;
  convertedTensorCount: number;
  passthroughTensorCount: number;
}

/** Complete v2 metadata structure (serialized into GGUF KV pairs) */
export interface LowbitQV2Metadata {
  formatVersion: 2;
  sourceModelName?: string;
  /** Target size ratio used by the allocator (0.0–1.0) */
  sizeBudget?: number;
  kvCache?: KVCacheQuantParams;
  tensorAllocs: TensorAllocRecord[];
  quality?: LowbitQQualityMetrics;
}

/**
 * Configuration for the v2 bitwidth allocator.
 *
 * The allocator maps tensor family + layer position → quantization type,
 * following the strategy: first/last layers → Q4_0, attn Q/K → Q4_0,
 * attn V/O and FFN → SVID_1BIT.
 */
export interface BitwidthAllocatorConfig {
  /**
   * Target model size as a fraction of the original (0.0–1.0).
   * Used as a soft budget; exact achievement depends on tensor distribution.
   */
  sizeBudget: number;
  /** Quantization type for the first transformer block (layer index 0) */
  firstLayerQuant: LowbitQQuantType;
  /** Quantization type for the last transformer block */
  lastLayerQuant: LowbitQQuantType;
  /** Quantization type for attention Q and K projections */
  attnQKQuant: LowbitQQuantType;
  /** Quantization type for attention V and output projections */
  attnVOQuant: LowbitQQuantType;
  /** Quantization type for FFN (gate, up, down) projections */
  ffnQuant: LowbitQQuantType;
  /**
   * Apply random Hadamard rotation preprocessing (QuaRot-style).
   * When true, rotation is absorbed into weights at conversion time
   * (zero inference overhead). Currently not implemented; must be false.
   */
  applyRotation: boolean;
}

// ---------------------------------------------------------------------------
// Lowbit-Q decomposition types
// ---------------------------------------------------------------------------

/** Result of decomposing a single weight tensor */
export interface LowbitQDecomposition {
  /** Per-row scaling vector (out_features,) */
  a: Float32Array;
  /** Per-column scaling vector (in_features,) */
  b: Float32Array;
  /** Packed sign bits, MSB first (ceil(out*in/8) bytes) */
  sign: Uint8Array;
  outFeatures: number;
  inFeatures: number;
}

// ---------------------------------------------------------------------------
// Conversion progress
// ---------------------------------------------------------------------------

export interface ConversionProgress {
  stage: 'reading' | 'parsing' | 'converting' | 'writing' | 'done' | 'error';
  /** Current tensor index (0-based) */
  currentTensor: number;
  /** Total tensor count */
  totalTensors: number;
  /** Current tensor name */
  currentTensorName: string;
  /** Percentage complete (0-100) */
  percent: number;
  /** Error message if stage === 'error' */
  error?: string;
}

// ---------------------------------------------------------------------------
// Conversion worker messages
// ---------------------------------------------------------------------------

export interface ConversionStartRequest {
  id: number;
  type: 'start';
  /** Source GGUF file (Q8_0 or similar). Ignored when sourceUrl is set. */
  sourceFile: File;
  /**
   * When set, the Worker fetches the source from this URL instead of using
   * sourceFile. This bypasses OPFS storage entirely, avoiding the Chromium
   * ~2 GB per-file OPFS limit and the 3 GB structured-clone limit for
   * postMessage. The Worker streams the response into an in-memory File.
   */
  sourceUrl?: string;
  /**
   * v2: Bitwidth allocator configuration.
   * When provided, the v2 pipeline is used (mixed-bit allocation).
   */
  allocatorConfig?: BitwidthAllocatorConfig;
  /**
   * v2: Total number of transformer blocks in the model.
   * Required for first/last layer detection in the allocator.
   * If not provided, the pipeline reads it from GGUF metadata (llama.block_count).
   */
  totalLayers?: number;
  /** Optional source model name stored in v2 GGUF metadata */
  sourceModelName?: string;
  /**
   * Optional OPFS direct-write target. When set, the worker persists the
   * converted GGUF directly to OPFS instead of returning a Blob.
   */
  opfsTarget?: {
    modelId: string;
    fileName: string;
  };
  /** Whether to compute per-tensor quality metrics (NMSE). Default: false */
  computeQuality?: boolean;
  /**
   * When provided, the source file is deleted from OPFS before writing the
   * output to free quota for large models (>2 GB source + output).
   * The File/Blob reference remains valid because OPFS getFile() returns a snapshot.
   */
  sourceOpfsInfo?: { modelId: string; fileName: string };
  /**
   * @deprecated Use allocatorConfig instead.
   * v1: Lowbit-Q conversion mode (which tensors to convert). Default: 'all'
   */
  convertMode?: string;
}

export interface ConversionProgressMessage {
  id: number;
  type: 'progress';
  progress: ConversionProgress;
}

export interface ConversionDoneMessage {
  id: number;
  type: 'done';
  /** Resulting lowbit-Q GGUF as Blob (omitted when already persisted to OPFS) */
  result?: Blob;
  /** Original size in bytes */
  originalSize: number;
  /** Converted size in bytes */
  convertedSize: number;
  /** True when the worker already wrote the output to OPFS */
  persistedToOpfs?: boolean;
  /** Per-tensor conversion records (populated when computeQuality is true) */
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

export interface ConversionErrorMessage {
  id: number;
  type: 'error';
  message: string;
}

export type ConversionWorkerRequest = ConversionStartRequest;
export type ConversionWorkerResponse =
  | ConversionProgressMessage
  | ConversionDoneMessage
  | ConversionErrorMessage;
