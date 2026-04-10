/**
 * Q4_0 quantization (Round-to-Nearest, symmetric).
 *
 * Q4_0 block structure (18 bytes per block, 32 elements):
 *   - delta: fp16 (2 bytes) — scale = max(abs(block)) / 7
 *   - qs[16]: uint8 (16 bytes) — packed 4-bit values, low nibble first
 *
 * Quantization:  qi = clamp(round(x / delta) + 8, 0, 15)
 * Dequantization: x ≈ (qi - 8) * delta
 *
 * This matches ggml's Q4_0 format exactly, so quantized tensors written with
 * this function are natively loadable by llama.cpp / ggml without any custom
 * kernel code.
 */

import { fp32ToFp16 } from './dequantize';

const BLOCK_SIZE = 32;
/** Bytes per Q4_0 block: 2 (fp16 scale) + 16 (packed nibbles) */
export const Q4_0_BYTES_PER_BLOCK = 18;

/**
 * Compute the output byte size for Q4_0-quantized data with the given element count.
 */
export function q4_0SizeBytes(elements: number): number {
  return Math.ceil(elements / BLOCK_SIZE) * Q4_0_BYTES_PER_BLOCK;
}

/**
 * Quantize a flat fp32 weight array to Q4_0 format.
 *
 * The input is treated as a flat array of `elements` values.
 * The output is a Uint8Array in ggml Q4_0 binary layout.
 */
export function quantizeQ4_0(weights: Float32Array): Uint8Array {
  const elements = weights.length;
  const nBlocks = Math.ceil(elements / BLOCK_SIZE);
  const out = new Uint8Array(nBlocks * Q4_0_BYTES_PER_BLOCK);
  const view = new DataView(out.buffer);

  for (let b = 0; b < nBlocks; b++) {
    const blockStart = b * BLOCK_SIZE;
    const blockEnd = Math.min(blockStart + BLOCK_SIZE, elements);
    const blockOffset = b * Q4_0_BYTES_PER_BLOCK;

    // Find max absolute value in block → scale
    let amax = 0;
    for (let i = blockStart; i < blockEnd; i++) {
      const av = Math.abs(weights[i]);
      if (av > amax) amax = av;
    }

    const delta = amax / 7.0;
    const invDelta = delta > 0 ? 1.0 / delta : 0;

    // Write fp16 scale
    view.setUint16(blockOffset, fp32ToFp16(delta), true);

    // Pack 32 quantized values into 16 bytes.
    // ggml Q4_0 layout: byte j → low nibble = element j, high nibble = element j+16.
    // (first half of block in low nibbles, second half in high nibbles)
    for (let j = 0; j < 16; j++) {
      const idx0 = blockStart + j;       // first-half element
      const idx1 = blockStart + j + 16;  // second-half element

      let q0 = 8; // default for padding (maps to 0 after dequant)
      if (idx0 < blockEnd) {
        const qi = Math.round(weights[idx0] * invDelta) + 8;
        q0 = Math.max(0, Math.min(15, qi));
      }

      let q1 = 8; // default for padding
      if (idx1 < blockEnd) {
        const qi = Math.round(weights[idx1] * invDelta) + 8;
        q1 = Math.max(0, Math.min(15, qi));
      }

      out[blockOffset + 2 + j] = q0 | (q1 << 4);
    }
  }

  return out;
}
