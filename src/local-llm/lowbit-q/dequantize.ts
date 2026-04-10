/**
 * Dequantization routines for GGUF quantized tensor data.
 *
 * Converts quantized block formats back to fp32 for lowbit-Q decomposition.
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

    // ggml Q4_0 layout: byte j → low nibble = element j, high nibble = element j+16.
    const elemsInBlock = Math.min(32, totalElements - block * 32);
    for (let j = 0; j < 16; j++) {
      const byte = data[blockOffset + 2 + j];
      // low nibble → element j (first half)
      if (j < elemsInBlock) {
        result[block * 32 + j] = delta * ((byte & 0x0F) - 8);
      }
      // high nibble → element j+16 (second half)
      if (j + 16 < elemsInBlock) {
        result[block * 32 + j + 16] = delta * ((byte >> 4) - 8);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Q3_K dequantization
// ---------------------------------------------------------------------------

/**
 * Q3_K block structure (110 bytes, 256 elements) — ggml block_q3_K:
 *   - hmask[32]:   high bit of each qi: element e → bit floor(e/32) of hmask[e%32]
 *   - qs[64]:      low 2 bits: element e → bits floor((e%128)/32)*2 of qs[floor(e/128)*32 + e%32]
 *   - scales[12]:  16 sub-block 6-bit stored scales (offset-coded; stored=0 → max sub-block)
 *       j < 8:  low  nibble of S[j]
 *       j >= 8: high nibble of S[j-8]
 *       S[j%4+8] |= (l>>4) << (2*(j/4))   high 2 bits
 *   - d: fp16 at byte 108 — super-block scale (NEGATIVE: d = -maxSubScale/32)
 *
 * Dequantization (direct port of ggml dequantize_row_q3_K):
 *   dl = d * (stored_j - 32)   (= sub_scale_j)
 *   x ≈ dl * (low2 - (hm_bit ? 0 : 4))   where this equals dl * (qi - 4)
 */
export function dequantQ3_K(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  const BLOCK_BYTES = 110;

  const result = new Float32Array(totalElements);
  const nBlocks = Math.ceil(totalElements / 256);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let b = 0; b < nBlocks; b++) {
    const blockOffset = b * BLOCK_BYTES;
    const hmaskOff = blockOffset;
    const qsOff    = blockOffset + 32;
    const scOff    = blockOffset + 96;
    const dOff     = blockOffset + 108;

    const d_all = fp16ToFp32(view.getUint16(dOff, true));

    // Decode 16 sub-block stored scales (6-bit values, offset-coded by 32)
    const scales = new Uint8Array(16);
    for (let j = 0; j < 16; j++) {
      const low4 = j < 8
        ? (data[scOff + j] & 0xF)
        : ((data[scOff + j - 8] >> 4) & 0xF);
      const high2 = (data[scOff + (j % 4) + 8] >> (2 * Math.floor(j / 4))) & 0x3;
      scales[j] = low4 | (high2 << 4);
    }

    // Direct port of ggml dequantize_row_q3_K inner loop:
    //   n ∈ {0, 128}: 128-element chunks; m tracks hmask bit (1,2,4,...,128)
    let is = 0;
    let m  = 1;

    for (let n = 0; n < 256; n += 128) {
      let shift = 0;
      const qBase = n / 4;  // qs byte base: 0 for n=0, 32 for n=128

      for (let j = 0; j < 4; j++) {
        // First sub-block of this j-group (16 elements)
        const dl0 = d_all * (scales[is++] - 32);
        for (let l = 0; l < 16; l++) {
          const outIdx = b * 256 + n + j * 32 + l;
          if (outIdx >= totalElements) break;
          const low2 = (data[qsOff + qBase + l]      >> shift) & 3;
          const hm   = (data[hmaskOff + l]            & m) ? 0 : 4;
          result[outIdx] = dl0 * (low2 - hm);
        }

        // Second sub-block of this j-group (16 elements)
        const dl1 = d_all * (scales[is++] - 32);
        for (let l = 0; l < 16; l++) {
          const outIdx = b * 256 + n + j * 32 + 16 + l;
          if (outIdx >= totalElements) break;
          const low2 = (data[qsOff + qBase + l + 16] >> shift) & 3;
          const hm   = (data[hmaskOff + l + 16]       & m) ? 0 : 4;
          result[outIdx] = dl1 * (low2 - hm);
        }

        shift += 2;
        m <<= 1;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Q2_K dequantization
// ---------------------------------------------------------------------------

/**
 * Q2_K block structure (84 bytes, 256 elements) — ggml block_q2_K:
 *   - scales[16]: byte 0..15 — per sub-block packed nibbles:
 *       low  nibble = 4-bit scale index
 *       high nibble = 4-bit min   index
 *   - qs[64]:  byte 16..79 — 2-bit values, stride-32 layout (same as Q3_K qs)
 *   - d:    fp16 at byte 80 — super-block scale  (positive)
 *   - dmin: fp16 at byte 82 — super-block dmin   (positive)
 *
 * Dequantization (direct port of ggml dequantize_row_q2_K):
 *   dl = d * (scales[j] & 0xF)    (low  nibble = scale index)
 *   ml = dmin * (scales[j] >> 4)  (high nibble = min   index)
 *   x ≈ dl * qi − ml
 */
export function dequantQ2_K(
  data: Uint8Array,
  totalElements: number,
): Float32Array {
  const BLOCK_BYTES = 84;

  const result = new Float32Array(totalElements);
  const nBlocks = Math.ceil(totalElements / 256);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let b = 0; b < nBlocks; b++) {
    const blockOffset = b * BLOCK_BYTES;
    const scOff   = blockOffset;
    const qsOff   = blockOffset + 16;
    const dOff    = blockOffset + 80;
    const dminOff = blockOffset + 82;

    const d    = fp16ToFp32(view.getUint16(dOff,    true));
    const dmin = fp16ToFp32(view.getUint16(dminOff, true));

    // Direct port of ggml dequantize_row_q2_K inner loop:
    //   is tracks scale byte index (0..15); n ∈ {0, 128}
    let is = 0;

    for (let n = 0; n < 256; n += 128) {
      let shift = 0;
      const qBase = n / 4;  // qs byte base: 0 for n=0, 32 for n=128

      for (let j = 0; j < 4; j++) {
        // First sub-block
        const sc0 = data[scOff + is++];
        const dl0 = d    * (sc0 & 0xF);
        const ml0 = dmin * (sc0 >> 4);
        for (let l = 0; l < 16; l++) {
          const outIdx = b * 256 + n + j * 32 + l;
          if (outIdx >= totalElements) break;
          const qi = (data[qsOff + qBase + l] >> shift) & 3;
          result[outIdx] = dl0 * qi - ml0;
        }

        // Second sub-block
        const sc1 = data[scOff + is++];
        const dl1 = d    * (sc1 & 0xF);
        const ml1 = dmin * (sc1 >> 4);
        for (let l = 0; l < 16; l++) {
          const outIdx = b * 256 + n + j * 32 + 16 + l;
          if (outIdx >= totalElements) break;
          const qi = (data[qsOff + qBase + l + 16] >> shift) & 3;
          result[outIdx] = dl1 * qi - ml1;
        }

        shift += 2;
      }
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
    case GGMLType.Q3_K:
      return dequantQ3_K(data, totalElements);
    case GGMLType.Q2_K:
      return dequantQ2_K(data, totalElements);
    default:
      throw new Error(
        `Dequantization not implemented for ggml type ${type}. ` +
        'Supported source formats: F32, F16, Q8_0, Q4_0, Q3_K, Q2_K',
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
