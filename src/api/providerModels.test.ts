import { describe, it, expect } from 'vitest';
import { isReasoningModel } from './providerModels';

describe('isReasoningModel', () => {
  // Should match
  const positives = [
    'o1',
    'o1-mini',
    'o1-preview',
    'o3',
    'o3-mini',
    'o4-mini',
    'openai/o1-mini',
    'openai/o3-mini',
    'deepseek-r1',
    'deepseek-r1-distill-qwen-32b',
    'deepseek-reasoner',
    'qwq-32b',
    'qwq-32b-preview',
    'anthropic/claude-3.5-sonnet:thinking',
    'claude-3-opus-thinking',
  ];

  // Should NOT match
  const negatives = [
    'gpt-4o',
    'gpt-4o-mini',
    'falcon-40b-instruct',
    'photo1-model',
    'proto1-v2',
    'polaris-model',
    'llama-3-70b',
    'claude-3.5-sonnet',
    'gemini-pro',
    'mistral-large',
    'command-r-plus',
  ];

  for (const id of positives) {
    it(`matches reasoning model: ${id}`, () => {
      expect(isReasoningModel(id)).toBe(true);
    });
  }

  for (const id of negatives) {
    it(`rejects non-reasoning model: ${id}`, () => {
      expect(isReasoningModel(id)).toBe(false);
    });
  }
});
