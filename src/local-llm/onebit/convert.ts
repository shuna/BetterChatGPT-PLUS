/**
 * Onebit conversion orchestrator.
 *
 * Coordinates the full pipeline: parse source GGUF → dequantize weights →
 * decompose to onebit → write onebit GGUF.
 *
 * Memory model:
 *   The source file is NOT loaded entirely into memory. Instead:
 *   1. The GGUF header is parsed from the first portion of the file
 *   2. Each tensor is read individually from the source via slice()
 *   3. After processing, the fp32 intermediate is released before the next tensor
 *
 *   Peak memory per tensor ≈ tensorSize(source) + tensorSize(fp32) + tensorSize(onebit)
 *   For Qwen3-0.6B largest tensor (~4M params): ~16MB Q8 + ~16MB fp32 + ~2MB onebit ≈ 34MB
 */

import { parseGGUFHeader, readTensorData, isWeightTensor, computeTensorDataSize } from './ggufParser';
import { dequantize } from './dequantize';
import { decompose, reconstruct, computeNMSE } from './onebitDecompose';
import { writeOnebitGGUF, type OnebitTensorGroup } from './ggufWriter';
import type { GGUFTensorInfo, GGUFHeader, ConversionProgress } from './types';
import { extractLayerIndex, classifyTensorFamily, type TensorConvertRecord } from './tensorFilter';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ConvertOptions {
  /** Progress callback, called per-tensor */
  onProgress?: (progress: ConversionProgress) => void;
  /** Whether to compute NMSE for quality verification (slower) */
  computeQuality?: boolean;
  /**
   * Custom tensor filter predicate. If provided, only tensors for which
   * this returns true will be onebit-converted. Non-matching weight tensors
   * are passed through unchanged. If not provided, defaults to `isWeightTensor`.
   */
  tensorFilter?: (name: string) => boolean;
}

export interface ConvertResult {
  /** The onebit GGUF file as Uint8Array */
  data: Uint8Array;
  /** Original file size in bytes */
  originalSize: number;
  /** Converted file size in bytes */
  convertedSize: number;
  /** Number of tensors converted to onebit */
  convertedTensorCount: number;
  /** Number of tensors passed through unchanged */
  passthroughTensorCount: number;
  /** Per-tensor NMSE values (for quality assessment) */
  tensorNMSE: Map<string, number>;
  /** Per-tensor conversion records (populated when computeQuality is true) */
  tensorRecords: TensorConvertRecord[];
}

// ---------------------------------------------------------------------------
// Header size estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the minimum bytes needed to parse the GGUF header.
 * This is a heuristic: most model headers are < 64KB.
 * If the header is larger, we retry with the full file.
 */
const HEADER_INITIAL_READ = 256 * 1024; // 256KB covers most models

/**
 * Parse the GGUF header from a File/Blob, reading only the minimum needed.
 * Falls back to reading the full file if the initial read is insufficient.
 */
async function parseHeaderFromBlob(
  source: File | Blob,
): Promise<{ header: GGUFHeader; fullBuffer: ArrayBuffer }> {
  // Try parsing with the initial read size
  const initialSize = Math.min(source.size, HEADER_INITIAL_READ);
  const initialBuffer = await source.slice(0, initialSize).arrayBuffer();

  try {
    const header = parseGGUFHeader(initialBuffer);
    // Verify all tensor data starts within the file
    if (header.dataOffset <= source.size) {
      return { header, fullBuffer: initialBuffer };
    }
  } catch {
    // Header doesn't fit in initial read — fall through
  }

  // Fall back to full file read (large header / many tensors)
  const fullBuffer = await source.arrayBuffer();
  const header = parseGGUFHeader(fullBuffer);
  return { header, fullBuffer };
}

/**
 * Read a single tensor's raw data from a File/Blob, without loading the
 * entire file into memory.
 */
async function readTensorFromBlob(
  source: File | Blob,
  header: GGUFHeader,
  tensor: GGUFTensorInfo,
): Promise<Uint8Array> {
  const size = computeTensorDataSize(tensor);
  const absoluteOffset = header.dataOffset + Number(tensor.offset);
  const slice = source.slice(absoluteOffset, absoluteOffset + size);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Conversion: File/Blob input (streaming, low memory)
// ---------------------------------------------------------------------------

/**
 * Convert a source GGUF File/Blob to onebit GGUF format.
 *
 * Streaming memory model:
 *   - Only the header is parsed upfront (typically < 256KB)
 *   - Each tensor is read individually via File.slice()
 *   - fp32 intermediates are released after each tensor is processed
 *   - The final onebit GGUF is assembled at the end
 */
export async function convertToOnebitStreaming(
  source: File | Blob,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const { onProgress, computeQuality = false, tensorFilter } = options;
  const shouldConvert = tensorFilter ?? isWeightTensor;

  // --- Phase 1: Parse header ---
  onProgress?.({
    stage: 'parsing',
    currentTensor: 0,
    totalTensors: 0,
    currentTensorName: '',
    percent: 0,
  });

  const { header } = await parseHeaderFromBlob(source);
  const totalTensors = header.tensors.length;

  // --- Phase 2: Process tensors one-by-one ---
  const onebitTensors = new Map<string, OnebitTensorGroup>();
  const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
  const onebitLayerIndices = new Set<number>();
  const tensorNMSE = new Map<string, number>();
  const tensorRecords: TensorConvertRecord[] = [];

  for (let t = 0; t < totalTensors; t++) {
    const tensor = header.tensors[t];

    onProgress?.({
      stage: 'converting',
      currentTensor: t,
      totalTensors,
      currentTensorName: tensor.name,
      percent: Math.round((t / totalTensors) * 90),
    });

    // Read this tensor's data from the file (not the full file)
    const rawData = await readTensorFromBlob(source, header, tensor);
    const tensorDataSize = rawData.byteLength;

    if (shouldConvert(tensor.name)) {
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);
      // rawData can now be GC'd — we only hold fp32Weights

      const inFeatures = Number(tensor.dims[0]);
      const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;

      const decomposition = decompose(fp32Weights, outFeatures, inFeatures);

      const layerIdx = extractLayerIndex(tensor.name);
      if (layerIdx !== null) {
        onebitLayerIndices.add(layerIdx);
      }

      const baseName = tensor.name.replace(/\.weight$/, '');
      onebitTensors.set(tensor.name, { baseName, decomposition });

      let nmse: number | null = null;
      if (computeQuality && totalElements <= 4_000_000) {
        const reconstructed = reconstruct(decomposition);
        nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
      }

      // Compute onebit triplet size: a(fp16) + b(fp16) + sign(packed)
      const onebitSizeBytes =
        decomposition.outFeatures * 2 +
        decomposition.inFeatures * 2 +
        decomposition.sign.byteLength;

      tensorRecords.push({
        name: tensor.name,
        layerIndex: layerIdx,
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        onebitSizeBytes,
        dims: tensor.dims.map(Number),
      });

      // fp32Weights can now be GC'd
    } else {
      passthroughTensors.set(tensor.name, { info: tensor, data: rawData });

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: false,
        nmse: null,
        originalSizeBytes: tensorDataSize,
        onebitSizeBytes: null,
        dims: tensor.dims.map(Number),
      });
    }
  }

  // --- Phase 3: Write onebit GGUF ---
  onProgress?.({
    stage: 'writing',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 92,
  });

  const sortedLayers = Array.from(onebitLayerIndices).sort((a, b) => a - b);
  const result = writeOnebitGGUF({
    sourceHeader: header,
    sourceBuffer: new ArrayBuffer(0), // Not used — data already in passthroughTensors
    onebitTensors,
    passthroughTensors,
    onebitLayerIndices: sortedLayers,
  });

  onProgress?.({
    stage: 'done',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 100,
  });

  return {
    data: result,
    originalSize: source.size,
    convertedSize: result.byteLength,
    convertedTensorCount: onebitTensors.size,
    passthroughTensorCount: passthroughTensors.size,
    tensorNMSE,
    tensorRecords,
  };
}

// ---------------------------------------------------------------------------
// Conversion: ArrayBuffer input (for tests and small files)
// ---------------------------------------------------------------------------

/**
 * Convert a source GGUF ArrayBuffer to onebit GGUF format.
 *
 * This is the synchronous version for tests and small files where the
 * entire source is already in memory. For production use with large
 * model files, prefer convertToOnebitStreaming().
 */
export function convertToOnebit(
  sourceBuffer: ArrayBuffer,
  options: ConvertOptions = {},
): ConvertResult {
  const { onProgress, computeQuality = false, tensorFilter } = options;
  const shouldConvert = tensorFilter ?? isWeightTensor;

  onProgress?.({
    stage: 'parsing',
    currentTensor: 0,
    totalTensors: 0,
    currentTensorName: '',
    percent: 0,
  });

  const header = parseGGUFHeader(sourceBuffer);
  const totalTensors = header.tensors.length;

  const onebitTensors = new Map<string, OnebitTensorGroup>();
  const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
  const onebitLayerIndices = new Set<number>();
  const tensorNMSE = new Map<string, number>();
  const tensorRecords: TensorConvertRecord[] = [];

  for (let t = 0; t < totalTensors; t++) {
    const tensor = header.tensors[t];

    onProgress?.({
      stage: 'converting',
      currentTensor: t,
      totalTensors,
      currentTensorName: tensor.name,
      percent: Math.round((t / totalTensors) * 90),
    });

    if (shouldConvert(tensor.name)) {
      const rawData = readTensorData(sourceBuffer, header, tensor);
      const tensorDataSize = rawData.byteLength;
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);

      const inFeatures = Number(tensor.dims[0]);
      const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;

      const decomposition = decompose(fp32Weights, outFeatures, inFeatures);

      const layerIdx = extractLayerIndex(tensor.name);
      if (layerIdx !== null) {
        onebitLayerIndices.add(layerIdx);
      }

      const baseName = tensor.name.replace(/\.weight$/, '');
      onebitTensors.set(tensor.name, { baseName, decomposition });

      let nmse: number | null = null;
      if (computeQuality && totalElements <= 4_000_000) {
        const reconstructed = reconstruct(decomposition);
        nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
      }

      const onebitSizeBytes =
        decomposition.outFeatures * 2 +
        decomposition.inFeatures * 2 +
        decomposition.sign.byteLength;

      tensorRecords.push({
        name: tensor.name,
        layerIndex: layerIdx,
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        onebitSizeBytes,
        dims: tensor.dims.map(Number),
      });
    } else {
      const rawData = readTensorData(sourceBuffer, header, tensor);
      passthroughTensors.set(tensor.name, { info: tensor, data: rawData });

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: false,
        nmse: null,
        originalSizeBytes: rawData.byteLength,
        onebitSizeBytes: null,
        dims: tensor.dims.map(Number),
      });
    }
  }

  onProgress?.({
    stage: 'writing',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 92,
  });

  const sortedLayers = Array.from(onebitLayerIndices).sort((a, b) => a - b);
  const result = writeOnebitGGUF({
    sourceHeader: header,
    sourceBuffer,
    onebitTensors,
    passthroughTensors,
    onebitLayerIndices: sortedLayers,
  });

  onProgress?.({
    stage: 'done',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 100,
  });

  return {
    data: result,
    originalSize: sourceBuffer.byteLength,
    convertedSize: result.byteLength,
    convertedTensorCount: onebitTensors.size,
    passthroughTensorCount: passthroughTensors.size,
    tensorNMSE,
    tensorRecords,
  };
}
