import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNKNOWN_MODEL_CONTEXT_LENGTH } from './tokenBudget';

vi.mock('@store/store', () => ({
  default: {
    getState: vi.fn(),
  },
}));

import useStore from '@store/store';
import { getModelContextInfo, getModelCost } from './modelLookup';

describe('modelLookup cost units', () => {
  beforeEach(() => {
    vi.mocked(useStore.getState).mockReturnValue({
      providerCustomModels: {},
      favoriteModels: [
        {
          modelId: 'anthropic/claude-opus-4.6',
          providerId: 'openrouter',
          promptPrice: 5,
          completionPrice: 25,
        },
      ],
      providerModelCache: {},
    } as never);
  });

  it('treats prompt and completion prices as per-million-token prices', () => {
    expect(getModelCost('anthropic/claude-opus-4.6', 'openrouter')).toEqual({
      prompt: { price: 5, unit: 1_000_000 },
      completion: { price: 25, unit: 1_000_000 },
      image: { price: null, unit: 1 },
    });
  });

  it('uses a conservative fallback context length for unknown models', () => {
    expect(getModelContextInfo('unknown-model', 'openai')).toEqual({
      contextLength: UNKNOWN_MODEL_CONTEXT_LENGTH,
      isFallback: true,
    });
  });
});
