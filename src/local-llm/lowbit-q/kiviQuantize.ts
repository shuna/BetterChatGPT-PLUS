/**
 * KIVI-style per-token asymmetric 2-bit quantization PoC.
 *
 * KIVI (ICML 2024) — "KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache"
 * arXiv: 2402.02750
 *
 * Phase 4 scope: TypeScript proof-of-concept for quality comparison only.
 *   - Applies to attn_v / Value tensors (per-token = per-row quantization)
 *   - Applies to attn_k / Key tensors (per-channel = per-column quantization)
 * Phase 5 scope: C++ attention kernel integration.
 *
 * Why this is the chosen PoC target:
 *   - Training-free, PTQ-only
 *   - Simpler than TurboQuant (no PolarQuant / rotation kernel needed)
 *   - Targets attn_v which is the highest-risk SVID zone (Phase 3.5 evidence)
 *   - Per-token/per-channel scale means better fidelity than Q2_K's per-super-block
 *
 * Storage format (TypeScript comparison only, not GGUF-embedded in Phase 4):
 *
 *   Per-token (per-row) 2-bit, for attn_v:
 *     For each row of N elements:
 *       - 2 bytes: scale (fp16)
 *       - 2 bytes: zero_point (fp16)
 *       - ceil(N / 4) bytes: packed 2-bit values (4 per byte, MSB-first)
 *     Total per row: 4 + ceil(N/4) bytes
 *
 *   Per-channel (per-column) 2-bit, for attn_k:
 *     Transposed then quantized per-row, same format.
 */

// ---------------------------------------------------------------------------
// Core 2-bit quantization helpers
// ---------------------------------------------------------------------------

/**
 * Quantize a single row of FP32 values to asymmetric 2-bit.
 *
 * @param row Input FP32 values
 * @returns Packed result: {scale, zeroPoint, packed}
 */
export function quantizeRow2bit(row: Float32Array): {
  scale: number;
  zeroPoint: number;
  packed: Uint8Array;
} {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < row.length; i++) {
    if (row[i] < min) min = row[i];
    if (row[i] > max) max = row[i];
  }

  // Handle degenerate case (all-zero or all-same)
  if (max === min) {
    const packed = new Uint8Array(Math.ceil(row.length / 4));
    return { scale: 0, zeroPoint: min, packed };
  }

  const scale = (max - min) / 3; // 2-bit: 4 levels (0, 1, 2, 3)
  const zeroPoint = min;

  const packed = new Uint8Array(Math.ceil(row.length / 4));
  for (let i = 0; i < row.length; i++) {
    const q = Math.min(3, Math.max(0, Math.round((row[i] - zeroPoint) / scale)));
    // Pack 4 values per byte, MSB-first within each byte
    const byteIdx = Math.floor(i / 4);
    const shift = (3 - (i % 4)) * 2;
    packed[byteIdx] |= (q & 0x3) << shift;
  }

  return { scale, zeroPoint, packed };
}

/**
 * Dequantize a packed 2-bit row back to FP32.
 */
export function dequantizeRow2bit(
  packed: Uint8Array,
  scale: number,
  zeroPoint: number,
  length: number,
): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const byteIdx = Math.floor(i / 4);
    const shift = (3 - (i % 4)) * 2;
    const q = (packed[byteIdx] >> shift) & 0x3;
    out[i] = scale * q + zeroPoint;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tensor-level quantization
// ---------------------------------------------------------------------------

/** Packed 2-bit quantization result for a 2D weight matrix */
export interface Kivi2BitResult {
  /** Number of rows */
  rows: number;
  /** Number of columns */
  cols: number;
  /** Per-row scale values (fp32, rows entries) */
  scales: Float32Array;
  /** Per-row zero_point values (fp32, rows entries) */
  zeroPoints: Float32Array;
  /** Packed 2-bit data for all rows (rows × ceil(cols/4) bytes) */
  packedData: Uint8Array;
  /** Total bytes used (scales + zeroPoints + packedData), excludes overhead */
  totalBytes: number;
}

/**
 * Apply KIVI-style per-row (per-token) 2-bit quantization to a 2D matrix.
 *
 * Each row is quantized independently with its own scale and zero_point.
 * This is the V-cache style from the KIVI paper.
 *
 * @param matrix Row-major float32 matrix, shape [rows, cols]
 * @param rows Number of rows
 * @param cols Number of columns
 */
export function kiviQuantizePerToken(
  matrix: Float32Array,
  rows: number,
  cols: number,
): Kivi2BitResult {
  const scales = new Float32Array(rows);
  const zeroPoints = new Float32Array(rows);
  const bytesPerRow = Math.ceil(cols / 4);
  const packedData = new Uint8Array(rows * bytesPerRow);

  for (let r = 0; r < rows; r++) {
    const row = matrix.subarray(r * cols, (r + 1) * cols);
    const { scale, zeroPoint, packed } = quantizeRow2bit(row);
    scales[r] = scale;
    zeroPoints[r] = zeroPoint;
    packedData.set(packed, r * bytesPerRow);
  }

  // Bytes: scales (fp16) + zeroPoints (fp16) + packed 2-bit
  const totalBytes = rows * 2 + rows * 2 + packedData.length;

  return { rows, cols, scales, zeroPoints, packedData, totalBytes };
}

/**
 * Apply KIVI-style per-column (per-channel) 2-bit quantization.
 *
 * Each column is quantized independently.
 * This is the K-cache style from the KIVI paper.
 *
 * @param matrix Row-major float32 matrix, shape [rows, cols]
 * @param rows Number of rows
 * @param cols Number of columns
 */
export function kiviQuantizePerChannel(
  matrix: Float32Array,
  rows: number,
  cols: number,
): Kivi2BitResult {
  // Transpose then quantize per-row, then transpose back in decode
  const transposed = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      transposed[c * rows + r] = matrix[r * cols + c];
    }
  }
  // Quantize: each "row" of the transposed matrix = one channel of the original
  const result = kiviQuantizePerToken(transposed, cols, rows);
  // Return with original shape metadata (rows/cols swapped back for caller)
  return { ...result, rows, cols };
}

/**
 * Dequantize a KIVI per-token result back to FP32.
 */
export function kiviDequantizePerToken(result: Kivi2BitResult): Float32Array {
  const { rows, cols, scales, zeroPoints, packedData } = result;
  const bytesPerRow = Math.ceil(cols / 4);
  const out = new Float32Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    const packed = packedData.subarray(r * bytesPerRow, (r + 1) * bytesPerRow);
    const row = dequantizeRow2bit(packed, scales[r], zeroPoints[r], cols);
    out.set(row, r * cols);
  }
  return out;
}

/**
 * Dequantize a KIVI per-channel result back to FP32.
 */
export function kiviDequantizePerChannel(result: Kivi2BitResult): Float32Array {
  const { rows, cols, scales, zeroPoints, packedData } = result;
  // result stores transposed form: result.rows=cols, result.cols=rows
  const transposedRows = cols;
  const transposedCols = rows;
  const bytesPerRow = Math.ceil(transposedCols / 4);
  const transposedOut = new Float32Array(transposedRows * transposedCols);

  for (let r = 0; r < transposedRows; r++) {
    const packed = packedData.subarray(r * bytesPerRow, (r + 1) * bytesPerRow);
    const row = dequantizeRow2bit(packed, scales[r], zeroPoints[r], transposedCols);
    transposedOut.set(row, r * transposedCols);
  }

  // Transpose back to original [rows, cols]
  const out = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[r * cols + c] = transposedOut[c * rows + r];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// NMSE comparison utilities
// ---------------------------------------------------------------------------

/**
 * Compute NMSE (Normalized Mean Squared Error) between original and reconstructed.
 *
 * NMSE = sqrt(MSE / variance(original))
 * Matches the metric used elsewhere in the lowbit-Q pipeline.
 */
export function computeNmse(original: Float32Array, reconstructed: Float32Array): number {
  if (original.length !== reconstructed.length) {
    throw new Error('NMSE: length mismatch');
  }
  const n = original.length;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += original[i];
  mean /= n;

  let variance = 0;
  let mse = 0;
  for (let i = 0; i < n; i++) {
    variance += (original[i] - mean) ** 2;
    mse += (original[i] - reconstructed[i]) ** 2;
  }
  variance /= n;
  mse /= n;

  if (variance < 1e-10) return 0; // degenerate
  return Math.sqrt(mse / variance);
}

/**
 * Size comparison: bytes per element for each quantization method.
 *
 * Used to compare KIVI 2-bit against Q2_K, Q3_K, Q4_0.
 */
export interface SizeComparison {
  method: string;
  bytesPerElement: number;
  /** Relative size vs FP16 (2.0 bytes/element) */
  relativeSizeVsFP16: number;
}

/** Compute bytes per element for KIVI per-token 2-bit (attn_v style) */
export function kiviPerTokenBytesPerElement(rows: number, cols: number): number {
  const packedBytes = rows * Math.ceil(cols / 4);
  const scaleBytes = rows * 2 + rows * 2; // scale + zeroPoint in FP16
  return (packedBytes + scaleBytes) / (rows * cols);
}

/** Bytes per element for Q4_0 (18 bytes per 32-element block) */
export const Q4_0_BYTES_PER_ELEMENT = 18 / 32; // = 0.5625

/** Bytes per element for Q3_K (110 bytes per 256-element block) */
export const Q3_K_BYTES_PER_ELEMENT = 110 / 256; // ≈ 0.4297

/** Bytes per element for Q2_K (84 bytes per 256-element block) */
export const Q2_K_BYTES_PER_ELEMENT = 84 / 256; // ≈ 0.3281

/** FP16 bytes per element */
export const FP16_BYTES_PER_ELEMENT = 2.0;
