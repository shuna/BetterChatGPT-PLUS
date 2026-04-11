/**
 * Q2_K quantization (K-quant 2-bit, asymmetric).
 *
 * Q2_K block structure (84 bytes per block, 256 elements = QK_K):
 *   - scales[16]: uint8[16] — per sub-block packed nibbles:
 *       low  nibble = 4-bit scale index  (range [0, 15])
 *       high nibble = 4-bit min   index  (range [0, 15])
 *   - qs[64]: uint8[64] — 2-bit quantized values, stride-32 layout.
 *       Element e: bits floor((e%128)/32)*2 of qs[floor(e/128)*32 + e%32].
 *   - d:    fp16 (2 bytes) — super-block scale  (positive)
 *   - dmin: fp16 (2 bytes) — super-block dmin   (positive)
 *
 * Quantization (asymmetric, range [0, 3]):
 *   min_j  = min(x) in sub-block j   (≤ 0 for typical weight distributions)
 *   range_j = max(x) − min(x)
 *   sub_scale_j = range_j / 3
 *   d    = max(sub_scale_j) / 15
 *   dmin = max(−min_j)       / 15
 *   scale_idx_j = round(sub_scale_j / d),   range [0, 15]
 *   min_idx_j   = round(−min_j       / dmin), range [0, 15]
 *   scales[j] = scale_idx_j | (min_idx_j << 4)
 *   qi = clamp(round((x − min_j) / sub_scale_j), 0, 3)
 *
 * Dequantization:
 *   dl = d * (scales[j] & 0xF)    (low nibble = scale index)
 *   ml = dmin * (scales[j] >> 4)  (high nibble = min index)
 *   x ≈ dl * qi − ml
 *
 * This matches ggml's block_q2_K and quantize_row_q2_K_ref exactly.
 * Tensors written with this function are natively loadable by llama.cpp / ggml.
 */

import { fp32ToFp16 } from './dequantize';

/** Elements per Q2_K super-block */
const SUPER_BLOCK = 256;
/** Number of sub-blocks per super-block */
const N_SUB = 16;
/** Elements per sub-block */
const SUB_BLOCK = 16;
/** Bytes per Q2_K block: 16 + 64 + 2 + 2 */
export const Q2_K_BYTES_PER_BLOCK = 84;

/**
 * Compute the output byte size for Q2_K-quantized data with the given element count.
 */
export function q2_kSizeBytes(elements: number): number {
  return Math.ceil(elements / SUPER_BLOCK) * Q2_K_BYTES_PER_BLOCK;
}

/**
 * Quantize a flat fp32 weight array to Q2_K format (ggml-compatible).
 *
 * The output is a Uint8Array in ggml block_q2_K binary layout.
 * The last super-block is zero-padded if elements is not a multiple of 256.
 */
export function quantizeQ2_K(weights: Float32Array): Uint8Array {
  const elements = weights.length;
  const nBlocks = Math.ceil(elements / SUPER_BLOCK);
  const out = new Uint8Array(nBlocks * Q2_K_BYTES_PER_BLOCK);
  const view = new DataView(out.buffer);

  // Temporary array for quantized 2-bit values [0..3] per block
  const L = new Uint8Array(SUPER_BLOCK);

  for (let b = 0; b < nBlocks; b++) {
    const blockBase = b * SUPER_BLOCK;
    const blockOffset = b * Q2_K_BYTES_PER_BLOCK;

    // ggml block_q2_K layout:
    //   scales[0..15]  at offset 0
    //   qs[0..63]      at offset 16
    //   d    (fp16)    at offset 80
    //   dmin (fp16)    at offset 82
    const scOff   = blockOffset;
    const qsOff   = blockOffset + 16;
    const dOff    = blockOffset + 80;
    const dminOff = blockOffset + 82;

    // --- Pass 1: compute sub-block min/scale ---
    const subScales = new Float32Array(N_SUB);
    const subMins   = new Float32Array(N_SUB);   // stored as positive: absMin = -min_j
    let maxSubScale = 0;
    let maxAbsMin   = 0;

    for (let s = 0; s < N_SUB; s++) {
      const subBase = blockBase + s * SUB_BLOCK;
      let minVal = 0;
      let maxVal = 0;
      for (let i = 0; i < SUB_BLOCK; i++) {
        const x = (subBase + i) < elements ? weights[subBase + i] : 0;
        if (x < minVal) minVal = x;
        if (x > maxVal) maxVal = x;
      }
      const range = maxVal - minVal;
      subScales[s] = range > 0 ? range / 3.0 : 0;
      subMins[s]   = -minVal;  // absMin (≥ 0)
      if (subScales[s] > maxSubScale) maxSubScale = subScales[s];
      if (subMins[s]   > maxAbsMin)   maxAbsMin   = subMins[s];
    }

    // --- Super-block scales d and dmin (positive) ---
    const d    = maxSubScale > 0 ? maxSubScale / 15.0 : 0;
    const dmin = maxAbsMin   > 0 ? maxAbsMin   / 15.0 : 0;
    view.setUint16(dOff,    fp32ToFp16(d),    true);
    view.setUint16(dminOff, fp32ToFp16(dmin), true);

    // --- Pass 2: pack scale/min indices into scales[16] and quantize into L[] ---
    for (let s = 0; s < N_SUB; s++) {
      const scIdx = d    > 0 ? Math.max(0, Math.min(15, Math.round(subScales[s] / d)))    : 0;
      const mnIdx = dmin > 0 ? Math.max(0, Math.min(15, Math.round(subMins[s]   / dmin))) : 0;
      // ggml layout: low nibble = scale_idx, high nibble = min_idx
      out[scOff + s] = scIdx | (mnIdx << 4);

      const subBase = blockBase + s * SUB_BLOCK;
      const minVal  = -subMins[s];
      const invScale = subScales[s] > 0 ? 1.0 / subScales[s] : 0;

      for (let i = 0; i < SUB_BLOCK; i++) {
        const e = subBase + i;
        const elemIdx = s * SUB_BLOCK + i;
        const x = e < elements ? weights[e] : 0;
        let qi = Math.round((x - minVal) * invScale);
        qi = Math.max(0, Math.min(3, qi));
        L[elemIdx] = qi;
      }
    }

    // --- Pass 3: pack L[] into qs[] (ggml stride-32 layout, same as Q3_K qs) ---
    //
    // Element e → qs[floor(e/128)*32 + e%32], shift floor((e%128)/32)*2
    //
    // Equivalently (direct port of ggml's loop):
    //   for j in {0, 128}:
    //     for l in 0..31:
    //       qs[j/4 + l] = L[j+l] | L[j+l+32]<<2 | L[j+l+64]<<4 | L[j+l+96]<<6
    for (let n = 0; n < SUPER_BLOCK; n += 128) {
      for (let l = 0; l < 32; l++) {
        out[qsOff + n / 4 + l] =
          (L[n + l]       & 3)        |
          ((L[n + l + 32]  & 3) << 2) |
          ((L[n + l + 64]  & 3) << 4) |
          ((L[n + l + 96]  & 3) << 6);
      }
    }
  }

  return out;
}
