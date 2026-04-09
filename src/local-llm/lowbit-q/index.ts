/**
 * Lowbit-Q quantization module — browser-native 1-bit model conversion.
 *
 * Public API for the lowbit-Q conversion pipeline:
 * - parseGGUFHeader: Parse a GGUF file's header and tensor descriptors
 * - convertToLowbitQ: Convert a standard GGUF to lowbit-Q GGUF format
 * - decompose/reconstruct: Low-level lowbit-Q decomposition
 */

export { parseGGUFHeader, isWeightTensor, readTensorData, computeTensorDataSize } from './ggufParser';
export { dequantize, dequantQ8_0, dequantF16, dequantF32, dequantQ4_0, fp16ToFp32, fp32ToFp16 } from './dequantize';
export { decompose, reconstruct, computeNMSE } from './lowbitQDecompose';
export { writeLowbitQGGUF } from './ggufWriter';
export { convertToLowbitQ, convertToLowbitQStreaming } from './convert';
export {
  LowbitQConversionManager,
  generateLowbitQModelId,
  isLowbitQModelId,
  generateLowbitQFilename,
  isLowbitQGGUF,
  hasLowbitQVersion,
} from './lowbitQManager';
export type { LowbitQConversionResult, LowbitQConversionCallbacks } from './lowbitQManager';
export type {
  GGUFHeader,
  GGUFTensorInfo,
  GGUFMetadataEntry,
  LowbitQDecomposition,
  ConversionProgress,
  ConversionStartRequest,
  ConversionProgressMessage,
  ConversionDoneMessage,
  ConversionErrorMessage,
} from './types';
export {
  GGMLType,
  GGUFValueType,
  LOWBIT_Q_VERSION_KEY,
  LOWBIT_Q_LAYERS_KEY,
  LOWBIT_Q_PACKING_KEY,
  LOWBIT_Q_FORMAT_VERSION,
  LOWBIT_Q_SIGN_PACKING,
  LOWBIT_Q_SUFFIX_A,
  LOWBIT_Q_SUFFIX_B,
  LOWBIT_Q_SUFFIX_SIGN,
  LEGACY_ONEBIT_VERSION_KEY,
  LEGACY_ONEBIT_LAYERS_KEY,
  LEGACY_ONEBIT_PACKING_KEY,
  LEGACY_ONEBIT_SUFFIX_A,
  LEGACY_ONEBIT_SUFFIX_B,
  LEGACY_ONEBIT_SUFFIX_SIGN,
} from './types';
