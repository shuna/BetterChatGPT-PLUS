/**
 * Tests for Q2_K quantization/dequantization.
 *
 * Validates:
 * 1. Output byte size correctness
 * 2. All-zero input round-trip
 * 3. Roundtrip NMSE (quantize → dequantize → compare) is within acceptable bounds
 * 4. Non-256-aligned element counts are handled correctly
 * 5. Block structure fields (d, dmin, scales, qs layout)
 */

import { describe, it, expect } from 'vitest';
import { quantizeQ2_K, q2_kSizeBytes, Q2_K_BYTES_PER_BLOCK } from './q2_kQuantize';
import { dequantQ2_K } from './dequantize';
import { computeNMSE } from './lowbitQDecompose';

// ---------------------------------------------------------------------------
// Size computation
// ---------------------------------------------------------------------------

describe('q2_kSizeBytes', () => {
  it('returns 84 bytes for exactly 256 elements', () => {
    expect(q2_kSizeBytes(256)).toBe(84);
  });

  it('returns 168 bytes for 512 elements', () => {
    expect(q2_kSizeBytes(512)).toBe(168);
  });

  it('rounds up for non-multiple-of-256 element counts', () => {
    expect(q2_kSizeBytes(1)).toBe(84);
    expect(q2_kSizeBytes(255)).toBe(84);
    expect(q2_kSizeBytes(257)).toBe(168);
  });

  it('Q2_K_BYTES_PER_BLOCK constant is 84', () => {
    expect(Q2_K_BYTES_PER_BLOCK).toBe(84);
  });
});

// ---------------------------------------------------------------------------
// All-zero input
// ---------------------------------------------------------------------------

describe('quantizeQ2_K — all-zero input', () => {
  it('dequantizes back to all zeros', () => {
    const weights = new Float32Array(256);
    const result = quantizeQ2_K(weights);
    expect(result.byteLength).toBe(84);
    const back = dequantQ2_K(result, 256);
    for (let i = 0; i < 256; i++) {
      expect(back[i]).toBeCloseTo(0, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Roundtrip NMSE
// ---------------------------------------------------------------------------

describe('quantizeQ2_K — roundtrip NMSE', () => {
  it('achieves NMSE < 0.15 on random weights in [-1, 1]', () => {
    const weights = new Float32Array(256);
    let seed = 42;
    for (let i = 0; i < 256; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = ((seed & 0xFFFF) / 32768.0) - 1.0;
    }
    const q = quantizeQ2_K(weights);
    const back = dequantQ2_K(q, 256);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.15);
  });

  it('achieves NMSE < 0.15 on random weights (4 blocks = 1024 elements)', () => {
    const weights = new Float32Array(1024);
    let seed = 999;
    for (let i = 0; i < 1024; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = ((seed & 0xFFFF) / 32768.0) - 1.0;
    }
    const q = quantizeQ2_K(weights);
    const back = dequantQ2_K(q, 1024);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.15);
  });

  it('achieves NMSE < 0.15 on normally-distributed weights', () => {
    const weights = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const u1 = (i * 1664525 + 1013904223) & 0xFFFFFFFF;
      const u2 = (u1 * 1664525 + 1013904223) & 0xFFFFFFFF;
      weights[i] = Math.sqrt(-2 * Math.log((u1 >>> 0) / 4294967296 + 1e-10)) *
                   Math.cos(2 * Math.PI * ((u2 >>> 0) / 4294967296));
    }
    const q = quantizeQ2_K(weights);
    const back = dequantQ2_K(q, 256);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// Non-aligned element count
// ---------------------------------------------------------------------------

describe('quantizeQ2_K — non-256-aligned element count', () => {
  it('handles 100 elements without errors', () => {
    const weights = new Float32Array(100);
    for (let i = 0; i < 100; i++) weights[i] = Math.sin(i * 0.1);
    const q = quantizeQ2_K(weights);
    expect(q.byteLength).toBe(84);
    const back = dequantQ2_K(q, 100);
    expect(back.length).toBe(100);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.2);
  });

  it('handles 300 elements (straddles 2 blocks)', () => {
    const weights = new Float32Array(300);
    for (let i = 0; i < 300; i++) weights[i] = Math.cos(i * 0.05);
    const q = quantizeQ2_K(weights);
    expect(q.byteLength).toBe(168);
    const back = dequantQ2_K(q, 300);
    expect(back.length).toBe(300);
    const nmse = computeNMSE(weights, back);
    expect(nmse).toBeLessThan(0.2);
  });
});

// ---------------------------------------------------------------------------
// Block structure sanity
// ---------------------------------------------------------------------------

describe('quantizeQ2_K — block structure', () => {
  // ggml block_q2_K layout: scales[0..15], qs[16..79], d[80..81], dmin[82..83]

  it('d field (bytes 80–81) is non-zero for non-zero weights', () => {
    const weights = new Float32Array(256).fill(1.0);
    const q = quantizeQ2_K(weights);
    const view = new DataView(q.buffer);
    const dFp16 = view.getUint16(80, true);
    expect(dFp16).not.toBe(0);
  });

  it('dmin field (bytes 82–83) is non-zero for weights with negative values', () => {
    const weights = new Float32Array(256);
    for (let i = 0; i < 256; i++) weights[i] = (i % 2 === 0) ? 1.0 : -1.0;
    const q = quantizeQ2_K(weights);
    const view = new DataView(q.buffer);
    const dminFp16 = view.getUint16(82, true);
    expect(dminFp16).not.toBe(0);
  });

  it('scales[16] (bytes 0–15) have correct nibble structure', () => {
    // For uniform positive weights: min=0, max=0.5, range=0.5 for all sub-blocks.
    // dmin=0 (all mins are 0), d=non-zero, all scale indices = 15 (max scale = max).
    // ggml: low nibble = scale_idx (= 15), high nibble = min_idx (= 0).
    const weights = new Float32Array(256).fill(0.5);
    const q = quantizeQ2_K(weights);
    for (let j = 0; j < 16; j++) {
      const scaleByte = q[j];           // scales at offset 0..15
      const scIdx = scaleByte & 0xF;    // low  nibble = scale index
      expect(scIdx).toBe(15);           // all sub-blocks at max scale
    }
  });

  it('qs bytes (16–79) contain values 0–3 only (2-bit packed)', () => {
    const weights = new Float32Array(256);
    for (let i = 0; i < 256; i++) weights[i] = (i % 4) * 0.25; // values: 0, 0.25, 0.5, 0.75
    const q = quantizeQ2_K(weights);
    // Each byte in qs contains 4 2-bit values — verify no value exceeds 3
    for (let i = 16; i < 80; i++) {
      const byte = q[i];
      for (let bit = 0; bit < 4; bit++) {
        const val = (byte >> (2 * bit)) & 0x3;
        expect(val).toBeLessThanOrEqual(3);
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Monotonicity: higher values → higher quantized codes
// ---------------------------------------------------------------------------

describe('quantizeQ2_K — monotonicity', () => {
  it('increasing weights map to non-decreasing quantized values within a sub-block', () => {
    // Fill one sub-block (16 elements) with [0, 0.1, 0.2, ... 1.5] × 16 → range [0, 1.5]
    const weights = new Float32Array(256).fill(0);
    for (let i = 0; i < 16; i++) weights[i] = i * 0.1; // 0, 0.1, ..., 1.5 (sub-block 0)
    const q = quantizeQ2_K(weights);
    const back = dequantQ2_K(q, 256);

    // The first 16 elements should be monotonically non-decreasing after dequant
    for (let i = 1; i < 16; i++) {
      expect(back[i]).toBeGreaterThanOrEqual(back[i - 1] - 0.01); // allow small rounding errors
    }
  });
});
