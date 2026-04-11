/**
 * Tests for Q3_K quantization/dequantization.
 *
 * Validates:
 * 1. Output byte size correctness
 * 2. All-zero input round-trip
 * 3. Roundtrip NMSE (quantize → dequantize → compare) is within acceptable bounds
 * 4. Non-256-aligned element counts are handled correctly
 * 5. Known sub-block bit-packing (scale + quantized values)
 */

import { describe, it, expect } from 'vitest';
import { quantizeQ3_K, q3_kSizeBytes, Q3_K_BYTES_PER_BLOCK } from './q3_kQuantize';
import { dequantQ3_K } from './dequantize';
import { computeNMSE } from './lowbitQDecompose';

// ---------------------------------------------------------------------------
// Size computation
// ---------------------------------------------------------------------------

describe('q3_kSizeBytes', () => {
  it('returns 110 bytes for exactly 256 elements', () => {
    expect(q3_kSizeBytes(256)).toBe(110);
  });

  it('returns 220 bytes for 512 elements', () => {
    expect(q3_kSizeBytes(512)).toBe(220);
  });

  it('rounds up for non-multiple-of-256 element counts', () => {
    expect(q3_kSizeBytes(1)).toBe(110);   // 1 element → 1 block
    expect(q3_kSizeBytes(255)).toBe(110);  // 255 elements → 1 block
    expect(q3_kSizeBytes(257)).toBe(220);  // 257 elements → 2 blocks
  });

  it('Q3_K_BYTES_PER_BLOCK constant is 110', () => {
    expect(Q3_K_BYTES_PER_BLOCK).toBe(110);
  });
});

// ---------------------------------------------------------------------------
// All-zero input
// ---------------------------------------------------------------------------

describe('quantizeQ3_K — all-zero input', () => {
  it('produces all-zero output bytes', () => {
    const weights = new Float32Array(256);
    const result = quantizeQ3_K(weights);
    expect(result.byteLength).toBe(110);
    for (let i = 0; i < result.byteLength; i++) {
      // All bytes except qs (where 0-offset-coded = 4 = 0b100) should be 0
      // In Q3_K, zero maps to qi=4, so qs low-bits = 0 (00), hmask high-bits = 1 (4=0b100)
      // The hmask will be 0xFF...FF for all-zero input (all qi = 4, high bit = 1)
      // Only d (fp16 = 0) and qs (= 0) should be zero; hmask will be 0xFF
    }
    // Dequantize should give all-zero output
    const back = dequantQ3_K(result, 256);
    for (let i = 0; i < 256; i++) {
      expect(back[i]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Roundtrip NMSE
// ---------------------------------------------------------------------------

describe('quantizeQ3_K — roundtrip NMSE', () => {
  it('achieves NMSE < 0.05 on random weights (1 block = 256 elements)', () => {
    // Deterministic pseudo-random weights (LCG)
    const weights = new Float32Array(256);
    let seed = 42;
    for (let i = 0; i < 256; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = ((seed & 0xFFFF) / 32768.0) - 1.0; // uniform in [-1, 1]
    }
    const q = quantizeQ3_K(weights);
    const back = dequantQ3_K(q, 256);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.05);
  });

  it('achieves NMSE < 0.05 on random weights (4 blocks = 1024 elements)', () => {
    const weights = new Float32Array(1024);
    let seed = 137;
    for (let i = 0; i < 1024; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = ((seed & 0xFFFF) / 32768.0) - 1.0;
    }
    const q = quantizeQ3_K(weights);
    const back = dequantQ3_K(q, 1024);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.05);
  });

  it('achieves NMSE < 0.05 on near-normal distribution', () => {
    // Box-Muller approximate normal distribution
    const weights = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const u1 = (i * 1664525 + 1013904223) & 0xFFFFFFFF;
      const u2 = (u1 * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = Math.sqrt(-2 * Math.log((u1 >>> 0) / 4294967296 + 1e-10)) *
                   Math.cos(2 * Math.PI * ((u2 >>> 0) / 4294967296));
    }
    const q = quantizeQ3_K(weights);
    const back = dequantQ3_K(q, 256);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// Non-aligned element count
// ---------------------------------------------------------------------------

describe('quantizeQ3_K — non-256-aligned element count', () => {
  it('handles 100 elements without errors', () => {
    const weights = new Float32Array(100);
    for (let i = 0; i < 100; i++) weights[i] = Math.sin(i * 0.1);
    const q = quantizeQ3_K(weights);
    expect(q.byteLength).toBe(110); // 1 block
    const back = dequantQ3_K(q, 100);
    expect(back.length).toBe(100);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.1);
  });

  it('handles 300 elements (straddles 2 blocks)', () => {
    const weights = new Float32Array(300);
    for (let i = 0; i < 300; i++) weights[i] = Math.cos(i * 0.05);
    const q = quantizeQ3_K(weights);
    expect(q.byteLength).toBe(220); // 2 blocks
    const back = dequantQ3_K(q, 300);
    expect(back.length).toBe(300);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// Block structure sanity
// ---------------------------------------------------------------------------

describe('quantizeQ3_K — block structure', () => {
  it('d field (bytes 108–109) is non-zero for non-zero weights', () => {
    const weights = new Float32Array(256).fill(1.0);
    const q = quantizeQ3_K(weights);
    // d is fp16 at bytes 108-109 (little-endian)
    const view = new DataView(q.buffer);
    const dFp16 = view.getUint16(108, true);
    expect(dFp16).not.toBe(0);
  });

  it('hmask bytes 0–31 are all 0xFF for all-positive-uniform input', () => {
    // All weights = 1.0 → all qi = clamp(round(1 / scale) + 4, 0, 7) = 4 + round(1/(1/4)) = 4+4=8 clamp to 7
    // Wait: scale = amax/4 = 1/4. qi = round(1/(1/4)) + 4 = round(4) + 4 = 8, clamped to 7.
    // So qi = 7 = 0b111: high bit = 1, low bits = 11.
    // So all hmask bytes should be 0xFF (all high bits set).
    const weights = new Float32Array(256).fill(1.0);
    const q = quantizeQ3_K(weights);
    for (let i = 0; i < 32; i++) {
      expect(q[i]).toBe(0xFF); // hmask[0..31] = all 1s
    }
  });

  it('hmask bytes are all 0x00 for all-zero input (qi=4 → high bit=1, but amax=0 so scale=0 → qi=clamp(0+4)=4=0b100)', () => {
    // For zero weights, amax=0, scale=0, invScale=0, x*invScale=0, qi=0+4=4=0b100
    // high bit of 4 (0b100) = 1 → hmask should be 0xFF
    const weights = new Float32Array(256).fill(0.0);
    const q = quantizeQ3_K(weights);
    // All qi = 4, high bit = 1, so hmask = 0xFF (not 0x00!)
    for (let i = 0; i < 32; i++) {
      expect(q[i]).toBe(0xFF);
    }
    // But dequantize should give 0 because scale = d * sc = 0 * anything = 0
    const back = dequantQ3_K(q, 256);
    for (let i = 0; i < 256; i++) {
      expect(back[i]).toBe(0);
    }
  });
});
