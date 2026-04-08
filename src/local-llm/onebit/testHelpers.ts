/**
 * Test helpers: Generate synthetic GGUF files for onebit pipeline testing.
 *
 * Creates minimal valid GGUF files with known tensor values so we can
 * verify the parse → dequant → decompose → write → re-parse round trip.
 */

import { GGMLType, GGUFValueType } from './types';
import { fp32ToFp16 } from './dequantize';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GGUF_MAGIC = 0x46554747;
const GGUF_VERSION = 3;
const ALIGNMENT = 32;

// ---------------------------------------------------------------------------
// Binary builder
// ---------------------------------------------------------------------------

class BufferBuilder {
  private parts: Uint8Array[] = [];
  private _size = 0;

  get size(): number { return this._size; }

  writeUint8(v: number): void {
    const buf = new Uint8Array(1);
    buf[0] = v;
    this.parts.push(buf);
    this._size += 1;
  }

  writeUint32(v: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, v, true);
    this.parts.push(buf);
    this._size += 4;
  }

  writeUint64(v: bigint): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, v, true);
    this.parts.push(buf);
    this._size += 8;
  }

  writeFloat32(v: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, v, true);
    this.parts.push(buf);
    this._size += 4;
  }

  writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeUint64(BigInt(encoded.length));
    this.parts.push(encoded);
    this._size += encoded.length;
  }

  writeBytes(data: Uint8Array): void {
    this.parts.push(data);
    this._size += data.length;
  }

  writePadding(alignment: number): void {
    const remainder = this._size % alignment;
    if (remainder !== 0) {
      const padding = alignment - remainder;
      this.parts.push(new Uint8Array(padding));
      this._size += padding;
    }
  }

  toArrayBuffer(): ArrayBuffer {
    const result = new Uint8Array(this._size);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result.buffer;
  }
}

// ---------------------------------------------------------------------------
// GGUF tensor descriptor
// ---------------------------------------------------------------------------

export interface SyntheticTensor {
  name: string;
  type: GGMLType;
  dims: number[];
  /** Raw data bytes; if not provided, generated from values */
  data?: Uint8Array;
  /** fp32 values (for F32 type) */
  values?: Float32Array;
}

export interface SyntheticGGUFOptions {
  metadata?: Map<string, { type: GGUFValueType; value: string | number }>;
  tensors: SyntheticTensor[];
}

// ---------------------------------------------------------------------------
// Generate Q8_0 encoded data from fp32 values
// ---------------------------------------------------------------------------

export function encodeQ8_0(values: Float32Array): Uint8Array {
  const nBlocks = Math.ceil(values.length / 32);
  const result = new Uint8Array(nBlocks * 34);
  const view = new DataView(result.buffer);

  for (let block = 0; block < nBlocks; block++) {
    const blockStart = block * 32;
    const blockEnd = Math.min(blockStart + 32, values.length);

    // Find absmax for this block
    let absmax = 0;
    for (let i = blockStart; i < blockEnd; i++) {
      const abs = Math.abs(values[i]);
      if (abs > absmax) absmax = abs;
    }

    // Scale: delta = absmax / 127
    const delta = absmax / 127;
    const invDelta = delta > 0 ? 1 / delta : 0;

    // Write fp16 delta
    const fp16Delta = fp32ToFp16(delta);
    view.setUint16(block * 34, fp16Delta, true);

    // Write quantized int8 values
    for (let i = 0; i < 32; i++) {
      const idx = blockStart + i;
      if (idx < values.length) {
        const quantized = Math.round(values[idx] * invDelta);
        const clamped = Math.max(-128, Math.min(127, quantized));
        view.setInt8(block * 34 + 2 + i, clamped);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Generate F32 raw data
// ---------------------------------------------------------------------------

export function encodeF32(values: Float32Array): Uint8Array {
  return new Uint8Array(values.buffer.slice(0));
}

// ---------------------------------------------------------------------------
// Generate F16 raw data
// ---------------------------------------------------------------------------

export function encodeF16(values: Float32Array): Uint8Array {
  const result = new Uint8Array(values.length * 2);
  const view = new DataView(result.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint16(i * 2, fp32ToFp16(values[i]), true);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Build synthetic GGUF file
// ---------------------------------------------------------------------------

/**
 * Create a minimal valid GGUF v3 file with the given tensors.
 * This is used for testing the parse/convert pipeline.
 */
export function buildSyntheticGGUF(options: SyntheticGGUFOptions): ArrayBuffer {
  const { metadata, tensors } = options;

  // Encode tensor data
  const encodedData: Uint8Array[] = [];
  for (const t of tensors) {
    if (t.data) {
      encodedData.push(t.data);
    } else if (t.values) {
      switch (t.type) {
        case GGMLType.F32:
          encodedData.push(encodeF32(t.values));
          break;
        case GGMLType.F16:
          encodedData.push(encodeF16(t.values));
          break;
        case GGMLType.Q8_0:
          encodedData.push(encodeQ8_0(t.values));
          break;
        default:
          throw new Error(`Cannot auto-encode type ${t.type} from values`);
      }
    } else {
      throw new Error(`Tensor ${t.name}: either data or values must be provided`);
    }
  }

  // Compute tensor data offsets (relative to data section start)
  const dataOffsets: number[] = [];
  let dataPos = 0;
  for (const data of encodedData) {
    dataOffsets.push(dataPos);
    dataPos += data.length;
    const rem = dataPos % ALIGNMENT;
    if (rem !== 0) dataPos += ALIGNMENT - rem;
  }

  // Build header
  const builder = new BufferBuilder();

  // Magic + version
  builder.writeUint32(GGUF_MAGIC);
  builder.writeUint32(GGUF_VERSION);

  // Tensor count
  builder.writeUint64(BigInt(tensors.length));

  // Metadata count
  const metaCount = metadata ? metadata.size : 0;
  builder.writeUint64(BigInt(metaCount));

  // Metadata entries
  if (metadata) {
    for (const [key, { type, value }] of metadata) {
      builder.writeString(key);
      builder.writeUint32(type);
      if (type === GGUFValueType.STRING) {
        builder.writeString(value as string);
      } else if (type === GGUFValueType.UINT32) {
        builder.writeUint32(value as number);
      } else if (type === GGUFValueType.FLOAT32) {
        builder.writeFloat32(value as number);
      }
    }
  }

  // Tensor info
  for (let i = 0; i < tensors.length; i++) {
    const t = tensors[i];
    builder.writeString(t.name);
    builder.writeUint32(t.dims.length); // n_dims
    for (const dim of t.dims) {
      builder.writeUint64(BigInt(dim));
    }
    builder.writeUint32(t.type);
    builder.writeUint64(BigInt(dataOffsets[i]));
  }

  // Pad header to alignment
  builder.writePadding(ALIGNMENT);

  // Tensor data
  for (let i = 0; i < encodedData.length; i++) {
    builder.writeBytes(encodedData[i]);
    builder.writePadding(ALIGNMENT);
  }

  return builder.toArrayBuffer();
}

// ---------------------------------------------------------------------------
// Convenience: create a simple model-like GGUF with weight + norm tensors
// ---------------------------------------------------------------------------

/**
 * Create a toy GGUF that mimics a small transformer:
 * - token_embd.weight (F32, passthrough)
 * - model.layers.0.self_attn.q_proj.weight (Q8_0 or F32, to be converted)
 * - model.layers.0.input_layernorm.weight (F32, passthrough)
 */
export function buildToyModelGGUF(opts?: {
  weightType?: GGMLType;
  outFeatures?: number;
  inFeatures?: number;
}): { buffer: ArrayBuffer; expectedWeights: Float32Array } {
  const weightType = opts?.weightType ?? GGMLType.F32;
  const outFeatures = opts?.outFeatures ?? 8;
  const inFeatures = opts?.inFeatures ?? 16;

  // Generate deterministic weight values
  const weights = new Float32Array(outFeatures * inFeatures);
  for (let i = 0; i < weights.length; i++) {
    // Interesting pattern: alternating positive/negative with varying magnitude
    const row = Math.floor(i / inFeatures);
    const col = i % inFeatures;
    weights[i] = ((row * 7 + col * 3) % 17 - 8) * 0.1;
  }

  // Embedding (small, passthrough)
  const embdValues = new Float32Array(4 * 8); // vocab=4, dim=8
  for (let i = 0; i < embdValues.length; i++) {
    embdValues[i] = (i % 7 - 3) * 0.05;
  }

  // Norm (passthrough)
  const normValues = new Float32Array(inFeatures);
  for (let i = 0; i < normValues.length; i++) {
    normValues[i] = 1.0 + i * 0.01;
  }

  const tensors: SyntheticTensor[] = [
    {
      name: 'token_embd.weight',
      type: GGMLType.F32,
      dims: [8, 4], // [dim, vocab]
      values: embdValues,
    },
    {
      name: 'model.layers.0.self_attn.q_proj.weight',
      type: weightType,
      dims: [inFeatures, outFeatures], // GGUF: [in, out]
      values: weights,
    },
    {
      name: 'model.layers.0.input_layernorm.weight',
      type: GGMLType.F32,
      dims: [inFeatures],
      values: normValues,
    },
  ];

  const metadata = new Map<string, { type: GGUFValueType; value: string | number }>([
    ['general.architecture', { type: GGUFValueType.STRING, value: 'llama' }],
    ['general.name', { type: GGUFValueType.STRING, value: 'toy-model' }],
  ]);

  return {
    buffer: buildSyntheticGGUF({ metadata, tensors }),
    expectedWeights: weights,
  };
}
