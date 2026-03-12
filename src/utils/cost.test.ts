import { describe, expect, it, vi } from 'vitest';

vi.mock('@utils/modelLookup', () => ({
  getModelCost: vi.fn(),
  isKnownModel: vi.fn(),
}));

import {
  buildTokenUsageKey,
  calculateUsageCost,
  countImageInputs,
  mergeTotalTokenUsed,
  parseTokenKey,
} from './cost';
import { getModelCost, isKnownModel } from '@utils/modelLookup';

describe('cost utils', () => {
  it('parses model and provider composite keys', () => {
    expect(parseTokenKey('gpt-4o:::openai')).toEqual({
      modelId: 'gpt-4o',
      providerId: 'openai',
    });
    expect(parseTokenKey('gpt-4o')).toEqual({ modelId: 'gpt-4o' });
    expect(buildTokenUsageKey('gpt-4o', 'openai')).toBe('gpt-4o:::openai');
    expect(buildTokenUsageKey('gpt-4o')).toBe('gpt-4o');
  });

  it('counts image inputs by image content entries', () => {
    expect(
      countImageInputs([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image_url', image_url: { url: 'a', detail: 'auto' } },
            { type: 'image_url', image_url: { url: 'b', detail: 'low' } },
          ],
        },
      ])
    ).toBe(2);
  });

  it('calculates known usage cost including image units', () => {
    vi.mocked(getModelCost).mockReturnValue({
      prompt: { price: 2, unit: 1_000_000 },
      completion: { price: 8, unit: 1_000_000 },
      image: { price: 0.01, unit: 1 },
    });

    expect(
      calculateUsageCost(
        {
          promptTokens: 500_000,
          completionTokens: 250_000,
          imageTokens: 2,
        },
        'gpt-4o',
        'openai'
      )
    ).toEqual({ kind: 'known', cost: 3.02, isFree: false });
  });

  it('marks zero-priced models as free', () => {
    vi.mocked(getModelCost).mockReturnValue({
      prompt: { price: 0, unit: 1 },
      completion: { price: 0, unit: 1 },
      image: { price: 0, unit: 1 },
    });

    expect(
      calculateUsageCost(
        { promptTokens: 10, completionTokens: 20, imageTokens: 1 },
        'free-model'
      )
    ).toEqual({ kind: 'known', cost: 0, isFree: true });
  });

  it('reports missing pricing separately from unknown models', () => {
    vi.mocked(getModelCost).mockReturnValue(undefined);
    vi.mocked(isKnownModel).mockReturnValue(true);
    expect(
      calculateUsageCost(
        { promptTokens: 1, completionTokens: 0, imageTokens: 0 },
        'known-model'
      )
    ).toEqual({ kind: 'unknown', reason: 'no-pricing-data' });

    vi.mocked(isKnownModel).mockReturnValue(false);
    expect(
      calculateUsageCost(
        { promptTokens: 1, completionTokens: 0, imageTokens: 0 },
        'unknown-model'
      )
    ).toEqual({ kind: 'unknown', reason: 'model-not-registered' });
  });

  it('merges persisted and live usage by composite model key', () => {
    expect(
      mergeTotalTokenUsed(
        {
          'gpt-4o:::openai': {
            promptTokens: 100,
            completionTokens: 50,
            imageTokens: 1,
          },
        },
        {
          'gpt-4o:::openai': {
            promptTokens: 20,
            completionTokens: 10,
            imageTokens: 0,
          },
          'gpt-4.1:::openai': {
            promptTokens: 30,
            completionTokens: 5,
            imageTokens: 0,
          },
        }
      )
    ).toEqual({
      'gpt-4o:::openai': {
        promptTokens: 120,
        completionTokens: 60,
        imageTokens: 1,
      },
      'gpt-4.1:::openai': {
        promptTokens: 30,
        completionTokens: 5,
        imageTokens: 0,
      },
    });
  });
});
