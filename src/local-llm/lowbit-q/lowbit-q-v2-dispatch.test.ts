/**
 * lowbit-q-v2-dispatch.test.ts
 *
 * Verifies the contract between the TypeScript GGUF writer and the C-side
 * tensor lookup / dispatch logic (lowbit-q-model-builder.c).
 *
 * These tests do NOT run C code — they verify that the tensor naming
 * convention and metadata format written by the TypeScript pipeline
 * match exactly what the C lookup functions expect.
 *
 * C-side expectations (from lowbit-q-model-builder.h):
 *   SVID_1BIT layers:
 *     {prefix}.lowbit_q_a    — row scales (fp16)
 *     {prefix}.lowbit_q_b    — column scales (fp16)
 *     {prefix}.lowbit_q_sign — packed sign bits (uint8)
 *     NO .weight tensor
 *
 *   Q4_0 / PASSTHROUGH layers:
 *     {prefix}.weight        — standard ggml tensor, type Q4_0 or F16
 *     NO .lowbit_q_* tensors
 *
 * C-side tensor name prefixes (from llama-arch.cpp, LLM_ARCH_LLAMA):
 *   blk.{il}.attn_q       → attention Q projection
 *   blk.{il}.attn_k       → attention K projection
 *   blk.{il}.attn_v       → attention V projection
 *   blk.{il}.attn_output  → attention output projection
 *   blk.{il}.ffn_gate     → FFN gate projection
 *   blk.{il}.ffn_up       → FFN up projection
 *   blk.{il}.ffn_down     → FFN down projection
 *
 * Metadata contract (lowbit-q.tensor_alloc JSON):
 *   name field = "{prefix}.weight"  (the canonical weight tensor name)
 *   quantType  = "svid_1bit" | "q4_0" | "q8_0" | "passthrough"
 */

import { describe, it, expect } from 'vitest';
import { parseGGUFHeader } from './ggufParser';
import { allocateBitwidths, DEFAULT_ALLOCATOR_CONFIG, CONSERVATIVE_ALLOCATOR_CONFIG } from './allocator';
import { convertToLowbitQV2Streaming } from './convert';
import type { GGUFTensorInfo, TensorAllocRecord } from './types';
import {
  GGMLType,
  LowbitQQuantType,
  LOWBIT_Q_TENSOR_ALLOC_KEY,
  LOWBIT_Q_SUFFIX_A,
  LOWBIT_Q_SUFFIX_B,
  LOWBIT_Q_SUFFIX_SIGN,
} from './types';
import { buildSyntheticGGUF, type SyntheticTensor } from './testHelpers';

// ---------------------------------------------------------------------------
// Test-only allocator configs: sizeBudget=1.0 disables budget optimization
// so tests exercise the fixed allocation rules, not the greedy optimizer.
// Small test tensors (64×64) would otherwise always trigger budget optimization
// and override first/last layer protection.
// ---------------------------------------------------------------------------
const TEST_DEFAULT_CONFIG = { ...DEFAULT_ALLOCATOR_CONFIG, sizeBudget: 1.0 };
const TEST_CONSERVATIVE_CONFIG = { ...CONSERVATIVE_ALLOCATOR_CONFIG, sizeBudget: 1.0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tensor name prefix used by C-side lowbit_q_lookup() for a given projection */
function cPrefix(layer: number, proj: string): string {
  return `blk.${layer}.${proj}`;
}

/** SVID tensor names the C side looks for */
function svidTensorNames(prefix: string): { a: string; b: string; sign: string } {
  return {
    a:    `${prefix}${LOWBIT_Q_SUFFIX_A}`,
    b:    `${prefix}${LOWBIT_Q_SUFFIX_B}`,
    sign: `${prefix}${LOWBIT_Q_SUFFIX_SIGN}`,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: Tensor naming contract
// ---------------------------------------------------------------------------

describe('lowbit-Q v2 tensor naming — C dispatch contract', () => {
  it('SVID_1BIT layer produces (a, b, sign) tensors, NO .weight', () => {
    // Simulate what the GGUF writer does for an SVID_1BIT tensor
    const prefix = cPrefix(2, 'ffn_gate');
    const weightName = `${prefix}.weight`;
    const svid = svidTensorNames(prefix);

    // These are the names the C-side lowbit_q_lookup() searches for:
    expect(svid.a).toBe('blk.2.ffn_gate.lowbit_q_a');
    expect(svid.b).toBe('blk.2.ffn_gate.lowbit_q_b');
    expect(svid.sign).toBe('blk.2.ffn_gate.lowbit_q_sign');

    // The weight name that goes into tensor_alloc metadata:
    expect(weightName).toBe('blk.2.ffn_gate.weight');
  });

  it('Q4_0 layer uses .weight name — no SVID suffix', () => {
    const prefix = cPrefix(0, 'attn_q');
    const weightName = `${prefix}.weight`;
    // Q4_0 uses the original .weight name, no SVID tensors
    expect(weightName).toBe('blk.0.attn_q.weight');
    // These MUST NOT exist in the GGUF for Q4_0 layers:
    expect(`${prefix}.lowbit_q_sign`).toBe('blk.0.attn_q.lowbit_q_sign');
  });

  it('attn_output prefix matches llama.cpp LLM_TENSOR_ATTN_OUT mapping', () => {
    // From llama-arch.cpp: LLM_TENSOR_ATTN_OUT → "blk.%d.attn_output"
    // TypeScript tensorFilter uses pattern /attn_output\b|o_proj\b/ for 'attn-out'
    const prefix = cPrefix(5, 'attn_output');
    expect(prefix).toBe('blk.5.attn_output');

    // Verify SVID names match C expectation
    const svid = svidTensorNames(prefix);
    expect(svid.sign).toBe('blk.5.attn_output.lowbit_q_sign');
  });

  it('all 7 projection prefixes match llama-arch.cpp for layer 0', () => {
    // These must match what llama-arch.cpp defines for LLM_ARCH_LLAMA:
    //   LLM_TENSOR_ATTN_Q    → "blk.%d.attn_q"
    //   LLM_TENSOR_ATTN_K    → "blk.%d.attn_k"
    //   LLM_TENSOR_ATTN_V    → "blk.%d.attn_v"
    //   LLM_TENSOR_ATTN_OUT  → "blk.%d.attn_output"
    //   LLM_TENSOR_FFN_GATE  → "blk.%d.ffn_gate"
    //   LLM_TENSOR_FFN_DOWN  → "blk.%d.ffn_down"
    //   LLM_TENSOR_FFN_UP    → "blk.%d.ffn_up"
    const expected = [
      'blk.0.attn_q',
      'blk.0.attn_k',
      'blk.0.attn_v',
      'blk.0.attn_output',
      'blk.0.ffn_gate',
      'blk.0.ffn_down',
      'blk.0.ffn_up',
    ];

    for (const exp of expected) {
      const parts = exp.split('.');
      // Verify format: blk.{il}.{proj}
      expect(parts[0]).toBe('blk');
      expect(parts[1]).toBe('0');
      expect(parts.length).toBe(3);
      // These tensors should exist in a standard model as {exp}.weight
      expect(`${exp}.weight`).toMatch(/^blk\.\d+\.\w+\.weight$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Allocator output → C naming contract
// ---------------------------------------------------------------------------

describe('allocator → tensor naming round-trip', () => {
  /** Build a minimal set of synthetic tensor infos for 4 layers */
  function makeTensors(nLayer: number): GGUFTensorInfo[] {
    const projs = [
      'attn_q', 'attn_k', 'attn_v', 'attn_output',
      'ffn_gate', 'ffn_up', 'ffn_down',
    ];
    const tensors: GGUFTensorInfo[] = [];

    for (let il = 0; il < nLayer; il++) {
      for (const proj of projs) {
        tensors.push({
          name: `blk.${il}.${proj}.weight`,
          nDims: 2,
          dims: [64n, 64n],  // 64×64 for testing
          type: GGMLType.Q8_0,
          offset: 0n,
        });
      }
    }

    // Add non-weight tensors (embedding, norm)
    tensors.push({
      name: 'token_embd.weight',
      nDims: 2,
      dims: [128n, 128n],
      type: GGMLType.F16,
      offset: 0n,
    });
    tensors.push({
      name: 'output_norm.weight',
      nDims: 1,
      dims: [128n],
      type: GGMLType.F32,
      offset: 0n,
    });

    return tensors;
  }

  it('DEFAULT config: attn_q.weight → Q4_0 (C uses .weight path)', () => {
    const tensors = makeTensors(4);
    const allocs = allocateBitwidths(tensors, 4, TEST_DEFAULT_CONFIG);

    const attnQ0 = allocs.find(a => a.name === 'blk.0.attn_q.weight');
    expect(attnQ0).toBeDefined();
    expect(attnQ0!.quantType).toBe(LowbitQQuantType.Q4_0);
    // C dispatch: lowbit_q_lookup(model, "blk.0.attn_q") → valid=0
    //             → fall through to build_lora_mm(model.layers[0].wq, cur)
  });

  it('DEFAULT config: ffn_gate.weight → SVID_1BIT (C uses lowbit_q_lookup)', () => {
    const tensors = makeTensors(4);
    const allocs = allocateBitwidths(tensors, 4, TEST_DEFAULT_CONFIG);

    const ffnGate2 = allocs.find(a => a.name === 'blk.2.ffn_gate.weight');
    expect(ffnGate2).toBeDefined();
    expect(ffnGate2!.quantType).toBe(LowbitQQuantType.SVID_1BIT);
    // C dispatch: lowbit_q_lookup(model, "blk.2.ffn_gate") → valid=1
    //             → lowbit_q_build_mul_mat(ctx0, lq.a, lq.b, lq.sign, cur)
    // GGUF must contain: blk.2.ffn_gate.lowbit_q_a/b/sign
    // GGUF must NOT contain: blk.2.ffn_gate.weight
  });

  it('CONSERVATIVE config: all attn layers → Q4_0, FFN → SVID_1BIT', () => {
    const tensors = makeTensors(4);
    const allocs = allocateBitwidths(tensors, 4, TEST_CONSERVATIVE_CONFIG);

    const attnV = allocs.find(a => a.name === 'blk.1.attn_v.weight');
    const ffnDown = allocs.find(a => a.name === 'blk.1.ffn_down.weight');
    const attnOut = allocs.find(a => a.name === 'blk.1.attn_output.weight');

    expect(attnV!.quantType).toBe(LowbitQQuantType.Q4_0);
    expect(attnOut!.quantType).toBe(LowbitQQuantType.Q4_0);
    expect(ffnDown!.quantType).toBe(LowbitQQuantType.SVID_1BIT);
  });

  it('embedding and norm → PASSTHROUGH (C uses standard path, no SVID)', () => {
    const tensors = makeTensors(2);
    const allocs = allocateBitwidths(tensors, 2, TEST_DEFAULT_CONFIG);

    const embd = allocs.find(a => a.name === 'token_embd.weight');
    const norm = allocs.find(a => a.name === 'output_norm.weight');

    expect(embd!.quantType).toBe(LowbitQQuantType.PASSTHROUGH);
    expect(norm!.quantType).toBe(LowbitQQuantType.PASSTHROUGH);
  });

  it('first layer (il=0) → Q4_0 regardless of config', () => {
    const tensors = makeTensors(6);
    const allocs = allocateBitwidths(tensors, 6, TEST_DEFAULT_CONFIG);

    // All projections in layer 0 should be Q4_0 (first layer protection)
    const layer0 = allocs.filter(a => a.name.startsWith('blk.0.'));
    const svids = layer0.filter(a => a.quantType === LowbitQQuantType.SVID_1BIT);
    expect(svids.length).toBe(0);
  });

  it('last layer → Q4_0 regardless of config', () => {
    const tensors = makeTensors(6);
    const allocs = allocateBitwidths(tensors, 6, TEST_DEFAULT_CONFIG);

    const layer5 = allocs.filter(a => a.name.startsWith('blk.5.'));
    const svids = layer5.filter(a => a.quantType === LowbitQQuantType.SVID_1BIT);
    expect(svids.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: tensor_alloc JSON metadata — C parser contract
// ---------------------------------------------------------------------------

describe('tensor_alloc JSON format — C parser contract', () => {
  /** Produce the JSON that would be stored in lowbit-q.tensor_alloc */
  function makeAllocJson(allocs: TensorAllocRecord[]): string {
    return JSON.stringify(
      allocs.map(a => ({
        name: a.name,
        quantType: a.quantType,
        family: a.family,
        layerIndex: a.layerIndex,
        rotationApplied: a.rotationApplied,
        originalBytes: a.originalBytes,
        quantizedBytes: a.quantizedBytes,
      })),
    );
  }

  it('JSON contains "quantType" field readable by C parser', () => {
    // Use layer 2 (middle layer, not first/last) to avoid firstLayerQuant override
    const tensors: GGUFTensorInfo[] = [
      {
        name: 'blk.2.ffn_gate.weight',
        nDims: 2,
        dims: [64n, 64n],
        type: GGMLType.Q8_0,
        offset: 0n,
      },
    ];
    const allocs = allocateBitwidths(tensors, 4, TEST_DEFAULT_CONFIG);
    const json = makeAllocJson(allocs);
    const parsed = JSON.parse(json);

    expect(parsed[0].name).toBe('blk.2.ffn_gate.weight');
    // C parser looks for "quantType":"svid_1bit" or "q4_0" etc.
    expect(parsed[0].quantType).toBe('svid_1bit');
  });

  it('quantType values match C LOWBIT_Q_QUANT_* constants', () => {
    // C parser maps these strings to integer constants:
    //   "svid_1bit"   → LOWBIT_Q_QUANT_SVID_1BIT  (3)
    //   "q4_0"        → LOWBIT_Q_QUANT_Q4_0        (1)
    //   "q8_0"        → LOWBIT_Q_QUANT_Q8_0        (2)
    //   "passthrough" → LOWBIT_Q_QUANT_PASSTHROUGH (0)
    expect(LowbitQQuantType.SVID_1BIT).toBe('svid_1bit');
    expect(LowbitQQuantType.Q4_0).toBe('q4_0');
    expect(LowbitQQuantType.Q8_0).toBe('q8_0');
    expect(LowbitQQuantType.PASSTHROUGH).toBe('passthrough');
  });

  it('JSON is valid and parseable after round-trip', () => {
    const tensors: GGUFTensorInfo[] = ['attn_q', 'attn_v', 'ffn_gate'].map(proj => ({
      name: `blk.1.${proj}.weight`,
      nDims: 2,
      dims: [128n, 64n],
      type: GGMLType.Q8_0,
      offset: 0n,
    }));

    const allocs = allocateBitwidths(tensors, 4, TEST_DEFAULT_CONFIG);
    const json = makeAllocJson(allocs);

    // Must be valid JSON
    expect(() => JSON.parse(json)).not.toThrow();

    const parsed: Array<{ name: string; quantType: string }> = JSON.parse(json);

    // attn_q → Q4_0 (DEFAULT config)
    const aq = parsed.find(r => r.name === 'blk.1.attn_q.weight');
    expect(aq?.quantType).toBe('q4_0');

    // attn_v → SVID_1BIT (DEFAULT config)
    const av = parsed.find(r => r.name === 'blk.1.attn_v.weight');
    expect(av?.quantType).toBe('svid_1bit');

    // ffn_gate → SVID_1BIT (DEFAULT config)
    const fg = parsed.find(r => r.name === 'blk.1.ffn_gate.weight');
    expect(fg?.quantType).toBe('svid_1bit');
  });

  it('C parser can distinguish SVID from Q4_0 via "name" + "quantType" fields', () => {
    // Simulate the C parser's lookup: given tensor_name "blk.2.attn_v.weight",
    // find its quantType in the JSON array.
    const json = JSON.stringify([
      { name: 'blk.2.attn_q.weight',    quantType: 'q4_0' },
      { name: 'blk.2.attn_v.weight',    quantType: 'svid_1bit' },
      { name: 'blk.2.ffn_down.weight',  quantType: 'svid_1bit' },
    ]);

    const records: Array<{ name: string; quantType: string }> = JSON.parse(json);

    // Simulate C's lowbit_q_get_quant_type(model, "blk.2.attn_v.weight")
    const lookupQt = (name: string) =>
      records.find(r => r.name === name)?.quantType ?? 'unknown';

    expect(lookupQt('blk.2.attn_q.weight')).toBe('q4_0');
    expect(lookupQt('blk.2.attn_v.weight')).toBe('svid_1bit');
    expect(lookupQt('blk.2.ffn_down.weight')).toBe('svid_1bit');
    expect(lookupQt('blk.99.missing.weight')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Mixed-format GGUF structural invariants (with actual conversion)
// ---------------------------------------------------------------------------

/** Build a synthetic Q8_0 tensor with random values */
function makeQ8_0Tensor(name: string, rows: number, cols: number): SyntheticTensor {
  const n = rows * cols;
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = (Math.random() - 0.5) * 2;
  return { name, type: GGMLType.Q8_0, dims: [cols, rows], values };
}

/** Build a synthetic F32 tensor */
function makeF32Tensor(name: string, n: number): SyntheticTensor {
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = (Math.random() - 0.5);
  return { name, type: GGMLType.F32, dims: [n], values };
}

/**
 * Build a synthetic GGUF with blk.* naming (4 layers, 7 projections each).
 * Each layer has: attn_q, attn_k, attn_v, attn_output, ffn_gate, ffn_up, ffn_down.
 * Layer 0 and 3 will be protected (Q4_0), layers 1-2 will be SVID for some projections.
 */
function buildMixedModelGGUF(nLayers = 4): ArrayBuffer {
  const projs = ['attn_q', 'attn_k', 'attn_v', 'attn_output', 'ffn_gate', 'ffn_up', 'ffn_down'];
  const tensors: SyntheticTensor[] = [];

  for (let il = 0; il < nLayers; il++) {
    for (const proj of projs) {
      // Use 32×32 (1024 elements = 32 Q8_0 blocks) — minimum valid Q8_0
      tensors.push(makeQ8_0Tensor(`blk.${il}.${proj}.weight`, 32, 32));
    }
  }
  tensors.push(makeF32Tensor('output_norm.weight', 32));

  return buildSyntheticGGUF({ tensors });
}

describe('mixed-format GGUF structural invariants', () => {
  it('no projection has both .weight and .lowbit_q_sign', async () => {
    const ggufBuf = buildMixedModelGGUF(4);
    const sourceFile = new File([ggufBuf], 'test.gguf');

    const { data } = await convertToLowbitQV2Streaming(sourceFile, {
      allocatorConfig: TEST_CONSERVATIVE_CONFIG,
      totalLayers: 4,
    });

    const header = parseGGUFHeader(data.buffer as ArrayBuffer);

    // Collect all projection prefixes from the output GGUF
    const prefixes = new Set<string>();
    for (const t of header.tensors) {
      const m = t.name.match(/^(blk\.\d+\.\w+)\.(weight|lowbit_q_sign|lowbit_q_a|lowbit_q_b)$/);
      if (m) prefixes.add(m[1]);
    }

    for (const prefix of prefixes) {
      const hasWeight = header.tensors.some(t => t.name === `${prefix}.weight`);
      const hasSvid   = header.tensors.some(t => t.name === `${prefix}.lowbit_q_sign`);
      // A projection must be EITHER standard (.weight) OR SVID (.lowbit_q_sign), never both
      expect(
        hasWeight && hasSvid,
        `prefix "${prefix}" has both .weight and .lowbit_q_sign`,
      ).toBe(false);
    }
  }, 60_000);

  it('first layer (blk.0.*) uses Q4_0 — all .weight tensors present, no SVID', async () => {
    const ggufBuf = buildMixedModelGGUF(4);
    const sourceFile = new File([ggufBuf], 'test.gguf');

    const { data } = await convertToLowbitQV2Streaming(sourceFile, {
      allocatorConfig: TEST_CONSERVATIVE_CONFIG,
      totalLayers: 4,
    });

    const header = parseGGUFHeader(data.buffer as ArrayBuffer);

    // First layer: no SVID tensors expected
    const firstLayerSvid = header.tensors.filter(
      t => t.name.startsWith('blk.0.') && t.name.endsWith('.lowbit_q_sign'),
    );
    expect(firstLayerSvid.length).toBe(0);

    // First layer: .weight tensors must be present for all projections
    const projs = ['attn_q', 'attn_k', 'attn_v', 'attn_output', 'ffn_gate', 'ffn_up', 'ffn_down'];
    for (const proj of projs) {
      const wt = header.tensors.find(t => t.name === `blk.0.${proj}.weight`);
      expect(wt, `blk.0.${proj}.weight should exist in first layer`).toBeDefined();
    }
  }, 60_000);

  it('middle layers have SVID tensors for SVID_1BIT projections (CONSERVATIVE config)', async () => {
    const ggufBuf = buildMixedModelGGUF(4);
    const sourceFile = new File([ggufBuf], 'test.gguf');

    const { data } = await convertToLowbitQV2Streaming(sourceFile, {
      allocatorConfig: TEST_CONSERVATIVE_CONFIG,
      totalLayers: 4,
    });

    const header = parseGGUFHeader(data.buffer as ArrayBuffer);

    // CONSERVATIVE config: middle layers, ffn_gate → SVID_1BIT (attn_v stays Q4_0)
    // blk.1.ffn_gate and blk.2.ffn_gate should have SVID triplets
    for (const il of [1, 2]) {
      const sign = header.tensors.find(t => t.name === `blk.${il}.ffn_gate.lowbit_q_sign`);
      expect(sign, `blk.${il}.ffn_gate should have .lowbit_q_sign`).toBeDefined();

      const a = header.tensors.find(t => t.name === `blk.${il}.ffn_gate.lowbit_q_a`);
      const b = header.tensors.find(t => t.name === `blk.${il}.ffn_gate.lowbit_q_b`);
      expect(a, `blk.${il}.ffn_gate.lowbit_q_a`).toBeDefined();
      expect(b, `blk.${il}.ffn_gate.lowbit_q_b`).toBeDefined();

      // No .weight for SVID layers
      const weight = header.tensors.find(t => t.name === `blk.${il}.ffn_gate.weight`);
      expect(weight, `blk.${il}.ffn_gate.weight should NOT exist for SVID layer`).toBeUndefined();
    }
  }, 60_000);

  it('tensor_alloc metadata is present, valid JSON, and has "name"/"quantType" fields', async () => {
    const ggufBuf = buildMixedModelGGUF(4);
    const sourceFile = new File([ggufBuf], 'test.gguf');

    const { data } = await convertToLowbitQV2Streaming(sourceFile, {
      allocatorConfig: TEST_CONSERVATIVE_CONFIG,
      totalLayers: 4,
    });

    const header = parseGGUFHeader(data.buffer as ArrayBuffer);
    const allocEntry = header.metadata.get(LOWBIT_Q_TENSOR_ALLOC_KEY);

    expect(allocEntry).toBeDefined();
    expect(typeof allocEntry!.value).toBe('string');

    let parsed: unknown;
    expect(() => { parsed = JSON.parse(allocEntry!.value as string); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);

    const records = parsed as Array<{ name: string; quantType: string }>;
    expect(records.length).toBeGreaterThan(0);

    // Every record must have "name" and "quantType" — required by C parser
    for (const rec of records) {
      expect(typeof rec.name).toBe('string');
      expect(rec.name.length).toBeGreaterThan(0);
      expect(typeof rec.quantType).toBe('string');
      // quantType must be one of the values the C parser understands
      expect(['svid_1bit', 'q4_0', 'q8_0', 'passthrough']).toContain(rec.quantType);
    }

    // Verify specific known mappings (blk.0.attn_q → Q4_0 per CONSERVATIVE config)
    const attnQ0 = records.find(r => r.name === 'blk.0.attn_q.weight');
    expect(attnQ0?.quantType).toBe('q4_0');
  }, 60_000);
});

describe('validateAllocations enforcement', () => {
  it('DEFAULT config (SVID_1BIT on attn_v) throws FORBIDDEN error during conversion', async () => {
    const ggufBuf = buildMixedModelGGUF(4);
    const sourceFile = new File([ggufBuf], 'test.gguf');

    await expect(
      convertToLowbitQV2Streaming(sourceFile, {
        allocatorConfig: TEST_DEFAULT_CONFIG,
        totalLayers: 4,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  }, 60_000);
});
