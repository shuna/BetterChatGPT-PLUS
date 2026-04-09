/**
 * GGUF binary format writer for lowbit-Q GGUF files.
 *
 * Produces a valid GGUF v3 file with:
 * - Standard metadata (copied from source, with lowbit-Q additions)
 * - Non-weight tensors copied as-is
 * - Weight tensors replaced by lowbit-Q triplets (a, b, sign)
 */

import {
  type GGUFHeader,
  type GGUFTensorInfo,
  type GGUFMetadataEntry,
  type LowbitQDecomposition,
  GGUFValueType,
  GGMLType,
  LOWBIT_Q_VERSION_KEY,
  LOWBIT_Q_LAYERS_KEY,
  LOWBIT_Q_PACKING_KEY,
  LOWBIT_Q_FORMAT_VERSION,
  LOWBIT_Q_SIGN_PACKING,
  LOWBIT_Q_SUFFIX_A,
  LOWBIT_Q_SUFFIX_B,
  LOWBIT_Q_SUFFIX_SIGN,
} from './types';

import { fp32ToFp16 } from './dequantize';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GGUF_MAGIC = 0x46554747;
const GGUF_VERSION = 3;
const ALIGNMENT = 32;

// ---------------------------------------------------------------------------
// Output tensor descriptor (for planning layout before writing)
// ---------------------------------------------------------------------------

interface OutputTensor {
  name: string;
  type: GGMLType;
  dims: bigint[];
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// Binary writer helper
// ---------------------------------------------------------------------------

class GGUFBinaryWriter {
  private parts: Uint8Array[] = [];
  private totalSize = 0;

  get size(): number {
    return this.totalSize;
  }

  writeUint8(v: number): void {
    const buf = new Uint8Array(1);
    buf[0] = v;
    this.parts.push(buf);
    this.totalSize += 1;
  }

  writeUint16(v: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, v, true);
    this.parts.push(buf);
    this.totalSize += 2;
  }

  writeUint32(v: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, v, true);
    this.parts.push(buf);
    this.totalSize += 4;
  }

  writeUint64(v: bigint): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, v, true);
    this.parts.push(buf);
    this.totalSize += 8;
  }

  writeInt32(v: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setInt32(0, v, true);
    this.parts.push(buf);
    this.totalSize += 4;
  }

  writeFloat32(v: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, v, true);
    this.parts.push(buf);
    this.totalSize += 4;
  }

  writeFloat64(v: number): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, v, true);
    this.parts.push(buf);
    this.totalSize += 8;
  }

  writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeUint64(BigInt(encoded.length));
    this.parts.push(encoded);
    this.totalSize += encoded.length;
  }

  writeBool(v: boolean): void {
    this.writeUint8(v ? 1 : 0);
  }

  writeBytes(data: Uint8Array): void {
    this.parts.push(data);
    this.totalSize += data.length;
  }

  /** Write zero padding to reach alignment boundary */
  writePadding(alignment: number): void {
    const remainder = this.totalSize % alignment;
    if (remainder !== 0) {
      const padding = alignment - remainder;
      this.parts.push(new Uint8Array(padding));
      this.totalSize += padding;
    }
  }

  /** Assemble all parts into a single Uint8Array */
  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalSize);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Metadata serialization
// ---------------------------------------------------------------------------

function writeMetadataValue(
  writer: GGUFBinaryWriter,
  type: GGUFValueType,
  value: string | number | boolean | bigint | GGUFMetadataEntry[],
): void {
  switch (type) {
    case GGUFValueType.UINT8:
      writer.writeUint8(value as number);
      break;
    case GGUFValueType.INT8:
      writer.writeUint8((value as number) & 0xFF);
      break;
    case GGUFValueType.UINT16:
      writer.writeUint16(value as number);
      break;
    case GGUFValueType.INT16:
      writer.writeUint16((value as number) & 0xFFFF);
      break;
    case GGUFValueType.UINT32:
      writer.writeUint32(value as number);
      break;
    case GGUFValueType.INT32:
      writer.writeInt32(value as number);
      break;
    case GGUFValueType.FLOAT32:
      writer.writeFloat32(value as number);
      break;
    case GGUFValueType.BOOL:
      writer.writeBool(value as boolean);
      break;
    case GGUFValueType.STRING:
      writer.writeString(value as string);
      break;
    case GGUFValueType.UINT64:
      writer.writeUint64(value as bigint);
      break;
    case GGUFValueType.INT64:
      writer.writeUint64(value as bigint); // same encoding
      break;
    case GGUFValueType.FLOAT64:
      writer.writeFloat64(value as number);
      break;
    case GGUFValueType.ARRAY: {
      const arr = value as GGUFMetadataEntry[];
      if (arr.length === 0) {
        writer.writeUint32(GGUFValueType.UINT32); // element type
        writer.writeUint64(0n);
      } else {
        writer.writeUint32(arr[0].type); // element type
        writer.writeUint64(BigInt(arr.length));
        for (const elem of arr) {
          writeMetadataValue(writer, elem.type, elem.value);
        }
      }
      break;
    }
  }
}

function writeMetadataEntry(
  writer: GGUFBinaryWriter,
  key: string,
  entry: GGUFMetadataEntry,
): void {
  writer.writeString(key);
  writer.writeUint32(entry.type);
  writeMetadataValue(writer, entry.type, entry.value);
}

// ---------------------------------------------------------------------------
// Float32 → Float16 array conversion
// ---------------------------------------------------------------------------

function float32ArrayToFp16Bytes(values: Float32Array): Uint8Array {
  const result = new Uint8Array(values.length * 2);
  const view = new DataView(result.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint16(i * 2, fp32ToFp16(values[i]), true);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LowbitQTensorGroup {
  /** Base tensor name (without .weight suffix) */
  baseName: string;
  decomposition: LowbitQDecomposition;
}

export interface WriteLowbitQGGUFOptions {
  /** Source GGUF header (for metadata and non-weight tensor info) */
  sourceHeader: GGUFHeader;
  /** Source GGUF file buffer (for copying non-weight tensor data) */
  sourceBuffer: ArrayBuffer;
  /** Lowbit-Q decomposition results, keyed by original tensor name */
  lowbitQTensors: Map<string, LowbitQTensorGroup>;
  /** Non-weight tensor data to copy directly (name → data) */
  passthroughTensors: Map<string, { info: GGUFTensorInfo; data: Uint8Array }>;
  /** Layer indices that use lowbit-Q representation */
  lowbitQLayers: number[];
}

/**
 * Write a complete lowbit-Q GGUF file.
 *
 * The output contains:
 * - All metadata from the source file, plus lowbit-Q keys
 * - Non-weight tensors copied as-is from the source
 * - Weight tensors replaced by lowbit-Q triplets (a, b, sign) stored as F16/U8
 */
export function writeLowbitQGGUF(options: WriteLowbitQGGUFOptions): Uint8Array {
  const {
    sourceHeader,
    lowbitQTensors,
    passthroughTensors,
    lowbitQLayers,
  } = options;

  // Build output tensor list
  const outputTensors: OutputTensor[] = [];

  // 1. Add passthrough tensors
  for (const [name, { info, data }] of passthroughTensors) {
    outputTensors.push({
      name,
      type: info.type,
      dims: info.dims,
      data,
    });
  }

  // 2. Add lowbit-Q triplets
  for (const [originalName, group] of lowbitQTensors) {
    const { decomposition } = group;
    const baseName = originalName.replace(/\.weight$/, '');

    // a tensor: fp16, shape (out_features,)
    const aData = float32ArrayToFp16Bytes(decomposition.a);
    outputTensors.push({
      name: baseName + LOWBIT_Q_SUFFIX_A,
      type: GGMLType.F16,
      dims: [BigInt(decomposition.outFeatures)],
      data: aData,
    });

    // b tensor: fp16, shape (in_features,)
    const bData = float32ArrayToFp16Bytes(decomposition.b);
    outputTensors.push({
      name: baseName + LOWBIT_Q_SUFFIX_B,
      type: GGMLType.F16,
      dims: [BigInt(decomposition.inFeatures)],
      data: bData,
    });

    // sign tensor: uint8 packed bits, shape (ceil(out*in/8),)
    outputTensors.push({
      name: baseName + LOWBIT_Q_SUFFIX_SIGN,
      type: GGMLType.I8,  // stored as I8 (byte array)
      dims: [BigInt(decomposition.sign.length)],
      data: decomposition.sign,
    });
  }

  // Build metadata: copy source metadata + add lowbit-Q keys
  const metadata = new Map<string, GGUFMetadataEntry>(sourceHeader.metadata);

  // Add lowbit-Q metadata
  metadata.set(LOWBIT_Q_VERSION_KEY, {
    key: LOWBIT_Q_VERSION_KEY,
    type: GGUFValueType.UINT32,
    value: LOWBIT_Q_FORMAT_VERSION,
  });

  metadata.set(LOWBIT_Q_PACKING_KEY, {
    key: LOWBIT_Q_PACKING_KEY,
    type: GGUFValueType.STRING,
    value: LOWBIT_Q_SIGN_PACKING,
  });

  // lowbit-Q layers as array of uint32
  metadata.set(LOWBIT_Q_LAYERS_KEY, {
    key: LOWBIT_Q_LAYERS_KEY,
    type: GGUFValueType.ARRAY,
    value: lowbitQLayers.map((idx, i) => ({
      key: `[${i}]`,
      type: GGUFValueType.UINT32,
      value: idx,
    })),
  });

  // --- Phase 1: Write header + metadata + tensor info ---
  const headerWriter = new GGUFBinaryWriter();

  // Magic + version
  headerWriter.writeUint32(GGUF_MAGIC);
  headerWriter.writeUint32(GGUF_VERSION);

  // Tensor count + metadata count
  headerWriter.writeUint64(BigInt(outputTensors.length));
  headerWriter.writeUint64(BigInt(metadata.size));

  // Metadata KV pairs
  for (const [key, entry] of metadata) {
    writeMetadataEntry(headerWriter, key, entry);
  }

  // Tensor info (name, dims, type, offset — offset computed in phase 2)
  // First pass: compute offsets
  let dataOffset = 0;
  const tensorOffsets: bigint[] = [];
  for (const tensor of outputTensors) {
    tensorOffsets.push(BigInt(dataOffset));
    dataOffset += tensor.data.length;
    // Align each tensor's data
    const remainder = dataOffset % ALIGNMENT;
    if (remainder !== 0) dataOffset += ALIGNMENT - remainder;
  }

  // Write tensor info
  for (let t = 0; t < outputTensors.length; t++) {
    const tensor = outputTensors[t];
    headerWriter.writeString(tensor.name);
    headerWriter.writeUint32(tensor.dims.length);
    for (const dim of tensor.dims) {
      headerWriter.writeUint64(dim);
    }
    headerWriter.writeUint32(tensor.type);
    headerWriter.writeUint64(tensorOffsets[t]);
  }

  // Pad header to alignment
  headerWriter.writePadding(ALIGNMENT);

  // --- Phase 2: Assemble final buffer ---
  const headerBytes = headerWriter.toUint8Array();

  // Compute total size
  let totalDataSize = 0;
  for (const tensor of outputTensors) {
    totalDataSize += tensor.data.length;
    const remainder = (totalDataSize) % ALIGNMENT;
    if (remainder !== 0) totalDataSize += ALIGNMENT - remainder;
  }

  const totalSize = headerBytes.length + totalDataSize;
  const result = new Uint8Array(totalSize);

  // Copy header
  result.set(headerBytes, 0);

  // Copy tensor data
  let writePos = headerBytes.length;
  for (const tensor of outputTensors) {
    result.set(tensor.data, writePos);
    writePos += tensor.data.length;
    // Pad to alignment
    const remainder = writePos % ALIGNMENT;
    if (remainder !== 0) writePos += ALIGNMENT - remainder;
  }

  return result;
}
