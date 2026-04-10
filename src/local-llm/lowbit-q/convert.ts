/**
 * Lowbit-Q conversion orchestrator.
 *
 * Coordinates the full pipeline: parse source GGUF → dequantize weights →
 * decompose to lowbit-Q → write lowbit-Q GGUF.
 *
 * Memory model:
 *   The source file is NOT loaded entirely into memory. Instead:
 *   1. The GGUF header is parsed from the first portion of the file
 *   2. Each tensor is read individually from the source via slice()
 *   3. After processing, the fp32 intermediate is released before the next tensor
 *
 *   Peak memory per tensor ≈ tensorSize(source) + tensorSize(fp32) + tensorSize(lowbit-Q)
 *   For Qwen3-0.6B largest tensor (~4M params): ~16MB Q8 + ~16MB fp32 + ~2MB lowbit-Q ≈ 34MB
 */

import { parseGGUFHeader, readTensorData, isWeightTensor, computeTensorDataSize } from './ggufParser';
import { dequantize, dequantQ4_0, dequantQ3_K, dequantQ2_K } from './dequantize';
import { decompose, reconstruct, computeNMSE } from './lowbitQDecompose';
import {
  writeLowbitQGGUF,
  writeLowbitQV2GGUF,
  type LowbitQTensorGroup,
  type NativeQuantTensor,
} from './ggufWriter';
import type {
  GGUFTensorInfo,
  GGUFHeader,
  ConversionProgress,
  LowbitQV2Metadata,
  TensorAllocRecord,
  LowbitQQualityMetrics,
  BitwidthAllocatorConfig,
} from './types';
import { LowbitQQuantType, KVCacheQuantMethod } from './types';
import { extractLayerIndex, classifyTensorFamily, type TensorConvertRecord } from './tensorFilter';
import { allocateBitwidths, DEFAULT_ALLOCATOR_CONFIG } from './allocator';
import { quantizeQ4_0 } from './q4_0Quantize';
import { quantizeQ3_K } from './q3_kQuantize';
import { quantizeQ2_K } from './q2_kQuantize';

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
   * this returns true will be lowbit-Q-converted. Non-matching weight tensors
   * are passed through unchanged. If not provided, defaults to `isWeightTensor`.
   */
  tensorFilter?: (name: string) => boolean;
}

export interface ConvertResult {
  /** The lowbit-Q GGUF file as Uint8Array */
  data: Uint8Array;
  /** Original file size in bytes */
  originalSize: number;
  /** Converted file size in bytes */
  convertedSize: number;
  /** Number of tensors converted to lowbit-Q */
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
 * Convert a source GGUF File/Blob to lowbit-Q GGUF format.
 *
 * Streaming memory model:
 *   - Only the header is parsed upfront (typically < 256KB)
 *   - Each tensor is read individually via File.slice()
 *   - fp32 intermediates are released after each tensor is processed
 *   - The final lowbit-Q GGUF is assembled at the end
 */
export async function convertToLowbitQStreaming(
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
  const lowbitQTensors = new Map<string, LowbitQTensorGroup>();
  const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
  const lowbitQLayers = new Set<number>();
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
        lowbitQLayers.add(layerIdx);
      }

      const baseName = tensor.name.replace(/\.weight$/, '');
      lowbitQTensors.set(tensor.name, { baseName, decomposition });

      let nmse: number | null = null;
      if (computeQuality) {
        const reconstructed = reconstruct(decomposition);
        nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
      }

      // Compute lowbit-Q triplet size: a(fp16) + b(fp16) + sign(packed)
      const lowbitQSizeBytes =
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
        lowbitQSizeBytes,
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
        lowbitQSizeBytes: null,
        dims: tensor.dims.map(Number),
      });
    }
  }

  // --- Phase 3: Write lowbit-Q GGUF ---
  onProgress?.({
    stage: 'writing',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 92,
  });

  const sortedLayers = Array.from(lowbitQLayers).sort((a, b) => a - b);
  const result = writeLowbitQGGUF({
    sourceHeader: header,
    sourceBuffer: new ArrayBuffer(0), // Not used — data already in passthroughTensors
    lowbitQTensors,
    passthroughTensors,
    lowbitQLayers: sortedLayers,
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
    convertedTensorCount: lowbitQTensors.size,
    passthroughTensorCount: passthroughTensors.size,
    tensorNMSE,
    tensorRecords,
  };
}

// ---------------------------------------------------------------------------
// Conversion: ArrayBuffer input (for tests and small files)
// ---------------------------------------------------------------------------

/**
 * Convert a source GGUF ArrayBuffer to lowbit-Q GGUF format.
 *
 * This is the synchronous version for tests and small files where the
 * entire source is already in memory. For production use with large
 * model files, prefer convertToLowbitQStreaming().
 */
export function convertToLowbitQ(
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

  const lowbitQTensors = new Map<string, LowbitQTensorGroup>();
  const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
  const lowbitQLayers = new Set<number>();
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
        lowbitQLayers.add(layerIdx);
      }

      const baseName = tensor.name.replace(/\.weight$/, '');
      lowbitQTensors.set(tensor.name, { baseName, decomposition });

      let nmse: number | null = null;
      if (computeQuality) {
        const reconstructed = reconstruct(decomposition);
        nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
      }

      const lowbitQSizeBytes =
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
        lowbitQSizeBytes,
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
        lowbitQSizeBytes: null,
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

  const sortedLayers = Array.from(lowbitQLayers).sort((a, b) => a - b);
  const result = writeLowbitQGGUF({
    sourceHeader: header,
    sourceBuffer,
    lowbitQTensors,
    passthroughTensors,
    lowbitQLayers: sortedLayers,
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
    convertedTensorCount: lowbitQTensors.size,
    passthroughTensorCount: passthroughTensors.size,
    tensorNMSE,
    tensorRecords,
  };
}

// ---------------------------------------------------------------------------
// v2: mixed-bit streaming conversion
// ---------------------------------------------------------------------------

/** Extended result type for v2 conversions */
export interface ConvertV2Result extends ConvertResult {
  /** Allocation plan produced by the bitwidth allocator */
  allocations: TensorAllocRecord[];
}

/**
 * Convert a source GGUF File/Blob to lowbit-Q v2 GGUF format.
 *
 * Uses the bitwidth allocator to assign per-tensor quantization types:
 *   - SVID_1BIT → OneBit (arXiv:2402.11295) SVID decomposition (a, sign, b triplet)
 *   - Q4_0      → RTN 4-bit re-quantization (ggml native, no custom kernel)
 *   - PASSTHROUGH → unchanged (embedding, norm, first/last layer override)
 *
 * Memory model: same as convertToLowbitQStreaming — tensors are streamed one
 * by one; only one tensor's fp32 intermediate is in memory at a time.
 */
export async function convertToLowbitQV2Streaming(
  source: File | Blob,
  options: ConvertOptions & {
    allocatorConfig?: BitwidthAllocatorConfig;
    totalLayers?: number;
    sourceModelName?: string;
  } = {},
): Promise<ConvertV2Result> {
  const {
    onProgress,
    computeQuality = false,
    allocatorConfig = DEFAULT_ALLOCATOR_CONFIG,
    sourceModelName,
  } = options;

  // --- Parse header ---
  onProgress?.({
    stage: 'parsing',
    currentTensor: 0,
    totalTensors: 0,
    currentTensorName: '',
    percent: 0,
  });

  const { header } = await parseHeaderFromBlob(source);
  const totalTensors = header.tensors.length;

  // Resolve model architecture and total transformer block count.
  const arch: string = (() => {
    const archEntry = header.metadata.get('general.architecture');
    return archEntry ? String(archEntry.value) : '';
  })();

  const totalLayers: number = (() => {
    if (options.totalLayers !== undefined) return options.totalLayers;
    if (arch) {
      const entry = header.metadata.get(`${arch}.block_count`);
      if (entry !== undefined) return Number(entry.value as number);
    }
    return 0;
  })();

  // Phase 1a scope: the C++ SVID dispatch patch (0003) only instruments the
  // LLAMA graph builder, and the loader patch (0002) only marks projection
  // weights optional in the LLAMA branch of llama-model.cpp.  For any other
  // architecture that gets SVID-assigned projections the loader will fail with
  // "tensor not found" because the .weight tensor is absent.
  //
  // Guard: if the GGUF declares a non-Llama architecture, override all SVID
  // allocations to Q4_0 so the output remains loadable by unpatched builders.
  // Unknown architecture (arch === '') is left unchanged — it is more likely a
  // hand-crafted Llama GGUF than a patched non-Llama one.
  const effectiveAllocatorConfig: BitwidthAllocatorConfig =
    (arch !== '' && arch !== 'llama')
      ? {
          ...allocatorConfig,
          attnQKQuant: LowbitQQuantType.Q4_0,
          attnVOQuant: LowbitQQuantType.Q4_0,
          ffnQuant: LowbitQQuantType.Q4_0,
        }
      : allocatorConfig;

  // --- Build allocation plan ---
  const allocations = allocateBitwidths(header.tensors, totalLayers, effectiveAllocatorConfig);
  const allocByName = new Map<string, TensorAllocRecord>(allocations.map((r) => [r.name, r]));

  // --- Process tensors ---
  const svid1bitTensors = new Map<string, LowbitQTensorGroup>();
  const nativeQuantTensors: NativeQuantTensor[] = [];
  const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
  const tensorNMSE = new Map<string, number>();
  const tensorRecords: TensorConvertRecord[] = [];
  let convertedCount = 0;

  for (let t = 0; t < totalTensors; t++) {
    const tensor = header.tensors[t];

    onProgress?.({
      stage: 'converting',
      currentTensor: t,
      totalTensors,
      currentTensorName: tensor.name,
      percent: Math.round((t / totalTensors) * 90),
    });

    const alloc = allocByName.get(tensor.name);
    const quantType = alloc?.quantType ?? LowbitQQuantType.PASSTHROUGH;
    const rawData = await readTensorFromBlob(source, header, tensor);
    const tensorDataSize = rawData.byteLength;

    if (quantType === LowbitQQuantType.SVID_1BIT) {
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);
      const inFeatures = Number(tensor.dims[0]);
      const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
      const decomposition = decompose(fp32Weights, outFeatures, inFeatures);
      const baseName = tensor.name.replace(/\.weight$/, '');
      svid1bitTensors.set(tensor.name, { baseName, decomposition });
      convertedCount++;

      let nmse: number | null = null;
      if (computeQuality) {
        // Threshold removed: reconstruct() already allocates the full Float32Array
        // regardless; the NMSE loop is O(n) with no additional allocation.
        // For TinyLlama's largest tensors (11.5M elements) this is ~46 MB and
        // completes in well under 1 second in the worker.
        const reconstructed = reconstruct(decomposition);
        nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
        // Update alloc record with measured NMSE
        if (alloc) alloc.nmse = nmse;
      }

      const lowbitQSizeBytes =
        decomposition.outFeatures * 2 +
        decomposition.inFeatures * 2 +
        decomposition.sign.byteLength;

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        lowbitQSizeBytes,
        dims: tensor.dims.map(Number),
      });
    } else if (quantType === LowbitQQuantType.Q4_0) {
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);
      const q4Data = quantizeQ4_0(fp32Weights);

      // Keep the original tensor name (e.g. "blk.0.attn_q.weight").
      // llama.cpp's graph builder resolves projection weights by their original
      // .weight names; renaming them breaks model load for any layer not handled
      // by the SVID custom path. The GGML type (Q4_0) stored in the tensor header
      // is sufficient for native kernel dispatch — no name change needed.
      // The lowbit-q.tensor_alloc JSON metadata records the allocation decision.
      nativeQuantTensors.push({
        name: tensor.name,
        type: 2, // GGMLType.Q4_0 = 2
        dims: tensor.dims,
        data: q4Data,
      });
      convertedCount++;

      // Roundtrip NMSE: measure quantization error of Q4_0 (fp32 → Q4_0 → fp32)
      let nmse: number | null = null;
      if (computeQuality) {
        const dequantized = dequantQ4_0(q4Data, totalElements);
        nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
      }

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        lowbitQSizeBytes: q4Data.byteLength,
        dims: tensor.dims.map(Number),
      });
    } else if (quantType === LowbitQQuantType.Q3_K) {
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);
      const q3kData = quantizeQ3_K(fp32Weights);

      nativeQuantTensors.push({
        name: tensor.name,
        type: 11, // GGMLType.Q3_K = 11
        dims: tensor.dims,
        data: q3kData,
      });
      convertedCount++;

      let nmse: number | null = null;
      if (computeQuality) {
        const dequantized = dequantQ3_K(q3kData, totalElements);
        nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
      }

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        lowbitQSizeBytes: q3kData.byteLength,
        dims: tensor.dims.map(Number),
      });
    } else if (quantType === LowbitQQuantType.Q2_K) {
      const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
      const fp32Weights = dequantize(rawData, tensor.type, totalElements);
      const q2kData = quantizeQ2_K(fp32Weights);

      nativeQuantTensors.push({
        name: tensor.name,
        type: 10, // GGMLType.Q2_K = 10
        dims: tensor.dims,
        data: q2kData,
      });
      convertedCount++;

      let nmse: number | null = null;
      if (computeQuality) {
        const dequantized = dequantQ2_K(q2kData, totalElements);
        nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
      }

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: true,
        nmse,
        originalSizeBytes: tensorDataSize,
        lowbitQSizeBytes: q2kData.byteLength,
        dims: tensor.dims.map(Number),
      });
    } else {
      // PASSTHROUGH: keep tensor unchanged
      passthroughTensors.set(tensor.name, { info: tensor, data: rawData });

      tensorRecords.push({
        name: tensor.name,
        layerIndex: extractLayerIndex(tensor.name),
        family: classifyTensorFamily(tensor.name),
        converted: false,
        nmse: null,
        originalSizeBytes: tensorDataSize,
        lowbitQSizeBytes: null,
        dims: tensor.dims.map(Number),
      });
    }
  }

  // --- Compute quality metrics ---
  let quality: LowbitQQualityMetrics | undefined;
  if (computeQuality && tensorNMSE.size > 0) {
    const nmseValues = Array.from(tensorNMSE.values());
    quality = {
      nmseMean: nmseValues.reduce((s, v) => s + v, 0) / nmseValues.length,
      nmseMax: Math.max(...nmseValues),
      convertedTensorCount: convertedCount,
      passthroughTensorCount: passthroughTensors.size,
    };
  }

  // --- Build v2 metadata ---
  const v2Metadata: LowbitQV2Metadata = {
    formatVersion: 2,
    sourceModelName,
    sizeBudget: allocatorConfig.sizeBudget,
    kvCache: {
      kMethod: KVCacheQuantMethod.NONE,
      kBitwidth: 0,
      vMethod: KVCacheQuantMethod.NONE,
      vBitwidth: 0,
    },
    tensorAllocs: allocations,
    quality,
  };

  // --- Write v2 GGUF ---
  onProgress?.({
    stage: 'writing',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 92,
  });

  const result = writeLowbitQV2GGUF({
    sourceHeader: header,
    passthroughTensors,
    svid1bitTensors,
    nativeQuantTensors,
    v2Metadata,
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
    convertedTensorCount: convertedCount,
    passthroughTensorCount: passthroughTensors.size,
    tensorNMSE,
    tensorRecords,
    allocations,
  };
}
