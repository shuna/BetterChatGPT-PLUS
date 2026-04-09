/**
 * Type definitions for the onebit quantization pipeline.
 *
 * Custom Onebit GGUF format stores OneBit decomposition components
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
  // our onebit format. Our format uses F16 for a/b and I8 for sign bits.
}

/** Block sizes for quantized types (elements per block) */
export const GGML_BLOCK_SIZES: Partial<Record<GGMLType, number>> = {
  [GGMLType.F32]: 1,
  [GGMLType.F16]: 1,
  [GGMLType.Q8_0]: 32,
  [GGMLType.Q4_0]: 32,
  [GGMLType.Q4_1]: 32,
  [GGMLType.Q4_K]: 256,
  [GGMLType.Q5_K]: 256,
  [GGMLType.Q6_K]: 256,
  [GGMLType.Q8_K]: 256,
};

/** Bytes per block for quantized types */
export const GGML_TYPE_SIZES: Partial<Record<GGMLType, number>> = {
  [GGMLType.F32]: 4,
  [GGMLType.F16]: 2,
  [GGMLType.Q8_0]: 34,   // 2 (scale fp16) + 32 (int8 values)
  [GGMLType.Q4_0]: 18,   // 2 (scale fp16) + 16 (4-bit values)
  [GGMLType.Q4_1]: 20,   // 2 + 2 (scale, min fp16) + 16
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
// Onebit format constants
// ---------------------------------------------------------------------------

/** GGUF metadata key for onebit format version */
export const ONEBIT_VERSION_KEY = 'onebit.version';
/** GGUF metadata key for list of onebit layer indices */
export const ONEBIT_LAYERS_KEY = 'onebit.layers';
/** GGUF metadata key for sign bit packing order */
export const ONEBIT_PACKING_KEY = 'onebit.sign_packing';

/** Tensor name suffixes for onebit decomposition components */
export const ONEBIT_SUFFIX_A = '.onebit_a';
export const ONEBIT_SUFFIX_B = '.onebit_b';
export const ONEBIT_SUFFIX_SIGN = '.onebit_sign';

/** Current onebit format version */
export const ONEBIT_FORMAT_VERSION = 1;

/** Sign bit packing order: MSB first (matching OneCompression's my_pack) */
export const ONEBIT_SIGN_PACKING = 'msb_first';

// ---------------------------------------------------------------------------
// Onebit decomposition types
// ---------------------------------------------------------------------------

/** Result of decomposing a single weight tensor */
export interface OnebitDecomposition {
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
  stage: 'parsing' | 'converting' | 'writing' | 'done' | 'error';
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
  /** Source GGUF file (Q8_0 or similar) */
  sourceFile: File;
  /** Onebit conversion mode (which tensors to convert). Default: 'all' */
  convertMode?: string;
  /** Whether to compute per-tensor quality metrics (NMSE). Default: false */
  computeQuality?: boolean;
}

export interface ConversionProgressMessage {
  id: number;
  type: 'progress';
  progress: ConversionProgress;
}

export interface ConversionDoneMessage {
  id: number;
  type: 'done';
  /** Resulting onebit GGUF as Blob */
  result: Blob;
  /** Original size in bytes */
  originalSize: number;
  /** Converted size in bytes */
  convertedSize: number;
  /** Per-tensor conversion records (populated when computeQuality is true) */
  tensorRecords?: Array<{
    name: string;
    layerIndex: number | null;
    family: string;
    converted: boolean;
    nmse: number | null;
    originalSizeBytes: number;
    onebitSizeBytes: number | null;
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
