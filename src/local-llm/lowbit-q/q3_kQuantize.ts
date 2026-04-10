/**
 * Q3_K quantization (K-quant 3-bit, symmetric).
 *
 * Q3_K block structure (110 bytes per block, 256 elements = QK_K):
 *   - hmask[32]: uint8[32] — high bit of each 3-bit value.
 *       Element e: bit floor(e/32) of hmask[e%32].   (stride-32 layout)
 *   - qs[64]:    uint8[64] — low 2 bits of each quantized value.
 *       Element e: bits floor((e%128)/32)*2 of qs[floor(e/128)*32 + e%32].
 *   - scales[12]: uint8[12] — 16 sub-block 6-bit scales packed as follows:
 *       j < 8:  S[j] low  nibble = l_j & 0xF
 *       j >= 8: S[j-8] high nibble = l_j & 0xF
 *       S[j%4 + 8] |= (l_j >> 4) << (2*(j/4))   (high 2 bits)
 *   - d: fp16 (2 bytes) — super-block scale. d = -maxSubScale/32 (NEGATIVE).
 *
 * Quantization formula per element:
 *   sub_scale_j = amax_j / 4   (amax_j = max|x| in sub-block j)
 *   d = -max(sub_scale_j) / 32
 *   stored_j = clamp(round(-32 * sub_scale_j / max_sub_scale) + 32, 0, 63)
 *   qi = clamp(round(x / sub_scale_j) + 4, 0, 7)   (3-bit, offset-coded)
 *
 * Dequantization:
 *   dl = d * (stored_j - 32)   (= sub_scale_j)
 *   x ≈ dl * (qi − 4)
 *
 * This matches ggml's block_q3_K and quantize_row_q3_K_ref exactly.
 * Tensors written with this function are natively loadable by llama.cpp / ggml.
 */

import { fp32ToFp16 } from './dequantize';

/** Elements per Q3_K super-block */
const SUPER_BLOCK = 256;
/** Number of sub-blocks per super-block */
const N_SUB = 16;
/** Elements per sub-block */
const SUB_BLOCK = 16;
/** Bytes per Q3_K block: 32 + 64 + 12 + 2 */
export const Q3_K_BYTES_PER_BLOCK = 110;

/**
 * Compute the output byte size for Q3_K-quantized data with the given element count.
 */
export function q3_kSizeBytes(elements: number): number {
  return Math.ceil(elements / SUPER_BLOCK) * Q3_K_BYTES_PER_BLOCK;
}

/**
 * Quantize a flat fp32 weight array to Q3_K format (ggml-compatible).
 *
 * The output is a Uint8Array in ggml block_q3_K binary layout.
 * The last super-block is zero-padded if elements is not a multiple of 256.
 */
export function quantizeQ3_K(weights: Float32Array): Uint8Array {
  const elements = weights.length;
  const nBlocks = Math.ceil(elements / SUPER_BLOCK);
  const out = new Uint8Array(nBlocks * Q3_K_BYTES_PER_BLOCK);
  const view = new DataView(out.buffer);

  // Temporary array for quantized 3-bit values [0..7] per block
  const L = new Uint8Array(SUPER_BLOCK);

  for (let b = 0; b < nBlocks; b++) {
    const blockBase = b * SUPER_BLOCK;
    const blockOffset = b * Q3_K_BYTES_PER_BLOCK;

    // ggml block_q3_K layout:
    //   hmask[0..31]   at offset 0
    //   qs[0..63]      at offset 32
    //   scales[0..11]  at offset 96
    //   d (fp16)       at offset 108
    const hmaskOff = blockOffset;
    const qsOff    = blockOffset + 32;
    const scOff    = blockOffset + 96;
    const dOff     = blockOffset + 108;

    // --- Pass 1: compute sub-block scales ---
    const subScales = new Float32Array(N_SUB);
    let maxScale = 0;
    for (let s = 0; s < N_SUB; s++) {
      let amax = 0;
      for (let i = 0; i < SUB_BLOCK; i++) {
        const e = blockBase + s * SUB_BLOCK + i;
        const v = e < elements ? Math.abs(weights[e]) : 0;
        if (v > amax) amax = v;
      }
      subScales[s] = amax > 0 ? amax / 4.0 : 0;
      if (subScales[s] > maxScale) maxScale = subScales[s];
    }

    // --- Super-block d (negative, matches ggml: d = -maxScale/32) ---
    const d = maxScale > 0 ? -maxScale / 32.0 : 0;
    view.setUint16(dOff, fp32ToFp16(d), true);

    // iscale = 1/d = -32/maxScale (negative)
    const iscale = maxScale > 0 ? -32.0 / maxScale : 0;

    // --- Pass 2: pack scales and quantize elements into L[] ---
    for (let s = 0; s < N_SUB; s++) {
      const subBase = blockBase + s * SUB_BLOCK;
      const invSubScale = subScales[s] > 0 ? 1.0 / subScales[s] : 0;

      // stored ∈ [0..32]: round(iscale * sub_scale) + 32
      // stored=0 → max sub-block; stored=32 → zero sub-block
      let sc = maxScale > 0
        ? Math.max(0, Math.min(63, Math.round(iscale * subScales[s]) + 32))
        : 32;

      // Pack 6-bit sc into scales[12] (ggml bit layout):
      //   j < 8:  S[j]   low  nibble = sc & 0xF
      //   j >= 8: S[j-8] high nibble = sc & 0xF
      //   S[j%4 + 8] |= (sc >> 4) << (2*(j/4))
      if (s < 8) {
        out[scOff + s] = sc & 0xF;
      } else {
        out[scOff + s - 8] |= (sc & 0xF) << 4;
      }
      out[scOff + (s % 4) + 8] |= ((sc >> 4) & 0x3) << (2 * Math.floor(s / 4));

      // Quantize elements in this sub-block into L[]
      for (let i = 0; i < SUB_BLOCK; i++) {
        const e = subBase + i;
        const elemIdx = s * SUB_BLOCK + i;
        const x = e < elements ? weights[e] : 0;
        let qi = Math.round(x * invSubScale) + 4;
        qi = Math.max(0, Math.min(7, qi));
        L[elemIdx] = qi;
      }
    }

    // --- Pass 3: pack L[] into hmask[] and qs[] (ggml stride-32 layout) ---
    //
    // hmask: element e → hmask[e%32], bit floor(e/32)
    //   (same bit across all 32 bytes, cycling through bits 0..7)
    //
    // qs: element e → qs[floor(e/128)*32 + e%32], shift floor((e%128)/32)*2
    //   (4 elements share one byte via 2-bit shift groups within 128-element chunks)
    for (let e = 0; e < SUPER_BLOCK; e++) {
      const qi = L[e];

      // hmask: high bit (bit 2) of qi
      if (qi >= 4) {
        out[hmaskOff + (e % 32)] |= 1 << Math.floor(e / 32);
      }

      // qs: low 2 bits of qi
      const qsByte  = Math.floor(e / 128) * 32 + (e % 32);
      const qsShift = Math.floor((e % 128) / 32) * 2;
      out[qsOff + qsByte] |= (qi & 0x3) << qsShift;
    }
  }

  return out;
}
