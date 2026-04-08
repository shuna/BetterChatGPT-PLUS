/**
 * Onebit quantization module — browser-native 1-bit model conversion.
 *
 * Public API for the onebit conversion pipeline:
 * - parseGGUFHeader: Parse a GGUF file's header and tensor descriptors
 * - convertToOnebit: Convert a standard GGUF to onebit GGUF format
 * - decompose/reconstruct: Low-level onebit decomposition
 */

export { parseGGUFHeader, isWeightTensor, readTensorData, computeTensorDataSize } from './ggufParser';
export { dequantize, dequantQ8_0, dequantF16, dequantF32, dequantQ4_0, fp16ToFp32, fp32ToFp16 } from './dequantize';
export { decompose, reconstruct, computeNMSE } from './onebitDecompose';
export { writeOnebitGGUF } from './ggufWriter';
export { convertToOnebit, convertToOnebitStreaming } from './convert';
export {
  OnebitConversionManager,
  generateOnebitModelId,
  isOnebitModelId,
  generateOnebitFilename,
  isOnebitGGUF,
  hasOnebitVersion,
} from './onebitManager';
export type { OnebitConversionResult, OnebitConversionCallbacks } from './onebitManager';
export type {
  GGUFHeader,
  GGUFTensorInfo,
  GGUFMetadataEntry,
  OnebitDecomposition,
  ConversionProgress,
  ConversionStartRequest,
  ConversionProgressMessage,
  ConversionDoneMessage,
  ConversionErrorMessage,
} from './types';
export {
  GGMLType,
  GGUFValueType,
  ONEBIT_VERSION_KEY,
  ONEBIT_LAYERS_KEY,
  ONEBIT_PACKING_KEY,
  ONEBIT_FORMAT_VERSION,
  ONEBIT_SIGN_PACKING,
  ONEBIT_SUFFIX_A,
  ONEBIT_SUFFIX_B,
  ONEBIT_SUFFIX_SIGN,
} from './types';
