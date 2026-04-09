/**
 * End-to-end tests for the onebit quantization pipeline.
 *
 * Tests cover:
 * 1. FP16 ↔ FP32 conversion accuracy
 * 2. Q8_0 encode/dequantize round-trip
 * 3. GGUF parse → verify header, metadata, tensor info
 * 4. Onebit decomposition correctness and quality (NMSE)
 * 5. Onebit GGUF write → re-parse round-trip
 * 6. Full pipeline: synthetic Q8_0 GGUF → onebit GGUF → verify structure
 * 7. Full pipeline: synthetic F32 GGUF → onebit GGUF → verify structure
 */

import { describe, it, expect } from 'vitest';
import { fp16ToFp32, fp32ToFp16 } from './dequantize';
import { dequantQ8_0, dequantF16, dequantF32, dequantQ4_0 } from './dequantize';
import { parseGGUFHeader, isWeightTensor, readTensorData, computeTensorDataSize } from './ggufParser';
import { decompose, reconstruct, computeNMSE } from './onebitDecompose';
import { convertToOnebit } from './convert';
import { dequantize } from './dequantize';
import { writeOnebitGGUF, type OnebitTensorGroup } from './ggufWriter';
import { GGMLType, GGUFValueType, ONEBIT_VERSION_KEY, ONEBIT_LAYERS_KEY, ONEBIT_PACKING_KEY, ONEBIT_SUFFIX_A, ONEBIT_SUFFIX_B, ONEBIT_SUFFIX_SIGN } from './types';
import type { GGUFTensorInfo } from './types';
import { buildToyModelGGUF, buildSyntheticGGUF, encodeQ8_0, encodeF32 } from './testHelpers';
import { createTensorFilter } from './tensorFilter';

// ---------------------------------------------------------------------------
// 1. FP16 ↔ FP32 conversion
// ---------------------------------------------------------------------------

describe('fp16 conversion', () => {
  it('converts common values round-trip', () => {
    const testValues = [0, 1, -1, 0.5, -0.5, 0.1, 100, -100, 0.001, 65504];
    for (const v of testValues) {
      const fp16 = fp32ToFp16(v);
      const back = fp16ToFp32(fp16);
      // FP16 has ~3 decimal digits of precision
      expect(back).toBeCloseTo(v, v === 0 ? 10 : 2);
    }
  });

  it('handles zero correctly', () => {
    expect(fp16ToFp32(0)).toBe(0);
    expect(fp32ToFp16(0)).toBe(0);
  });

  it('handles infinity', () => {
    const posInf = fp32ToFp16(Infinity);
    expect(fp16ToFp32(posInf)).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// 2. Q8_0 encode/dequantize round-trip
// ---------------------------------------------------------------------------

describe('Q8_0 encode/dequant', () => {
  it('round-trips fp32 values through Q8_0 encoding', () => {
    const original = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      original[i] = (i - 32) * 0.1; // -3.2 to 3.1
    }

    const encoded = encodeQ8_0(original);
    const decoded = dequantQ8_0(encoded, 64);

    // Q8_0 has ~1% precision (8-bit quantization)
    for (let i = 0; i < 64; i++) {
      expect(decoded[i]).toBeCloseTo(original[i], 1);
    }
  });

  it('handles all-zero block', () => {
    const zeros = new Float32Array(32);
    const encoded = encodeQ8_0(zeros);
    const decoded = dequantQ8_0(encoded, 32);
    for (let i = 0; i < 32; i++) {
      expect(decoded[i]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. GGUF parser
// ---------------------------------------------------------------------------

describe('GGUF parser', () => {
  it('parses a synthetic GGUF header', () => {
    const { buffer } = buildToyModelGGUF();
    const header = parseGGUFHeader(buffer);

    expect(header.version).toBe(3);
    expect(Number(header.tensorCount)).toBe(3);
    expect(header.tensors.length).toBe(3);

    // Check metadata
    const arch = header.metadata.get('general.architecture');
    expect(arch).toBeDefined();
    expect(arch!.value).toBe('llama');

    const name = header.metadata.get('general.name');
    expect(name).toBeDefined();
    expect(name!.value).toBe('toy-model');
  });

  it('reads tensor info correctly', () => {
    const { buffer } = buildToyModelGGUF({ outFeatures: 4, inFeatures: 8 });
    const header = parseGGUFHeader(buffer);

    const embd = header.tensors.find(t => t.name === 'token_embd.weight');
    expect(embd).toBeDefined();
    expect(embd!.type).toBe(GGMLType.F32);

    const weight = header.tensors.find(t => t.name === 'model.layers.0.self_attn.q_proj.weight');
    expect(weight).toBeDefined();
    expect(weight!.type).toBe(GGMLType.F32);
    expect(Number(weight!.dims[0])).toBe(8);  // in_features
    expect(Number(weight!.dims[1])).toBe(4);  // out_features
  });

  it('reads tensor data correctly (F32)', () => {
    const { buffer, expectedWeights } = buildToyModelGGUF({ outFeatures: 4, inFeatures: 8 });
    const header = parseGGUFHeader(buffer);

    const weightTensor = header.tensors.find(t => t.name === 'model.layers.0.self_attn.q_proj.weight')!;
    const data = readTensorData(buffer, header, weightTensor);
    const fp32 = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);

    for (let i = 0; i < expectedWeights.length; i++) {
      expect(fp32[i]).toBeCloseTo(expectedWeights[i], 5);
    }
  });

  it('rejects invalid magic', () => {
    const badBuffer = new ArrayBuffer(64);
    new DataView(badBuffer).setUint32(0, 0xDEADBEEF, true);
    expect(() => parseGGUFHeader(badBuffer)).toThrow('Invalid GGUF magic');
  });
});

// ---------------------------------------------------------------------------
// 4. isWeightTensor classification
// ---------------------------------------------------------------------------

describe('isWeightTensor', () => {
  it('identifies weight tensors', () => {
    expect(isWeightTensor('model.layers.0.self_attn.q_proj.weight')).toBe(true);
    expect(isWeightTensor('model.layers.0.self_attn.k_proj.weight')).toBe(true);
    expect(isWeightTensor('model.layers.0.self_attn.v_proj.weight')).toBe(true);
    expect(isWeightTensor('model.layers.0.self_attn.o_proj.weight')).toBe(true);
    expect(isWeightTensor('model.layers.0.ffn_up.weight')).toBe(true);
    expect(isWeightTensor('model.layers.0.ffn_down.weight')).toBe(true);
  });

  it('excludes non-weight tensors', () => {
    expect(isWeightTensor('token_embd.weight')).toBe(false);
    expect(isWeightTensor('output.weight')).toBe(false);
    expect(isWeightTensor('model.layers.0.input_layernorm.weight')).toBe(false);
    expect(isWeightTensor('model.layers.0.self_attn.k_norm.weight')).toBe(false);
    expect(isWeightTensor('output_norm.weight')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Onebit decomposition
// ---------------------------------------------------------------------------

describe('onebit decomposition', () => {
  it('decomposes and reconstructs with acceptable NMSE', () => {
    const outFeatures = 16;
    const inFeatures = 32;
    const weights = new Float32Array(outFeatures * inFeatures);

    // Generate realistic-ish weight distribution
    for (let i = 0; i < weights.length; i++) {
      const row = Math.floor(i / inFeatures);
      const col = i % inFeatures;
      weights[i] = Math.sin(row * 0.5 + col * 0.3) * (0.5 + row * 0.02);
    }

    const decomp = decompose(weights, outFeatures, inFeatures);

    expect(decomp.a.length).toBe(outFeatures);
    expect(decomp.b.length).toBe(inFeatures);
    expect(decomp.sign.length).toBe(Math.ceil(outFeatures * inFeatures / 8));

    const reconstructed = reconstruct(decomp);
    const nmse = computeNMSE(weights, reconstructed);

    // For 1-bit quantization, NMSE should be < 1.0 (better than random)
    // Typical: 0.3-0.7 for RTN decomposition
    expect(nmse).toBeLessThan(1.0);
    expect(nmse).toBeGreaterThan(0);
  });

  it('preserves sign information correctly', () => {
    const outFeatures = 4;
    const inFeatures = 8;
    const weights = new Float32Array(outFeatures * inFeatures);

    // Alternating positive/negative pattern
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (i % 2 === 0) ? 0.5 : -0.5;
    }

    const decomp = decompose(weights, outFeatures, inFeatures);
    const reconstructed = reconstruct(decomp);

    // All signs should be preserved
    for (let i = 0; i < weights.length; i++) {
      expect(Math.sign(reconstructed[i])).toBe(Math.sign(weights[i]));
    }
  });

  it('handles uniform weights', () => {
    const outFeatures = 4;
    const inFeatures = 4;
    const weights = new Float32Array(outFeatures * inFeatures).fill(0.5);

    const decomp = decompose(weights, outFeatures, inFeatures);
    const reconstructed = reconstruct(decomp);

    // All values should be positive
    for (let i = 0; i < weights.length; i++) {
      expect(reconstructed[i]).toBeGreaterThan(0);
    }
  });

  it('rejects mismatched dimensions', () => {
    const weights = new Float32Array(10);
    expect(() => decompose(weights, 3, 4)).toThrow('size mismatch');
  });
});

// ---------------------------------------------------------------------------
// 6. Full pipeline: F32 GGUF → onebit GGUF → verify
// ---------------------------------------------------------------------------

describe('full pipeline (F32 source)', () => {
  it('converts F32 GGUF to onebit GGUF', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures: 8,
      inFeatures: 16,
    });

    const result = convertToOnebit(buffer, { computeQuality: true });

    expect(result.convertedTensorCount).toBe(1); // q_proj.weight
    expect(result.passthroughTensorCount).toBe(2); // embd + norm
    expect(result.convertedSize).toBeLessThan(result.originalSize);
    expect(result.data.length).toBeGreaterThan(0);

    // Verify GGUF magic of output
    expect(result.data[0]).toBe(0x47);
    expect(result.data[1]).toBe(0x47);
    expect(result.data[2]).toBe(0x55);
    expect(result.data[3]).toBe(0x46);
  });

  it('output contains onebit metadata', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures: 8,
      inFeatures: 16,
    });

    const result = convertToOnebit(buffer);
    const outHeader = parseGGUFHeader(result.data.buffer);

    // Check onebit metadata
    const version = outHeader.metadata.get(ONEBIT_VERSION_KEY);
    expect(version).toBeDefined();
    expect(version!.value).toBe(1);

    const packing = outHeader.metadata.get(ONEBIT_PACKING_KEY);
    expect(packing).toBeDefined();
    expect(packing!.value).toBe('msb_first');

    const layers = outHeader.metadata.get(ONEBIT_LAYERS_KEY);
    expect(layers).toBeDefined();
    expect(Array.isArray(layers!.value)).toBe(true);
  });

  it('output contains onebit tensor triplets', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures: 8,
      inFeatures: 16,
    });

    const result = convertToOnebit(buffer);
    const outHeader = parseGGUFHeader(result.data.buffer);

    const tensorNames = outHeader.tensors.map(t => t.name);

    // Passthrough tensors
    expect(tensorNames).toContain('token_embd.weight');
    expect(tensorNames).toContain('model.layers.0.input_layernorm.weight');

    // Original weight tensor should be gone
    expect(tensorNames).not.toContain('model.layers.0.self_attn.q_proj.weight');

    // Onebit triplet should be present
    expect(tensorNames).toContain('model.layers.0.self_attn.q_proj' + ONEBIT_SUFFIX_A);
    expect(tensorNames).toContain('model.layers.0.self_attn.q_proj' + ONEBIT_SUFFIX_B);
    expect(tensorNames).toContain('model.layers.0.self_attn.q_proj' + ONEBIT_SUFFIX_SIGN);
  });

  it('onebit tensor dimensions are correct', () => {
    const outFeatures = 8;
    const inFeatures = 16;
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures,
      inFeatures,
    });

    const result = convertToOnebit(buffer);
    const outHeader = parseGGUFHeader(result.data.buffer);

    const aT = outHeader.tensors.find(t => t.name.endsWith(ONEBIT_SUFFIX_A));
    expect(aT).toBeDefined();
    expect(Number(aT!.dims[0])).toBe(outFeatures);
    expect(aT!.type).toBe(GGMLType.F16);

    const bT = outHeader.tensors.find(t => t.name.endsWith(ONEBIT_SUFFIX_B));
    expect(bT).toBeDefined();
    expect(Number(bT!.dims[0])).toBe(inFeatures);
    expect(bT!.type).toBe(GGMLType.F16);

    const signT = outHeader.tensors.find(t => t.name.endsWith(ONEBIT_SUFFIX_SIGN));
    expect(signT).toBeDefined();
    const expectedSignBytes = Math.ceil(outFeatures * inFeatures / 8);
    expect(Number(signT!.dims[0])).toBe(expectedSignBytes);
  });
});

// ---------------------------------------------------------------------------
// 7. Full pipeline: Q8_0 GGUF → onebit GGUF → verify
// ---------------------------------------------------------------------------

describe('full pipeline (Q8_0 source)', () => {
  it('converts Q8_0 GGUF to onebit GGUF', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.Q8_0,
      outFeatures: 8,
      inFeatures: 32, // Must be multiple of 32 for Q8_0
    });

    const result = convertToOnebit(buffer, { computeQuality: true });

    expect(result.convertedTensorCount).toBe(1);
    expect(result.passthroughTensorCount).toBe(2);
    // Note: for tiny tensors, onebit GGUF may be larger due to header overhead.
    // Size reduction is meaningful for real models (thousands of elements per tensor).
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('reports NMSE for quality assessment', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.Q8_0,
      outFeatures: 8,
      inFeatures: 32,
    });

    const result = convertToOnebit(buffer, { computeQuality: true });

    expect(result.tensorNMSE.size).toBe(1);
    const nmse = result.tensorNMSE.get('model.layers.0.self_attn.q_proj.weight');
    expect(nmse).toBeDefined();
    expect(nmse!).toBeGreaterThan(0);
    expect(nmse!).toBeLessThan(2.0); // Should be reasonable for 1-bit
  });
});

// ---------------------------------------------------------------------------
// 7b. Passthrough tensor type preservation + array metadata round-trip
// ---------------------------------------------------------------------------

describe('passthrough tensor type preservation', () => {
  it('preserves passthrough tensor types in simple round-trip', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.Q8_0,
      outFeatures: 8,
      inFeatures: 32,
    });
    const result = convertToOnebit(buffer);
    const outHeader = parseGGUFHeader(result.data.buffer);

    const embd = outHeader.tensors.find(t => t.name === 'token_embd.weight');
    expect(embd).toBeDefined();
    expect(embd!.type).toBe(GGMLType.F32);

    const norm = outHeader.tensors.find(t => t.name === 'model.layers.0.input_layernorm.weight');
    expect(norm).toBeDefined();
    expect(norm!.type).toBe(GGMLType.F32);
  });

  it('preserves types with array metadata (mimicking real models)', () => {
    // Build GGUF with output.weight included (real models have this)
    const tensors: import('./testHelpers').SyntheticTensor[] = [
      {
        name: 'token_embd.weight',
        type: GGMLType.F32,
        dims: [8, 4],
        values: new Float32Array(32).fill(0.1),
      },
      {
        name: 'output.weight',
        type: GGMLType.F32,
        dims: [8, 4],
        values: new Float32Array(32).fill(0.2),
      },
      {
        name: 'model.layers.0.self_attn.q_proj.weight',
        type: GGMLType.F32,
        dims: [16, 8],
        values: Float32Array.from({ length: 128 }, (_, i) => ((i % 17) - 8) * 0.1),
      },
      {
        name: 'model.layers.0.input_layernorm.weight',
        type: GGMLType.F32,
        dims: [16],
        values: new Float32Array(16).fill(1.0),
      },
    ];

    const simpleMetadata = new Map<string, { type: GGUFValueType; value: string | number }>([
      ['general.architecture', { type: GGUFValueType.STRING, value: 'llama' }],
      ['general.name', { type: GGUFValueType.STRING, value: 'test-model' }],
    ]);
    const buffer = buildSyntheticGGUF({ metadata: simpleMetadata, tensors });

    // Parse the source, then inject array metadata to simulate real models.
    // Then call writeOnebitGGUF DIRECTLY (not convertToOnebit) to test the
    // writer's handling of array metadata in the output.
    const sourceHeader = parseGGUFHeader(buffer);

    // Inject array metadata
    sourceHeader.metadata.set('tokenizer.ggml.tokens', {
      key: 'tokenizer.ggml.tokens',
      type: GGUFValueType.ARRAY,
      value: [
        { key: '[0]', type: GGUFValueType.STRING, value: 'hello' },
        { key: '[1]', type: GGUFValueType.STRING, value: 'world' },
        { key: '[2]', type: GGUFValueType.STRING, value: 'test' },
      ],
    });
    sourceHeader.metadata.set('tokenizer.ggml.scores', {
      key: 'tokenizer.ggml.scores',
      type: GGUFValueType.ARRAY,
      value: [
        { key: '[0]', type: GGUFValueType.FLOAT32, value: 1.0 },
        { key: '[1]', type: GGUFValueType.FLOAT32, value: 2.0 },
        { key: '[2]', type: GGUFValueType.FLOAT32, value: 3.0 },
      ],
    });
    sourceHeader.metadata.set('tokenizer.ggml.token_type', {
      key: 'tokenizer.ggml.token_type',
      type: GGUFValueType.ARRAY,
      value: [
        { key: '[0]', type: GGUFValueType.INT32, value: 1 },
        { key: '[1]', type: GGUFValueType.INT32, value: 2 },
        { key: '[2]', type: GGUFValueType.INT32, value: 3 },
      ],
    });

    // Build passthrough and onebit tensor sets manually
    const passthroughTensors = new Map<string, { info: GGUFTensorInfo; data: Uint8Array }>();
    const onebitTensors = new Map<string, OnebitTensorGroup>();

    for (const tensor of sourceHeader.tensors) {
      const rawData = readTensorData(buffer, sourceHeader, tensor);
      if (isWeightTensor(tensor.name)) {
        const totalElements = Number(tensor.dims.reduce((a, d) => a * d, 1n));
        const fp32 = dequantize(rawData, tensor.type, totalElements);
        const inF = Number(tensor.dims[0]);
        const outF = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
        const decomposition = decompose(fp32, outF, inF);
        onebitTensors.set(tensor.name, {
          baseName: tensor.name.replace(/\.weight$/, ''),
          decomposition,
        });
      } else {
        passthroughTensors.set(tensor.name, { info: tensor, data: rawData });
      }
    }

    const output = writeOnebitGGUF({
      sourceHeader,
      sourceBuffer: buffer,
      onebitTensors,
      passthroughTensors,
      onebitLayerIndices: [0],
    });

    // Re-parse and verify
    const outHeader = parseGGUFHeader(output.buffer);

    // Check passthrough tensor types
    const embd = outHeader.tensors.find(t => t.name === 'token_embd.weight');
    expect(embd).toBeDefined();
    expect(embd!.type).toBe(GGMLType.F32);

    const outputW = outHeader.tensors.find(t => t.name === 'output.weight');
    expect(outputW).toBeDefined();
    expect(outputW!.type).toBe(GGMLType.F32);

    const norm = outHeader.tensors.find(t => t.name === 'model.layers.0.input_layernorm.weight');
    expect(norm).toBeDefined();
    expect(norm!.type).toBe(GGMLType.F32);

    // Onebit triplets
    const aT = outHeader.tensors.find(t => t.name.endsWith('.onebit_a'));
    expect(aT).toBeDefined();
    expect(aT!.type).toBe(GGMLType.F16);

    const signT = outHeader.tensors.find(t => t.name.endsWith('.onebit_sign'));
    expect(signT).toBeDefined();
    expect(signT!.type).toBe(GGMLType.I8);
  });
});

// ---------------------------------------------------------------------------
// 8. Progress reporting
// ---------------------------------------------------------------------------

describe('progress reporting', () => {
  it('reports progress through all stages', () => {
    const { buffer } = buildToyModelGGUF();
    const stages: string[] = [];

    convertToOnebit(buffer, {
      onProgress: (p) => {
        if (!stages.includes(p.stage)) stages.push(p.stage);
      },
    });

    expect(stages).toContain('parsing');
    expect(stages).toContain('converting');
    expect(stages).toContain('writing');
    expect(stages).toContain('done');
  });
});

// ---------------------------------------------------------------------------
// 9. Size reduction verification
// ---------------------------------------------------------------------------

describe('size reduction', () => {
  it('onebit GGUF is significantly smaller than F32 source', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures: 32,
      inFeatures: 64,
    });

    const result = convertToOnebit(buffer);

    // Onebit should be much smaller for the weight tensor portion
    // (a: 32*2 + b: 64*2 + sign: 256 = 448 bytes vs F32: 32*64*4 = 8192 bytes)
    const ratio = result.convertedSize / result.originalSize;
    expect(ratio).toBeLessThan(0.7);
  });

  it('onebit GGUF is smaller than Q8_0 source', () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.Q8_0,
      outFeatures: 32,
      inFeatures: 64,
    });

    const result = convertToOnebit(buffer);

    // Onebit: ~448 bytes for weight vs Q8_0: ~2176 bytes (64 blocks * 34)
    const ratio = result.convertedSize / result.originalSize;
    expect(ratio).toBeLessThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// 10. Q4_0 dequantization
// ---------------------------------------------------------------------------

describe('Q4_0 dequantization', () => {
  it('dequantizes simple values', () => {
    // Create a Q4_0 block manually: 32 elements
    // delta = 1.0 (fp16), then 16 bytes of packed nibbles
    const block = new Uint8Array(18);
    const view = new DataView(block.buffer);
    // fp16 for 1.0 = 0x3C00
    view.setUint16(0, 0x3C00, true);
    // All nibbles = 8 → value = 1.0 * (8 - 8) = 0
    block.fill(0x88, 2, 18);

    const result = dequantQ4_0(block, 32);
    for (let i = 0; i < 32; i++) {
      expect(result[i]).toBeCloseTo(0, 2);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles 1x1 weight matrix', () => {
    const weights = new Float32Array([0.5]);
    const decomp = decompose(weights, 1, 1);
    expect(decomp.a.length).toBe(1);
    expect(decomp.b.length).toBe(1);
    expect(decomp.sign.length).toBe(1);

    const reconstructed = reconstruct(decomp);
    expect(reconstructed[0]).toBeGreaterThan(0); // Sign preserved
  });

  it('handles negative-only weight matrix', () => {
    const outFeatures = 4;
    const inFeatures = 4;
    const weights = new Float32Array(16).fill(-0.3);

    const decomp = decompose(weights, outFeatures, inFeatures);
    const reconstructed = reconstruct(decomp);

    for (let i = 0; i < 16; i++) {
      expect(reconstructed[i]).toBeLessThan(0);
    }
  });

  it('NMSE is Infinity for zero-variance input', () => {
    const a = new Float32Array([1, 1, 1]);
    const b = new Float32Array([0.5, 0.5, 0.5]);
    const nmse = computeNMSE(a, b);
    expect(nmse).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// 12. Tensor filter integration
// ---------------------------------------------------------------------------

describe('convertToOnebit with tensorFilter', () => {
  it('respects attention-only filter: only attn tensors converted', () => {
    // Build a model with both attention and FFN weight tensors
    const tensors: import('./testHelpers').SyntheticTensor[] = [
      {
        name: 'token_embd.weight',
        type: GGMLType.F32,
        dims: [16, 4],
        values: new Float32Array(64).fill(0.1),
      },
      {
        name: 'model.layers.0.self_attn.q_proj.weight',
        type: GGMLType.F32,
        dims: [16, 8],
        values: Float32Array.from({ length: 128 }, (_, i) => ((i % 17) - 8) * 0.1),
      },
      {
        name: 'model.layers.0.ffn_up.weight',
        type: GGMLType.F32,
        dims: [16, 8],
        values: Float32Array.from({ length: 128 }, (_, i) => ((i % 13) - 6) * 0.05),
      },
      {
        name: 'model.layers.0.input_layernorm.weight',
        type: GGMLType.F32,
        dims: [16],
        values: new Float32Array(16).fill(1.0),
      },
    ];

    const simpleMetadata = new Map<string, { type: GGUFValueType; value: string | number }>([
      ['general.architecture', { type: GGUFValueType.STRING, value: 'llama' }],
      ['general.name', { type: GGUFValueType.STRING, value: 'test-filter' }],
    ]);
    const buffer = buildSyntheticGGUF({ metadata: simpleMetadata, tensors });

    // Use attention-only filter from tensorFilter module
    const attnFilter = createTensorFilter('attention-only');

    const result = convertToOnebit(buffer, {
      tensorFilter: attnFilter,
      computeQuality: true,
    });

    // Only q_proj should be converted (attention); ffn_up should pass through
    expect(result.convertedTensorCount).toBe(1);
    // embd + layernorm + ffn_up = 3 passthrough
    expect(result.passthroughTensorCount).toBe(3);

    // Verify the output GGUF still contains ffn_up.weight as-is
    const outHeader = parseGGUFHeader(result.data.buffer);
    const tensorNames = outHeader.tensors.map(t => t.name);
    expect(tensorNames).toContain('model.layers.0.ffn_up.weight');
    expect(tensorNames).not.toContain('model.layers.0.self_attn.q_proj.weight');
    expect(tensorNames).toContain('model.layers.0.self_attn.q_proj.onebit_a');
  });

  it('populates tensorRecords with correct fields', () => {
    const tensors: import('./testHelpers').SyntheticTensor[] = [
      {
        name: 'token_embd.weight',
        type: GGMLType.F32,
        dims: [16, 4],
        values: new Float32Array(64).fill(0.1),
      },
      {
        name: 'model.layers.0.self_attn.q_proj.weight',
        type: GGMLType.F32,
        dims: [16, 8],
        values: Float32Array.from({ length: 128 }, (_, i) => ((i % 17) - 8) * 0.1),
      },
      {
        name: 'model.layers.0.input_layernorm.weight',
        type: GGMLType.F32,
        dims: [16],
        values: new Float32Array(16).fill(1.0),
      },
    ];

    const simpleMetadata = new Map<string, { type: GGUFValueType; value: string | number }>([
      ['general.architecture', { type: GGUFValueType.STRING, value: 'llama' }],
      ['general.name', { type: GGUFValueType.STRING, value: 'test-records' }],
    ]);
    const buffer = buildSyntheticGGUF({ metadata: simpleMetadata, tensors });

    const result = convertToOnebit(buffer, { computeQuality: true });

    expect(result.tensorRecords.length).toBeGreaterThan(0);

    // Find the converted tensor record
    const qProjRecord = result.tensorRecords.find(
      r => r.name === 'model.layers.0.self_attn.q_proj.weight',
    );
    expect(qProjRecord).toBeDefined();
    expect(qProjRecord!.converted).toBe(true);
    expect(qProjRecord!.family).toBe('attn-q');
    expect(qProjRecord!.layerIndex).toBe(0);
    expect(qProjRecord!.nmse).toBeGreaterThan(0);
    expect(qProjRecord!.originalSizeBytes).toBeGreaterThan(0);
    expect(qProjRecord!.onebitSizeBytes).toBeGreaterThan(0);
    expect(qProjRecord!.dims).toEqual([16, 8]);

    // Non-weight tensors should not appear in tensorRecords (only weight tensors are recorded)
    // Or if they do, they should be marked as not converted
    const embdRecord = result.tensorRecords.find(r => r.name === 'token_embd.weight');
    if (embdRecord) {
      expect(embdRecord.converted).toBe(false);
      expect(embdRecord.nmse).toBeNull();
    }
  });
});
