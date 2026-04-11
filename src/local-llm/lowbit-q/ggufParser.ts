/**
 * GGUF binary format parser.
 *
 * Parses GGUF header, metadata key-value pairs, and tensor descriptors
 * from an ArrayBuffer. Supports GGUF version 3 (current standard).
 *
 * Reference: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md
 */

import {
  type GGUFHeader,
  type GGUFMetadataEntry,
  type GGUFTensorInfo,
  GGUFValueType,
  GGMLType,
  GGML_BLOCK_SIZES,
  GGML_TYPE_SIZES,
} from './types';

// ---------------------------------------------------------------------------
// GGUF magic and alignment
// ---------------------------------------------------------------------------

const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian
const GGUF_DEFAULT_ALIGNMENT = 32;

// ---------------------------------------------------------------------------
// Binary reader helper
// ---------------------------------------------------------------------------

class BinaryReader {
  private view: DataView;
  private pos: number;
  private buf: Uint8Array;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.buf = new Uint8Array(buffer);
    this.pos = 0;
  }

  get offset(): number {
    return this.pos;
  }

  readUint8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  readInt8(): number {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readUint16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readInt16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readUint32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readInt32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readUint64(): bigint {
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }

  readInt64(): bigint {
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }

  readFloat32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readFloat64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  readBool(): boolean {
    const v = this.readUint8();
    return v !== 0;
  }

  readString(): string {
    const len = this.readUint64();
    const bytes = this.buf.slice(this.pos, this.pos + Number(len));
    this.pos += Number(len);
    // ignoreBOM: true prevents stripping the UTF-8 BOM (U+FEFF = 0xef 0xbb 0xbf)
    // from the start of token strings.  Without this, tokens like 0xef,0xbb,0xbf,0x2f,0x2f
    // and 0x2f,0x2f both decode to "//" and cause GGML_ASSERT(id_to_token.size() ==
    // token_to_id.size()) to fail when loading models such as Gemma 4 that have
    // BOM-prefixed token variants alongside their plain-text counterparts.
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  }

  readBytes(n: number): Uint8Array {
    const bytes = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return bytes;
  }

  /** Get the underlying ArrayBuffer */
  getBuffer(): ArrayBuffer {
    return this.view.buffer;
  }
}

// ---------------------------------------------------------------------------
// Metadata value reader
// ---------------------------------------------------------------------------

function readMetadataValue(
  reader: BinaryReader,
  type: GGUFValueType,
): string | number | boolean | bigint | GGUFMetadataEntry[] {
  switch (type) {
    case GGUFValueType.UINT8:
      return reader.readUint8();
    case GGUFValueType.INT8:
      return reader.readInt8();
    case GGUFValueType.UINT16:
      return reader.readUint16();
    case GGUFValueType.INT16:
      return reader.readInt16();
    case GGUFValueType.UINT32:
      return reader.readUint32();
    case GGUFValueType.INT32:
      return reader.readInt32();
    case GGUFValueType.FLOAT32:
      return reader.readFloat32();
    case GGUFValueType.BOOL:
      return reader.readBool();
    case GGUFValueType.STRING:
      return reader.readString();
    case GGUFValueType.UINT64:
      return reader.readUint64();
    case GGUFValueType.INT64:
      return reader.readInt64();
    case GGUFValueType.FLOAT64:
      return reader.readFloat64();
    case GGUFValueType.ARRAY: {
      const elemType = reader.readUint32() as GGUFValueType;
      const count = reader.readUint64();
      const arr: GGUFMetadataEntry[] = [];
      for (let i = 0; i < Number(count); i++) {
        arr.push({
          key: `[${i}]`,
          type: elemType,
          value: readMetadataValue(reader, elemType),
        });
      }
      return arr;
    }
    default:
      throw new Error(`Unknown GGUF metadata value type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GGUF file header from an ArrayBuffer.
 *
 * Returns the parsed header including all metadata and tensor descriptors.
 * The `dataOffset` field indicates where tensor data begins (aligned).
 */
export function parseGGUFHeader(buffer: ArrayBuffer): GGUFHeader {
  const reader = new BinaryReader(buffer);

  // Magic
  const magic = reader.readUint32();
  if (magic !== GGUF_MAGIC) {
    throw new Error(
      `Invalid GGUF magic: 0x${magic.toString(16).padStart(8, '0')} ` +
      `(expected 0x${GGUF_MAGIC.toString(16).padStart(8, '0')})`,
    );
  }

  // Version
  const version = reader.readUint32();
  if (version < 2 || version > 3) {
    throw new Error(`Unsupported GGUF version: ${version} (expected 2 or 3)`);
  }

  // Counts
  const tensorCount = reader.readUint64();
  const metadataCount = reader.readUint64();

  // Metadata
  const metadata = new Map<string, GGUFMetadataEntry>();
  for (let i = 0; i < Number(metadataCount); i++) {
    const key = reader.readString();
    const type = reader.readUint32() as GGUFValueType;
    const value = readMetadataValue(reader, type);
    metadata.set(key, { key, type, value });
  }

  // Tensor info
  const tensors: GGUFTensorInfo[] = [];
  for (let i = 0; i < Number(tensorCount); i++) {
    const name = reader.readString();
    const nDims = reader.readUint32();
    const dims: bigint[] = [];
    for (let d = 0; d < nDims; d++) {
      dims.push(reader.readUint64());
    }
    const type = reader.readUint32() as GGMLType;
    const offset = reader.readUint64();
    tensors.push({ name, nDims, dims, type, offset });
  }

  // Determine alignment
  let alignment = GGUF_DEFAULT_ALIGNMENT;
  const alignEntry = metadata.get('general.alignment');
  if (alignEntry && typeof alignEntry.value === 'number') {
    alignment = alignEntry.value;
  }

  // Data offset: current position aligned up to alignment boundary
  const currentPos = reader.offset;
  const dataOffset = Math.ceil(currentPos / alignment) * alignment;

  return {
    version,
    tensorCount,
    metadataCount,
    metadata,
    tensors,
    dataOffset,
  };
}

/**
 * Extract a metadata value by key, with type assertion.
 */
export function getMetadataString(header: GGUFHeader, key: string): string | undefined {
  const entry = header.metadata.get(key);
  if (!entry) return undefined;
  if (typeof entry.value === 'string') return entry.value;
  return undefined;
}

export function getMetadataUint32(header: GGUFHeader, key: string): number | undefined {
  const entry = header.metadata.get(key);
  if (!entry) return undefined;
  if (typeof entry.value === 'number') return entry.value;
  return undefined;
}

export function getMetadataArray(header: GGUFHeader, key: string): GGUFMetadataEntry[] | undefined {
  const entry = header.metadata.get(key);
  if (!entry) return undefined;
  if (Array.isArray(entry.value)) return entry.value;
  return undefined;
}

/**
 * Compute the byte size of a tensor's data in the GGUF file.
 *
 * Uses GGML_BLOCK_SIZES / GGML_TYPE_SIZES tables from types.ts so that any
 * newly supported GGML type only needs to be added there, not here.
 * F32 and F16 are element-wise (block size = 1); all others are block-wise.
 */
export function computeTensorDataSize(tensor: GGUFTensorInfo): number {
  const totalElements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));

  const blockElems = GGML_BLOCK_SIZES[tensor.type];
  const blockBytes = GGML_TYPE_SIZES[tensor.type];

  if (blockElems !== undefined && blockBytes !== undefined) {
    if (blockElems === 1) {
      // F32, F16: element-wise
      return totalElements * blockBytes;
    }
    const nBlocks = Math.ceil(totalElements / blockElems);
    return nBlocks * blockBytes;
  }

  throw new Error(`Cannot compute data size for ggml type ${tensor.type}`);
}

/**
 * Read raw tensor data from the GGUF file buffer.
 */
export function readTensorData(
  buffer: ArrayBuffer,
  header: GGUFHeader,
  tensor: GGUFTensorInfo,
): Uint8Array {
  const size = computeTensorDataSize(tensor);
  const absoluteOffset = header.dataOffset + Number(tensor.offset);
  return new Uint8Array(buffer, absoluteOffset, size);
}

/**
 * Check if a tensor name corresponds to a weight tensor (Linear layer).
 * Weight tensors are those that should be converted to lowbit-Q format.
 */
export function isWeightTensor(name: string): boolean {
  // Weight tensors end with .weight and are in attention or FFN layers
  if (!name.endsWith('.weight')) return false;
  // Exclude embedding, output, and normalization layers
  if (name === 'token_embd.weight') return false;
  if (name === 'output.weight') return false;
  if (name.includes('_norm.weight')) return false;
  if (name.includes('layernorm')) return false;
  if (name.includes('ln_')) return false;
  return true;
}
