import { describe, it, expect } from 'vitest';
import {
  classifyTensorFamily,
  extractLayerIndex,
  createTensorFilter,
  type LowbitQConvertMode,
} from './tensorFilter';

// ---------------------------------------------------------------------------
// classifyTensorFamily
// ---------------------------------------------------------------------------

describe('classifyTensorFamily', () => {
  it('classifies attn_q as attn-q', () => {
    expect(classifyTensorFamily('blk.0.attn_q.weight')).toBe('attn-q');
  });

  it('classifies q_proj as attn-q', () => {
    expect(classifyTensorFamily('model.layers.5.self_attn.q_proj.weight')).toBe('attn-q');
  });

  it('classifies attn_k as attn-k', () => {
    expect(classifyTensorFamily('blk.3.attn_k.weight')).toBe('attn-k');
  });

  it('classifies attn_v as attn-v', () => {
    expect(classifyTensorFamily('blk.0.attn_v.weight')).toBe('attn-v');
  });

  it('classifies attn_output as attn-out', () => {
    expect(classifyTensorFamily('blk.0.attn_output.weight')).toBe('attn-out');
  });

  it('classifies o_proj as attn-out', () => {
    expect(classifyTensorFamily('model.layers.0.self_attn.o_proj.weight')).toBe('attn-out');
  });

  it('classifies ffn_gate as ffn-gate', () => {
    expect(classifyTensorFamily('blk.0.ffn_gate.weight')).toBe('ffn-gate');
  });

  it('classifies ffn_down as ffn-down', () => {
    expect(classifyTensorFamily('blk.0.ffn_down.weight')).toBe('ffn-down');
  });

  it('classifies ffn_up as ffn-up', () => {
    expect(classifyTensorFamily('blk.0.ffn_up.weight')).toBe('ffn-up');
  });

  it('classifies gate_proj as ffn-gate', () => {
    expect(classifyTensorFamily('model.layers.0.mlp.gate_proj.weight')).toBe('ffn-gate');
  });

  it('classifies unknown tensors as other', () => {
    expect(classifyTensorFamily('token_embd.weight')).toBe('other');
    expect(classifyTensorFamily('output.weight')).toBe('other');
    expect(classifyTensorFamily('blk.0.attn_norm.weight')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// extractLayerIndex
// ---------------------------------------------------------------------------

describe('extractLayerIndex', () => {
  it('extracts from blk.N pattern', () => {
    expect(extractLayerIndex('blk.0.attn_q.weight')).toBe(0);
    expect(extractLayerIndex('blk.21.ffn_down.weight')).toBe(21);
  });

  it('extracts from layers.N pattern', () => {
    expect(extractLayerIndex('model.layers.12.self_attn.q_proj.weight')).toBe(12);
  });

  it('returns null for non-layer tensors', () => {
    expect(extractLayerIndex('token_embd.weight')).toBeNull();
    expect(extractLayerIndex('output.weight')).toBeNull();
    expect(extractLayerIndex('output_norm.weight')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createTensorFilter
// ---------------------------------------------------------------------------

describe('createTensorFilter', () => {
  // Sample tensor names
  const attnQ = 'blk.0.attn_q.weight';
  const attnK = 'blk.0.attn_k.weight';
  const attnV = 'blk.0.attn_v.weight';
  const attnOut = 'blk.0.attn_output.weight';
  const ffnGate = 'blk.0.ffn_gate.weight';
  const ffnDown = 'blk.0.ffn_down.weight';
  const ffnUp = 'blk.0.ffn_up.weight';
  const norm = 'blk.0.attn_norm.weight';
  const embd = 'token_embd.weight';
  const output = 'output.weight';

  it('all mode: includes all weight tensors, excludes non-weight', () => {
    const filter = createTensorFilter('all');
    expect(filter(attnQ)).toBe(true);
    expect(filter(ffnDown)).toBe(true);
    expect(filter(norm)).toBe(false);
    expect(filter(embd)).toBe(false);
    expect(filter(output)).toBe(false);
  });

  it('attention-only: includes Q/K/V/O, excludes FFN', () => {
    const filter = createTensorFilter('attention-only');
    expect(filter(attnQ)).toBe(true);
    expect(filter(attnK)).toBe(true);
    expect(filter(attnV)).toBe(true);
    expect(filter(attnOut)).toBe(true);
    expect(filter(ffnGate)).toBe(false);
    expect(filter(ffnDown)).toBe(false);
    expect(filter(ffnUp)).toBe(false);
  });

  it('ffn-only: includes gate/down/up, excludes attention', () => {
    const filter = createTensorFilter('ffn-only');
    expect(filter(ffnGate)).toBe(true);
    expect(filter(ffnDown)).toBe(true);
    expect(filter(ffnUp)).toBe(true);
    expect(filter(attnQ)).toBe(false);
    expect(filter(attnOut)).toBe(false);
  });

  it('attn-qkv-only: includes Q/K/V, excludes output', () => {
    const filter = createTensorFilter('attn-qkv-only');
    expect(filter(attnQ)).toBe(true);
    expect(filter(attnK)).toBe(true);
    expect(filter(attnV)).toBe(true);
    expect(filter(attnOut)).toBe(false);
    expect(filter(ffnGate)).toBe(false);
  });

  it('attn-out-only: includes only attn_output', () => {
    const filter = createTensorFilter('attn-out-only');
    expect(filter(attnOut)).toBe(true);
    expect(filter(attnQ)).toBe(false);
    expect(filter(ffnDown)).toBe(false);
  });

  it('ffn-up-only: includes only ffn_up', () => {
    const filter = createTensorFilter('ffn-up-only');
    expect(filter(ffnUp)).toBe(true);
    expect(filter(ffnDown)).toBe(false);
    expect(filter(ffnGate)).toBe(false);
    expect(filter(attnQ)).toBe(false);
  });

  it('ffn-down-only: includes only ffn_down', () => {
    const filter = createTensorFilter('ffn-down-only');
    expect(filter(ffnDown)).toBe(true);
    expect(filter(ffnUp)).toBe(false);
    expect(filter(ffnGate)).toBe(false);
  });

  it('always excludes non-weight tensors regardless of mode', () => {
    const modes: LowbitQConvertMode[] = [
      'all', 'attention-only', 'ffn-only', 'attn-qkv-only',
      'attn-out-only', 'ffn-up-only', 'ffn-down-only',
    ];
    for (const mode of modes) {
      const filter = createTensorFilter(mode);
      expect(filter(norm)).toBe(false);
      expect(filter(embd)).toBe(false);
      expect(filter(output)).toBe(false);
    }
  });
});
