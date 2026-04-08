/**
 * OneBit decomposition: W ≈ diag(a) × Sign(W) × diag(b)
 *
 * Faithful implementation of the SVID (Sign-Value-Independent Decomposition)
 * algorithm from FujitsuResearch/OneCompression:
 *
 *   1. Extract sign matrix: S = sign(W), with zeros mapped to +1
 *   2. Compute |W| and find its rank-1 SVD: |W| ≈ σ₁ · u₁ · v₁ᵀ
 *   3. a = |u₁| · √σ₁   (per-row scale, out_features)
 *   4. b = |v₁| · √σ₁   (per-column scale, in_features)
 *   5. Gauge normalization: balance ‖a‖ and ‖b‖
 *   6. Pack sign bits MSB-first
 *
 * The rank-1 SVD is computed via power iteration on |W|ᵀ|W|, which only
 * needs matrix-vector products — no full SVD or eigendecomposition.
 *
 * Reference: onecomp/quantizer/onebit/onebit_impl.py (run_onebit)
 */

import type { OnebitDecomposition } from './types';

// ---------------------------------------------------------------------------
// Power iteration for rank-1 SVD of |W|
// ---------------------------------------------------------------------------

/**
 * Compute the leading singular triplet (σ₁, u₁, v₁) of matrix M via
 * power iteration on MᵀM.
 *
 * M is (rows × cols), stored row-major in a Float32Array.
 * Returns { sigma, u, v } where:
 *   - sigma = largest singular value
 *   - u = left singular vector (length rows)
 *   - v = right singular vector (length cols)
 *
 * Convergence is fast for matrices with a dominant singular value,
 * which is typical for |W| in transformer weight matrices.
 */
function rank1SVD(
  M: Float32Array,
  rows: number,
  cols: number,
  maxIter = 64,
  tol = 1e-7,
): { sigma: number; u: Float32Array; v: Float32Array } {
  // Initialize v with a deterministic non-zero vector (all 1/√cols)
  let v = new Float32Array(cols);
  const initVal = 1.0 / Math.sqrt(cols);
  for (let j = 0; j < cols; j++) v[j] = initVal;

  let u = new Float32Array(rows);
  let sigma = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // u_new = M @ v
    const uNew = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      const rowOff = i * cols;
      let sum = 0;
      for (let j = 0; j < cols; j++) {
        sum += M[rowOff + j] * v[j];
      }
      uNew[i] = sum;
    }

    // sigma = ‖u_new‖
    let uNorm = 0;
    for (let i = 0; i < rows; i++) uNorm += uNew[i] * uNew[i];
    sigma = Math.sqrt(uNorm);

    if (sigma < 1e-12) {
      // Degenerate case: matrix is effectively zero
      u = uNew;
      break;
    }

    // Normalize u
    for (let i = 0; i < rows; i++) uNew[i] /= sigma;
    u = uNew;

    // v_new = Mᵀ @ u
    const vNew = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        sum += M[i * cols + j] * u[i];
      }
      vNew[j] = sum;
    }

    // Normalize v
    let vNorm = 0;
    for (let j = 0; j < cols; j++) vNorm += vNew[j] * vNew[j];
    vNorm = Math.sqrt(vNorm);

    if (vNorm < 1e-12) {
      v = vNew;
      break;
    }

    for (let j = 0; j < cols; j++) vNew[j] /= vNorm;

    // Check convergence: ‖v_new - v_old‖
    let diff = 0;
    for (let j = 0; j < cols; j++) {
      const d = vNew[j] - v[j];
      diff += d * d;
    }

    v = vNew;

    if (Math.sqrt(diff) < tol) break;
  }

  return { sigma, u, v };
}

// ---------------------------------------------------------------------------
// Decomposition (OneCompression SVID)
// ---------------------------------------------------------------------------

/**
 * Decompose a weight matrix into onebit representation using SVID.
 *
 * Faithfully implements the algorithm from OneCompression:
 *   a = |u₁| · √σ₁, b = |v₁| · √σ₁
 *   with gauge normalization to balance ‖a‖ and ‖b‖.
 *
 * @param weights - fp32 weight matrix in row-major order (out_features × in_features)
 * @param outFeatures - number of output features (rows)
 * @param inFeatures - number of input features (columns)
 * @returns OnebitDecomposition with a, b, and packed sign bits
 */
export function decompose(
  weights: Float32Array,
  outFeatures: number,
  inFeatures: number,
): OnebitDecomposition {
  if (weights.length !== outFeatures * inFeatures) {
    throw new Error(
      `Weight matrix size mismatch: got ${weights.length} elements, ` +
      `expected ${outFeatures} × ${inFeatures} = ${outFeatures * inFeatures}`,
    );
  }

  // Step 1: Compute |W|
  const absW = new Float32Array(weights.length);
  for (let k = 0; k < weights.length; k++) {
    absW[k] = Math.abs(weights[k]);
  }

  // Step 2: Rank-1 SVD of |W|: |W| ≈ σ₁ · u₁ · v₁ᵀ
  const { sigma, u: u1, v: v1 } = rank1SVD(absW, outFeatures, inFeatures);

  // Step 3: a = |u₁| · √σ₁, b = |v₁| · √σ₁
  const sqrtSigma = Math.sqrt(Math.max(sigma, 0));
  const a = new Float32Array(outFeatures);
  const b = new Float32Array(inFeatures);

  for (let i = 0; i < outFeatures; i++) {
    a[i] = Math.abs(u1[i]) * sqrtSigma;
  }
  for (let j = 0; j < inFeatures; j++) {
    b[j] = Math.abs(v1[j]) * sqrtSigma;
  }

  // Step 4: Gauge normalization — balance ‖a‖ and ‖b‖
  // balance = √(‖b‖ / ‖a‖), then a *= balance, b /= balance
  let aNorm = 0;
  for (let i = 0; i < outFeatures; i++) aNorm += a[i] * a[i];
  aNorm = Math.sqrt(aNorm);

  let bNorm = 0;
  for (let j = 0; j < inFeatures; j++) bNorm += b[j] * b[j];
  bNorm = Math.sqrt(bNorm);

  if (aNorm > 1e-12 && bNorm > 1e-12) {
    const balance = Math.sqrt(bNorm / aNorm);
    for (let i = 0; i < outFeatures; i++) a[i] *= balance;
    for (let j = 0; j < inFeatures; j++) b[j] /= balance;
  }

  // Step 5: Extract sign bits (MSB first packing)
  // sign(W), with zeros mapped to +1 (matching OneCompression)
  const totalBits = outFeatures * inFeatures;
  const signBytes = Math.ceil(totalBits / 8);
  const sign = new Uint8Array(signBytes);

  for (let i = 0; i < outFeatures; i++) {
    const rowOffset = i * inFeatures;
    for (let j = 0; j < inFeatures; j++) {
      const bitIndex = rowOffset + j;
      if (weights[bitIndex] >= 0) {
        // Set bit for positive / zero (MSB first: bit 7 is first in each byte)
        const byteIdx = Math.floor(bitIndex / 8);
        const bitPos = 7 - (bitIndex % 8);
        sign[byteIdx] |= (1 << bitPos);
      }
      // Negative → bit stays 0
    }
  }

  return { a, b, sign, outFeatures, inFeatures };
}

// ---------------------------------------------------------------------------
// Reconstruction (for verification)
// ---------------------------------------------------------------------------

/**
 * Reconstruct a weight matrix from onebit decomposition.
 *
 * W_approx[i,j] = a[i] * sign[i,j] * b[j]
 * where sign[i,j] = +1 if bit is set, -1 otherwise.
 */
export function reconstruct(decomp: OnebitDecomposition): Float32Array {
  const { a, b, sign, outFeatures, inFeatures } = decomp;
  const result = new Float32Array(outFeatures * inFeatures);

  for (let i = 0; i < outFeatures; i++) {
    const rowOffset = i * inFeatures;
    const ai = a[i];
    for (let j = 0; j < inFeatures; j++) {
      const bitIndex = rowOffset + j;
      const byteIdx = Math.floor(bitIndex / 8);
      const bitPos = 7 - (bitIndex % 8);
      const signBit = (sign[byteIdx] >> bitPos) & 1;
      const s = signBit ? 1.0 : -1.0;
      result[rowOffset + j] = ai * s * b[j];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Quality metric
// ---------------------------------------------------------------------------

/**
 * Compute normalized mean squared error between original and reconstructed weights.
 * NMSE = MSE / var(original)
 */
export function computeNMSE(original: Float32Array, reconstructed: Float32Array): number {
  if (original.length !== reconstructed.length) {
    throw new Error('Array length mismatch');
  }

  let mse = 0;
  let mean = 0;
  const n = original.length;

  for (let i = 0; i < n; i++) mean += original[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const diff = original[i] - reconstructed[i];
    mse += diff * diff;
    const dm = original[i] - mean;
    variance += dm * dm;
  }

  mse /= n;
  variance /= n;

  return variance > 0 ? mse / variance : Infinity;
}
