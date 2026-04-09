import { describe, expect, it } from 'vitest';
import { convertToLowbitQ } from './convert';
import { GGMLType } from './types';
import { buildToyModelGGUF } from './testHelpers';
import {
  appendValidationRun,
  inspectLowbitQMetadata,
  summarizeOutputComparison,
  VALIDATION_PROMPTS,
  DIAGNOSIS_PROMPT_IDS,
} from './validation';

describe('lowbit-Q validation helpers', () => {
  it('inspects lowbit-Q metadata from a converted GGUF blob', async () => {
    const { buffer } = buildToyModelGGUF({
      weightType: GGMLType.F32,
      outFeatures: 8,
      inFeatures: 16,
    });
    const converted = convertToLowbitQ(buffer);
    const blob = new Blob([converted.data], { type: 'application/octet-stream' });

    const summary = await inspectLowbitQMetadata(blob);

    expect(summary.hasLowbitQVersion).toBe(true);
    expect(summary.lowbitQVersion).toBe(1);
    expect(summary.signPacking).toBe('msb_first');
    expect(summary.lowbitQTensorCount).toBeGreaterThan(0);
  });

  it('summarizes output comparison deterministically', () => {
    expect(summarizeOutputComparison('abc', 'ab')).toEqual({
      exactMatch: false,
      originalLength: 3,
      lowbitQLength: 2,
      lengthDelta: -1,
    });
  });

  it('keeps only the latest 50 saved runs', () => {
    const initial = Array.from({ length: 50 }, (_, index) => ({
      id: `run-${index}`,
      promptId: 'p',
      prompt: 'hello',
      variant: 'original' as const,
      modelId: 'm',
      maxTokens: 16,
      temperature: 0.2,
      output: String(index),
      createdAt: new Date(0).toISOString(),
    }));

    const next = appendValidationRun(initial, {
      id: 'latest',
      promptId: 'p',
      prompt: 'hello',
      variant: 'lowbit-q',
      modelId: 'm2',
      maxTokens: 16,
      temperature: 0.2,
      output: 'latest',
      createdAt: new Date(1).toISOString(),
    });

    expect(next).toHaveLength(50);
    expect(next[0]?.id).toBe('latest');
    expect(next.some((run) => run.id === 'run-49')).toBe(false);
  });
});

describe('VALIDATION_PROMPTS and DIAGNOSIS_PROMPT_IDS', () => {
  it('has exactly 9 prompt presets', () => {
    expect(VALIDATION_PROMPTS).toHaveLength(9);
  });

  it('all prompt IDs are unique', () => {
    const ids = VALIDATION_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all prompts have non-empty label and prompt text', () => {
    for (const p of VALIDATION_PROMPTS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.prompt.length).toBeGreaterThan(0);
    }
  });

  it('DIAGNOSIS_PROMPT_IDS references all validation prompt IDs', () => {
    const promptIds = VALIDATION_PROMPTS.map((p) => p.id);
    expect(DIAGNOSIS_PROMPT_IDS).toEqual(promptIds);
  });

  it('DIAGNOSIS_PROMPT_IDS has no duplicates', () => {
    expect(new Set(DIAGNOSIS_PROMPT_IDS).size).toBe(DIAGNOSIS_PROMPT_IDS.length);
  });
});
