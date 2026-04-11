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
  buildLowbitQV2Metadata,
  buildGGUFHeaderBytes,
  computeAlignedDataSize,
  type LowbitQTensorGroup,
  type NativeQuantTensor,
  type OutputTensorPlan,
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
import {
  LowbitQQuantType,
  KVCacheQuantMethod,
  GGMLType,
  GGML_BLOCK_SIZES,
  GGML_TYPE_SIZES,
  LOWBIT_Q_SUFFIX_A,
  LOWBIT_Q_SUFFIX_B,
  LOWBIT_Q_SUFFIX_SIGN,
} from './types';
import { extractLayerIndex, classifyTensorFamily, type TensorConvertRecord } from './tensorFilter';
import { allocateBitwidths, DEFAULT_ALLOCATOR_CONFIG, validateAllocations } from './allocator';
import { quantizeQ4_0 } from './q4_0Quantize';
import { quantizeQ3_K } from './q3_kQuantize';
import { quantizeQ2_K } from './q2_kQuantize';
import { writeTempChunk, removeTempFile, createOPFSWritable, createOPFSSyncWriter, getOPFSFileSize, deleteModelFile } from '../storage';
import type { OPFSWriter } from '../storage';
import { fp32ToFp16 } from './dequantize';

const GGUF_ALIGNMENT = 32;

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
const TENSOR_STREAM_CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Parse the GGUF header from a File/Blob, reading only the minimum needed.
 * Falls back to reading the full file if the initial read is insufficient.
 */
async function parseHeaderFromBlob(
  source: File | Blob,
): Promise<{ header: GGUFHeader; fullBuffer: ArrayBuffer }> {
  // Try progressively larger reads until the header parses.
  // Models with many tensors (e.g., Gemma 4 with ~500 tensors) can have
  // headers exceeding 256KB. We avoid source.arrayBuffer() (full file) as
  // it would OOM for multi-GB files in Worker contexts.
  const readSizes = [
    HEADER_INITIAL_READ,    // 256 KB — covers most models
    1 * 1024 * 1024,        //   1 MB
    4 * 1024 * 1024,        //   4 MB
    16 * 1024 * 1024,       //  16 MB — covers extremely large headers
  ];

  for (const readSize of readSizes) {
    const size = Math.min(source.size, readSize);
    const buffer = await source.slice(0, size).arrayBuffer();
    try {
      const header = parseGGUFHeader(buffer);
      if (header.dataOffset <= source.size) {
        return { header, fullBuffer: buffer };
      }
    } catch {
      // Header doesn't fit in this read size — try larger
    }
  }

  // Final fallback: read full file (only safe for small files)
  if (source.size <= 64 * 1024 * 1024) {
    const fullBuffer = await source.arrayBuffer();
    const header = parseGGUFHeader(fullBuffer);
    return { header, fullBuffer };
  }

  throw new Error(
    `GGUF ヘッダーの解析に失敗しました: 16 MB を超えるヘッダーサイズです。` +
    `ファイルが破損している可能性があります。`,
  );
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

async function streamTensorToOpfs(
  source: File | Blob,
  header: GGUFHeader,
  tensor: GGUFTensorInfo,
  target: OPFSTarget,
): Promise<void> {
  const size = computeTensorDataSize(tensor);
  const absoluteOffset = header.dataOffset + Number(tensor.offset);
  let offset = 0;

  while (offset < size) {
    const chunkSize = Math.min(TENSOR_STREAM_CHUNK_SIZE, size - offset);
    const chunkBuffer = await source
      .slice(absoluteOffset + offset, absoluteOffset + offset + chunkSize)
      .arrayBuffer();
    await writeTempChunk(target.modelId, target.fileName, new Uint8Array(chunkBuffer), true);
    offset += chunkSize;
  }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

function computeTypeChunkSizeBytes(type: GGMLType, elements: number): number {
  const blockElems = GGML_BLOCK_SIZES[type];
  const blockBytes = GGML_TYPE_SIZES[type];
  if (blockElems === undefined || blockBytes === undefined) {
    throw new Error(`Chunked conversion not supported for ggml type ${type}`);
  }
  return Math.ceil(elements / blockElems) * blockBytes;
}

async function streamNativeQuantTensorToOpfs(
  source: File | Blob,
  header: GGUFHeader,
  tensor: GGUFTensorInfo,
  targetType: LowbitQQuantType.Q4_0 | LowbitQQuantType.Q3_K | LowbitQQuantType.Q2_K,
  target: OPFSTarget,
): Promise<void> {
  const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
  const sourceBlockElems = GGML_BLOCK_SIZES[tensor.type] ?? 1;
  const targetBlockElems =
    targetType === LowbitQQuantType.Q4_0 ? 32 : 256;
  const processingBlockElems = lcm(sourceBlockElems, targetBlockElems);
  const chunkElements = Math.max(
    processingBlockElems,
    Math.floor(TENSOR_STREAM_CHUNK_SIZE / Math.max(1, computeTypeChunkSizeBytes(tensor.type, processingBlockElems)))
      * processingBlockElems,
  );

  const absoluteOffset = header.dataOffset + Number(tensor.offset);
  let elementOffset = 0;
  let byteOffset = 0;

  while (elementOffset < totalElements) {
    const elementsThisChunk = Math.min(chunkElements, totalElements - elementOffset);
    const sourceChunkBytes = computeTypeChunkSizeBytes(tensor.type, elementsThisChunk);
    const chunkBuffer = await source
      .slice(absoluteOffset + byteOffset, absoluteOffset + byteOffset + sourceChunkBytes)
      .arrayBuffer();
    const rawChunk = new Uint8Array(chunkBuffer);
    const fp32Chunk = dequantize(rawChunk, tensor.type, elementsThisChunk);
    const quantizedChunk =
      targetType === LowbitQQuantType.Q4_0 ? quantizeQ4_0(fp32Chunk) :
      targetType === LowbitQQuantType.Q3_K ? quantizeQ3_K(fp32Chunk) :
      quantizeQ2_K(fp32Chunk);
    await writeTempChunk(target.modelId, target.fileName, quantizedChunk, true);
    byteOffset += sourceChunkBytes;
    elementOffset += elementsThisChunk;
  }
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

export interface ConvertV2PersistResult extends Omit<ConvertV2Result, 'data'> {}

interface OPFSTarget {
  modelId: string;
  fileName: string;
}

interface ConversionPlanningState {
  header: GGUFHeader;
  totalTensors: number;
  allocations: TensorAllocRecord[];
  allocByName: Map<string, TensorAllocRecord>;
  effectiveAllocatorConfig: BitwidthAllocatorConfig;
}

interface PlannedTensorOutput {
  name: string;
  type: number;
  dims: bigint[];
  dataSize: number;
}

interface PlannedConversionLayout {
  outputTensors: PlannedTensorOutput[];
  convertedCount: number;
  passthroughCount: number;
}

function resolveArchitectureAndAllocator(
  header: GGUFHeader,
  allocatorConfig: BitwidthAllocatorConfig,
  totalLayersOverride?: number,
): ConversionPlanningState {
  const totalTensors = header.tensors.length;
  const arch: string = (() => {
    const archEntry = header.metadata.get('general.architecture');
    return archEntry ? String(archEntry.value) : '';
  })();

  const totalLayers: number = (() => {
    if (totalLayersOverride !== undefined) return totalLayersOverride;
    if (arch) {
      const entry = header.metadata.get(`${arch}.block_count`);
      if (entry !== undefined) return Number(entry.value as number);
    }
    return 0;
  })();

  // Non-llama architectures (qwen35, gemma4 etc.) should not use SVID_1BIT
  // because the tensor naming might not match llama.cpp's struct-field dispatch.
  // However, PASSTHROUGH must never be overridden — it means "keep as-is".
  const isNonLlama = arch !== '' && arch !== 'llama';
  const hasSVID = allocatorConfig.attnQKQuant === LowbitQQuantType.SVID_1BIT ||
    allocatorConfig.attnVOQuant === LowbitQQuantType.SVID_1BIT ||
    allocatorConfig.ffnQuant === LowbitQQuantType.SVID_1BIT;

  const effectiveAllocatorConfig: BitwidthAllocatorConfig =
    (isNonLlama && hasSVID)
      ? {
          ...allocatorConfig,
          attnQKQuant: LowbitQQuantType.Q4_0,
          attnVOQuant: LowbitQQuantType.Q4_0,
          ffnQuant: LowbitQQuantType.Q4_0,
        }
      : allocatorConfig;

  const allocations = allocateBitwidths(header.tensors, totalLayers, effectiveAllocatorConfig);
  const allocByName = new Map<string, TensorAllocRecord>(allocations.map((r) => [r.name, r]));

  return {
    header,
    totalTensors,
    allocations,
    allocByName,
    effectiveAllocatorConfig,
  };
}

function enforceAllocationValidation(allocations: TensorAllocRecord[]): void {
  const validationWarnings = validateAllocations(allocations);
  for (const warn of validationWarnings) {
    if (warn.level === 'forbidden') {
      throw new Error(
        `[lowbit-q] FORBIDDEN allocation rejected: ${warn.message}\n` +
        `Tensor: ${warn.tensorName}, Quant: ${warn.quantType}\n` +
        `See COMPRESSION-RISK-MAP.md for details.`,
      );
    }
    console.warn(`[lowbit-q] CAUTION: ${warn.message}`);
  }
}

function planTensorOutputs(
  header: GGUFHeader,
  allocations: TensorAllocRecord[],
): PlannedConversionLayout {
  const allocByName = new Map<string, TensorAllocRecord>(allocations.map((r) => [r.name, r]));
  const outputTensors: PlannedTensorOutput[] = [];
  let convertedCount = 0;
  let passthroughCount = 0;

  for (const tensor of header.tensors) {
    const alloc = allocByName.get(tensor.name);
    const quantType = alloc?.quantType ?? LowbitQQuantType.PASSTHROUGH;
    const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));

    if (quantType === LowbitQQuantType.SVID_1BIT) {
      const inFeatures = Number(tensor.dims[0]);
      const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
      const baseName = tensor.name.replace(/\.weight$/, '');
      outputTensors.push({
        name: baseName + LOWBIT_Q_SUFFIX_A,
        type: GGMLType.F16,
        dims: [BigInt(outFeatures)],
        dataSize: outFeatures * 2,
      });
      outputTensors.push({
        name: baseName + LOWBIT_Q_SUFFIX_B,
        type: GGMLType.F16,
        dims: [BigInt(inFeatures)],
        dataSize: inFeatures * 2,
      });
      outputTensors.push({
        name: baseName + LOWBIT_Q_SUFFIX_SIGN,
        type: GGMLType.I8,
        dims: [BigInt(Math.ceil(totalElements / 8))],
        dataSize: Math.ceil(totalElements / 8),
      });
      convertedCount++;
    } else if (
      quantType === LowbitQQuantType.Q4_0 ||
      quantType === LowbitQQuantType.Q3_K ||
      quantType === LowbitQQuantType.Q2_K
    ) {
      const targetType =
        quantType === LowbitQQuantType.Q4_0 ? LowbitQQuantType.Q4_0 :
        quantType === LowbitQQuantType.Q3_K ? LowbitQQuantType.Q3_K :
        LowbitQQuantType.Q2_K;
      const plannedType =
        targetType === LowbitQQuantType.Q4_0 ? 2 :
        targetType === LowbitQQuantType.Q2_K ? 10 : 11;
      outputTensors.push({
        name: tensor.name,
        type: plannedType,
        dims: tensor.dims,
        dataSize: computeTensorDataSize({ ...tensor, type: plannedType }),
      });
      convertedCount++;
    } else {
      outputTensors.push({
        name: tensor.name,
        type: tensor.type,
        dims: tensor.dims,
        dataSize: computeTensorDataSize(tensor),
      });
      passthroughCount++;
    }
  }

  return { outputTensors, convertedCount, passthroughCount };
}

function float32ArrayToFp16Bytes(values: Float32Array): Uint8Array {
  const result = new Uint8Array(values.length * 2);
  const view = new DataView(result.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint16(i * 2, fp32ToFp16(values[i]), true);
  }
  return result;
}

async function writePaddingChunk(target: OPFSTarget, payloadLength: number): Promise<void> {
  const remainder = payloadLength % GGUF_ALIGNMENT;
  if (remainder === 0) return;
  await writeTempChunk(
    target.modelId,
    target.fileName,
    new Uint8Array(GGUF_ALIGNMENT - remainder),
    true,
  );
}

/**
 * Convert a source GGUF File/Blob to lowbit-Q v2 GGUF format (in-memory).
 *
 * Uses the bitwidth allocator to assign per-tensor quantization types:
 *   - SVID_1BIT → OneBit (arXiv:2402.11295) SVID decomposition (a, sign, b triplet)
 *   - Q4_0      → RTN 4-bit re-quantization (ggml native, no custom kernel)
 *   - PASSTHROUGH → unchanged (embedding, norm, first/last layer override)
 *
 * **WARNING — full-buffer allocation**: The final output is buffered entirely in
 * memory via {@link writeLowbitQV2GGUF}. For models >200 MB this risks OOM in the
 * browser. Production callers must use {@link convertToLowbitQV2StreamingToOPFS}
 * which streams directly to OPFS with ~1 MB peak overhead per tensor.
 *
 * @deprecated Use {@link convertToLowbitQV2StreamingToOPFS} for production.
 * This function is retained only for unit/snapshot tests that need a byte-exact
 * in-memory GGUF buffer.
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
  const {
    totalTensors,
    allocations,
    allocByName,
  } = resolveArchitectureAndAllocator(header, allocatorConfig, options.totalLayers);

  enforceAllocationValidation(allocations);

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

/**
 * Low-memory v2 conversion path for large files.
 *
 * This performs a two-pass conversion:
 *   1. Plan output tensor sizes and optional quality metrics
 *   2. Re-read each tensor and write the GGUF directly to OPFS in order
 *
 * Peak memory stays near the largest single tensor plus a small write buffer,
 * instead of retaining the full output model in memory.
 */
export async function convertToLowbitQV2StreamingToOPFS(
  source: File | Blob,
  target: OPFSTarget,
  options: ConvertOptions & {
    allocatorConfig?: BitwidthAllocatorConfig;
    totalLayers?: number;
    sourceModelName?: string;
    /** When provided, the source file is deleted from OPFS before writing
     *  the output to free quota for large models (>2 GB). The Blob/File
     *  reference remains valid because OPFS getFile() returns a snapshot. */
    sourceOpfsInfo?: { modelId: string; fileName: string };
  } = {},
): Promise<ConvertV2PersistResult> {
  const {
    onProgress,
    computeQuality = false,
    allocatorConfig = DEFAULT_ALLOCATOR_CONFIG,
    sourceModelName,
  } = options;

  onProgress?.({
    stage: 'parsing',
    currentTensor: 0,
    totalTensors: 0,
    currentTensorName: '',
    percent: 0,
  });

  const { header } = await parseHeaderFromBlob(source);
  const planning = resolveArchitectureAndAllocator(header, allocatorConfig, options.totalLayers);
  const { totalTensors, allocations, allocByName } = planning;
  enforceAllocationValidation(allocations);

  const tensorNMSE = new Map<string, number>();
  const tensorRecords: TensorConvertRecord[] = [];
  const svidTensorNames = new Set<string>();
  const layout = planTensorOutputs(header, allocations);
  const plannedByName = new Map(layout.outputTensors.map((t) => [t.name, t]));

  // Pass 1: with quality enabled, measure actual NMSE and exact compressed sizes.
  // Without quality, avoid reading tensor payloads and rely on planned sizes only.
  if (computeQuality) {
    for (let t = 0; t < totalTensors; t++) {
      const tensor = header.tensors[t];
      const alloc = allocByName.get(tensor.name);
      const quantType = alloc?.quantType ?? LowbitQQuantType.PASSTHROUGH;
      const rawData = await readTensorFromBlob(source, header, tensor);
      const tensorDataSize = rawData.byteLength;

      onProgress?.({
        stage: 'converting',
        currentTensor: t,
        totalTensors,
        currentTensorName: `${tensor.name} (quality)`,
        percent: Math.round((t / Math.max(totalTensors, 1)) * 45),
      });

      if (quantType === LowbitQQuantType.SVID_1BIT) {
        const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
        const fp32Weights = dequantize(rawData, tensor.type, totalElements);
        const inFeatures = Number(tensor.dims[0]);
        const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
        const decomposition = decompose(fp32Weights, outFeatures, inFeatures);
        svidTensorNames.add(tensor.name);
        const reconstructed = reconstruct(decomposition);
        const nmse = computeNMSE(fp32Weights, reconstructed);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
        tensorRecords.push({
          name: tensor.name,
          layerIndex: extractLayerIndex(tensor.name),
          family: classifyTensorFamily(tensor.name),
          converted: true,
          nmse,
          originalSizeBytes: tensorDataSize,
          lowbitQSizeBytes:
            decomposition.outFeatures * 2 +
            decomposition.inFeatures * 2 +
            decomposition.sign.byteLength,
          dims: tensor.dims.map(Number),
        });
      } else if (quantType === LowbitQQuantType.Q4_0) {
        const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
        const fp32Weights = dequantize(rawData, tensor.type, totalElements);
        const q4Data = quantizeQ4_0(fp32Weights);
        const dequantized = dequantQ4_0(q4Data, totalElements);
        const nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
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
        const dequantized = dequantQ3_K(q3kData, totalElements);
        const nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
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
        const dequantized = dequantQ2_K(q2kData, totalElements);
        const nmse = computeNMSE(fp32Weights, dequantized);
        tensorNMSE.set(tensor.name, nmse);
        if (alloc) alloc.nmse = nmse;
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
  } else {
    for (let t = 0; t < totalTensors; t++) {
      const tensor = header.tensors[t];
      const alloc = allocByName.get(tensor.name);
      const quantType = alloc?.quantType ?? LowbitQQuantType.PASSTHROUGH;
      const tensorDataSize = computeTensorDataSize(tensor);

      onProgress?.({
        stage: 'converting',
        currentTensor: t,
        totalTensors,
        currentTensorName: `${tensor.name} (plan)`,
        percent: Math.round((t / Math.max(totalTensors, 1)) * 20),
      });

      if (quantType === LowbitQQuantType.SVID_1BIT) {
        svidTensorNames.add(tensor.name);
        const baseName = tensor.name.replace(/\.weight$/, '');
        const lowbitQSizeBytes =
          (plannedByName.get(baseName + LOWBIT_Q_SUFFIX_A)?.dataSize ?? 0) +
          (plannedByName.get(baseName + LOWBIT_Q_SUFFIX_B)?.dataSize ?? 0) +
          (plannedByName.get(baseName + LOWBIT_Q_SUFFIX_SIGN)?.dataSize ?? 0);
        tensorRecords.push({
          name: tensor.name,
          layerIndex: extractLayerIndex(tensor.name),
          family: classifyTensorFamily(tensor.name),
          converted: true,
          nmse: null,
          originalSizeBytes: tensorDataSize,
          lowbitQSizeBytes,
          dims: tensor.dims.map(Number),
        });
      } else if (
        quantType === LowbitQQuantType.Q4_0 ||
        quantType === LowbitQQuantType.Q3_K ||
        quantType === LowbitQQuantType.Q2_K
      ) {
        tensorRecords.push({
          name: tensor.name,
          layerIndex: extractLayerIndex(tensor.name),
          family: classifyTensorFamily(tensor.name),
          converted: true,
          nmse: null,
          originalSizeBytes: tensorDataSize,
          lowbitQSizeBytes: plannedByName.get(tensor.name)?.dataSize ?? null,
          dims: tensor.dims.map(Number),
        });
      } else {
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
  }

  let quality: LowbitQQualityMetrics | undefined;
  if (computeQuality && tensorNMSE.size > 0) {
    const nmseValues = Array.from(tensorNMSE.values());
    quality = {
      nmseMean: nmseValues.reduce((s, v) => s + v, 0) / nmseValues.length,
      nmseMax: Math.max(...nmseValues),
      convertedTensorCount: tensorRecords.filter((r) => r.converted).length,
      passthroughTensorCount: tensorRecords.filter((r) => !r.converted).length,
    };
  }

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

  const metadata = buildLowbitQV2Metadata(header, svidTensorNames, v2Metadata);
  const headerBytes = buildGGUFHeaderBytes(
    metadata,
    layout.outputTensors as OutputTensorPlan[],
  );
  const convertedSize = headerBytes.length + computeAlignedDataSize(
    layout.outputTensors as OutputTensorPlan[],
  );

  // Remove any existing output file before starting a fresh write.
  await removeTempFile(target.modelId, target.fileName);

  // For large models, delete the source file from OPFS to free quota before
  // writing the output. The source Blob remains valid because OPFS getFile()
  // returns a snapshot per the File System Access spec.
  if (options.sourceOpfsInfo) {
    const { modelId: srcModelId, fileName: srcFileName } = options.sourceOpfsInfo;
    console.info(`[lowbit-q] Deleting source from OPFS to free quota: ${srcModelId}/${srcFileName}`);
    try {
      await deleteModelFile(srcModelId, srcFileName);
    } catch (e) {
      console.warn('[lowbit-q] Failed to delete source (may not exist):', (e as Error).message);
    }
  }

  // Use SyncAccessHandle (direct write, no swap file) when available (Worker
  // context). Falls back to createWritable() on main thread.  SyncAccessHandle
  // avoids the ~2x storage overhead of the swap-file mechanism, which is
  // critical for large models (>2 GB) that would otherwise exceed OPFS quota.
  let writable: OPFSWriter;
  try {
    writable = await createOPFSSyncWriter(target.modelId, target.fileName);
    console.info('[lowbit-q] Using SyncAccessHandle writer (no swap overhead)');
  } catch {
    console.info('[lowbit-q] SyncAccessHandle unavailable, falling back to createWritable');
    const ws = await createOPFSWritable(target.modelId, target.fileName);
    writable = {
      write: (d: Uint8Array) => (ws as unknown as { write(d: Uint8Array): Promise<void> }).write(d),
      close: () => (ws as unknown as { close(): Promise<void> }).close(),
      abort: () => (ws as unknown as { abort(): Promise<void> }).abort(),
    };
  }

  // Inner helpers that write directly to the writer.
  const writeToStream = async (data: Uint8Array): Promise<void> => {
    await writable.write(data);
  };
  const writePaddingToStream = async (payloadLength: number): Promise<void> => {
    const rem = payloadLength % GGUF_ALIGNMENT;
    if (rem !== 0) {
      await writeToStream(new Uint8Array(GGUF_ALIGNMENT - rem));
    }
  };
  const streamTensorToStream = async (tensor: GGUFTensorInfo): Promise<void> => {
    const size = computeTensorDataSize(tensor);
    const absoluteOffset = header.dataOffset + Number(tensor.offset);
    let offset = 0;
    while (offset < size) {
      const chunkSize = Math.min(TENSOR_STREAM_CHUNK_SIZE, size - offset);
      const chunkBuffer = await source
        .slice(absoluteOffset + offset, absoluteOffset + offset + chunkSize)
        .arrayBuffer();
      await writeToStream(new Uint8Array(chunkBuffer));
      offset += chunkSize;
    }
  };
  const streamNativeQuantToStream = async (
    tensor: GGUFTensorInfo,
    targetType: LowbitQQuantType.Q4_0 | LowbitQQuantType.Q3_K | LowbitQQuantType.Q2_K,
  ): Promise<void> => {
    const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
    const sourceBlockElems = GGML_BLOCK_SIZES[tensor.type] ?? 1;
    const targetBlockElems = targetType === LowbitQQuantType.Q4_0 ? 32 : 256;
    const processingBlockElems = lcm(sourceBlockElems, targetBlockElems);
    const chunkElements = Math.max(
      processingBlockElems,
      Math.floor(
        TENSOR_STREAM_CHUNK_SIZE /
        Math.max(1, computeTypeChunkSizeBytes(tensor.type, processingBlockElems)),
      ) * processingBlockElems,
    );
    const absoluteOffset = header.dataOffset + Number(tensor.offset);
    let elementOffset = 0;
    let byteOffset = 0;
    while (elementOffset < totalElements) {
      const elementsThisChunk = Math.min(chunkElements, totalElements - elementOffset);
      const sourceChunkBytes = computeTypeChunkSizeBytes(tensor.type, elementsThisChunk);
      const chunkBuffer = await source
        .slice(absoluteOffset + byteOffset, absoluteOffset + byteOffset + sourceChunkBytes)
        .arrayBuffer();
      const rawChunk = new Uint8Array(chunkBuffer);
      const fp32Chunk = dequantize(rawChunk, tensor.type, elementsThisChunk);
      const quantizedChunk =
        targetType === LowbitQQuantType.Q4_0 ? quantizeQ4_0(fp32Chunk) :
        targetType === LowbitQQuantType.Q3_K ? quantizeQ3_K(fp32Chunk) :
        quantizeQ2_K(fp32Chunk);
      await writeToStream(quantizedChunk);
      byteOffset += sourceChunkBytes;
      elementOffset += elementsThisChunk;
    }
  };

  try {
    onProgress?.({
      stage: 'writing',
      currentTensor: 0,
      totalTensors,
      currentTensorName: 'GGUF header',
      percent: 92,
    });
    await writeToStream(headerBytes);

    for (let t = 0; t < totalTensors; t++) {
      const tensor = header.tensors[t];
      const alloc = allocByName.get(tensor.name);
      const quantType = alloc?.quantType ?? LowbitQQuantType.PASSTHROUGH;

      onProgress?.({
        stage: 'writing',
        currentTensor: t + 1,
        totalTensors,
        currentTensorName: tensor.name,
        percent: 92 + Math.round(((t + 1) / Math.max(totalTensors, 1)) * 7),
      });

      if (quantType === LowbitQQuantType.SVID_1BIT) {
        const rawData = await readTensorFromBlob(source, header, tensor);
        const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
        const fp32Weights = dequantize(rawData, tensor.type, totalElements);
        const inFeatures = Number(tensor.dims[0]);
        const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
        const decomposition = decompose(fp32Weights, outFeatures, inFeatures);
        const aData = float32ArrayToFp16Bytes(decomposition.a);
        const bData = float32ArrayToFp16Bytes(decomposition.b);
        await writeToStream(aData);
        await writePaddingToStream(aData.byteLength);
        await writeToStream(bData);
        await writePaddingToStream(bData.byteLength);
        await writeToStream(decomposition.sign);
        await writePaddingToStream(decomposition.sign.byteLength);
      } else if (quantType === LowbitQQuantType.Q4_0) {
        await streamNativeQuantToStream(tensor, LowbitQQuantType.Q4_0);
        await writePaddingToStream(
          computeTensorDataSize({ ...tensor, type: GGMLType.Q4_0 }),
        );
      } else if (quantType === LowbitQQuantType.Q3_K) {
        await streamNativeQuantToStream(tensor, LowbitQQuantType.Q3_K);
        await writePaddingToStream(
          computeTensorDataSize({ ...tensor, type: GGMLType.Q3_K }),
        );
      } else if (quantType === LowbitQQuantType.Q2_K) {
        await streamNativeQuantToStream(tensor, LowbitQQuantType.Q2_K);
        await writePaddingToStream(
          computeTensorDataSize({ ...tensor, type: GGMLType.Q2_K }),
        );
      } else {
        // PASSTHROUGH: copy source bytes unchanged
        await streamTensorToStream(tensor);
        await writePaddingToStream(computeTensorDataSize(tensor));
      }
    }

    await writable.close();
    console.info(
      `[lowbit-q] ✓ Streaming write complete.` +
      ` expected=${convertedSize}` +
      ` (header=${headerBytes.length} data=${computeAlignedDataSize(layout.outputTensors as OutputTensorPlan[])})`,
    );
  } catch (error) {
    // Abort the writable (discards partial write) then clean up.
    try {
      await writable.abort();
    } catch {
      // ignore abort errors
    }
    await removeTempFile(target.modelId, target.fileName);
    throw error;
  }

  // Post-write size verification: catches any write-size mismatch early.
  const actualSize = await getOPFSFileSize(target.modelId, target.fileName);
  if (actualSize !== convertedSize) {
    console.error(
      `[lowbit-q] ⚠️ OPFS size mismatch after write!` +
      ` expected=${convertedSize} actual=${actualSize} diff=${actualSize - convertedSize}`,
    );
  } else {
    console.info(`[lowbit-q] ✓ OPFS size verified: ${actualSize} bytes`);
  }

  onProgress?.({
    stage: 'done',
    currentTensor: totalTensors,
    totalTensors,
    currentTensorName: '',
    percent: 100,
  });

  return {
    originalSize: source.size,
    convertedSize,
    convertedTensorCount: layout.convertedCount,
    passthroughTensorCount: layout.passthroughCount,
    tensorNMSE,
    tensorRecords,
    allocations,
  };
}
