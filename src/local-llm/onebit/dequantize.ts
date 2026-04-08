/**
 * Dequantization routines for GGUF quantized tensor data.
 *
 * Converts quantized block formats back to fp32 for onebit decomposition.
 * Only the formats needed for the conversion pipeline are implemented.
 */

import { GGMLType } from './types';

// ---------------------------------------------------------------------------
// Q8_0 dequantization
// ---------------------------------------------------------------------------

/**
 * Q8_0 block structure (34 bytes, 32 elements):
 *   - delta: fp16 (2 bytes) — scale factor
 *   - qs[32]: int8 (32 bytes) — quantized values
 *
 * Dequantization: value[i] = delta * qs[i]
 */
export function dequantQ8_0(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  const result = new Float32Array(totalElements);
  const nBlocks = Math.ceil(totalElements / 32);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let block = 0; block < nBlocks; block++) {
    const blockOffset = block * 34;
    // Read fp16 scale as uint16, convert to float
    const deltaFp16 = view.getUint16(blockOffset, true);
    const delta = fp16ToFp32(deltaFp16);

    const elemsInBlock = Math.min(32, totalElements - block * 32);
    for (let i = 0; i < elemsInBlock; i++) {
      const qs = view.getInt8(blockOffset + 2 + i);
      result[block * 32 + i] = delta * qs;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// F16 dequantization
// ---------------------------------------------------------------------------

/**
 * F16 (IEEE 754 half precision) to fp32.
 */
export function dequantF16(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  const result = new Float32Array(totalElements);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i < totalElements; i++) {
    const fp16 = view.getUint16(i * 2, true);
    result[i] = fp16ToFp32(fp16);
  }

  return result;
}

// ---------------------------------------------------------------------------
// F32 passthrough
// ---------------------------------------------------------------------------

/**
 * F32 — just reinterpret bytes as Float32Array.
 */
export function dequantF32(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  // Ensure proper alignment by copying if needed
  if (data.byteOffset % 4 !== 0) {
    const aligned = new Uint8Array(totalElements * 4);
    aligned.set(data.subarray(0, totalElements * 4));
    return new Float32Array(aligned.buffer, 0, totalElements);
  }
  return new Float32Array(data.buffer, data.byteOffset, totalElements);
}

// ---------------------------------------------------------------------------
// Q4_0 dequantization
// ---------------------------------------------------------------------------

/**
 * Q4_0 block structure (18 bytes, 32 elements):
 *   - delta: fp16 (2 bytes) — scale factor
 *   - qs[16]: uint8 (16 bytes) — packed 4-bit quantized values
 *
 * Each byte contains two 4-bit values: low nibble first, then high nibble.
 * Values are unsigned [0, 15], centered at 8: value[i] = delta * (qs[i] - 8)
 */
export function dequantQ4_0(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  const result = new Float32Array(totalElements);
  const nBlocks = Math.ceil(totalElements / 32);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let block = 0; block < nBlocks; block++) {
    const blockOffset = block * 18;
    const deltaFp16 = view.getUint16(blockOffset, true);
    const delta = fp16ToFp32(deltaFp16);

    const elemsInBlock = Math.min(32, totalElements - block * 32);
    for (let i = 0; i < elemsInBlock; i++) {
      const byteIdx = Math.floor(i / 2);
      const byte = data[blockOffset + 2 + byteIdx];
      const nibble = (i % 2 === 0) ? (byte & 0x0F) : ((byte >> 4) & 0x0F);
      result[block * 32 + i] = delta * (nibble - 8);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Dequantize tensor data from any supported format to fp32.
 */
export function dequantize(
  data: Uint8Array,
  type: GGMLType,
  totalElements: number,
): Float32Array {
  switch (type) {
    case GGMLType.F32:
      return dequantF32(data, totalElements);
    case GGMLType.F16:
      return dequantF16(data, totalElements);
    case GGMLType.Q8_0:
      return dequantQ8_0(data, totalElements);
    case GGMLType.Q4_0:
      return dequantQ4_0(data, totalElements);
    default:
      throw new Error(
        `Dequantization not implemented for ggml type ${type}. ` +
        'Supported source formats: F32, F16, Q8_0, Q4_0',
      );
  }
}

// ---------------------------------------------------------------------------
// FP16 ↔ FP32 conversion
// ---------------------------------------------------------------------------

// Shared buffer for fp16 conversion
const fp16ConvBuf = new ArrayBuffer(4);
const fp16ConvU32 = new Uint32Array(fp16ConvBuf);
const fp16ConvF32 = new Float32Array(fp16ConvBuf);

/**
 * Convert IEEE 754 half-precision (fp16) to single-precision (fp32).
 */
export function fp16ToFp32(h: number): number {
  const sign = (h >> 15) & 0x1;
  const exponent = (h >> 10) & 0x1F;
  const mantissa = h & 0x3FF;

  if (exponent === 0) {
    if (mantissa === 0) {
      // Zero
      fp16ConvU32[0] = sign << 31;
    } else {
      // Subnormal: normalize
      let e = -1;
      let m = mantissa;
      do {
        e++;
        m <<= 1;
      } while ((m & 0x400) === 0);
      fp16ConvU32[0] = (sign << 31) | ((127 - 15 - e) << 23) | ((m & 0x3FF) << 13);
    }
  } else if (exponent === 31) {
    // Inf or NaN
    fp16ConvU32[0] = (sign << 31) | (0xFF << 23) | (mantissa << 13);
  } else {
    // Normal
    fp16ConvU32[0] = (sign << 31) | ((exponent - 15 + 127) << 23) | (mantissa << 13);
  }

  return fp16ConvF32[0];
}

/**
 * Convert single-precision (fp32) to half-precision (fp16).
 */
export function fp32ToFp16(f: number): number {
  fp16ConvF32[0] = f;
  const bits = fp16ConvU32[0];

  const sign = (bits >> 31) & 0x1;
  const exponent = (bits >> 23) & 0xFF;
  const mantissa = bits & 0x7FFFFF;

  if (exponent === 0) {
    // Zero or subnormal → fp16 zero
    return sign << 15;
  } else if (exponent === 0xFF) {
    // Inf or NaN
    if (mantissa === 0) {
      return (sign << 15) | (0x1F << 10); // Inf
    }
    return (sign << 15) | (0x1F << 10) | (mantissa >> 13); // NaN
  }

  const newExp = exponent - 127 + 15;

  if (newExp >= 31) {
    // Overflow → Inf
    return (sign << 15) | (0x1F << 10);
  } else if (newExp <= 0) {
    // Underflow → zero (could do subnormals but not needed for our use)
    return sign << 15;
  }

  return (sign << 15) | (newExp << 10) | (mantissa >> 13);
}
