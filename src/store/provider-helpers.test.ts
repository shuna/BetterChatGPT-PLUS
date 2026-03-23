import { describe, expect, it } from 'vitest';

import type { FavoriteModel, ProviderModel } from '@type/provider';
import { DEFAULT_PROVIDERS } from './provider-config';
import {
  backfillFavoritesFromProviderModels,
  normalizeProviderConfig,
  normalizeProviderConfigs,
  toggleFavoriteModelEntry,
  updateProviderConfig,
} from './provider-helpers';

describe('provider-helpers', () => {
  it('updates only the targeted provider config field', () => {
    const updatedProviders = updateProviderConfig(DEFAULT_PROVIDERS, 'openai', {
      apiKey: 'secret-key',
    });

    expect(updatedProviders.openai.apiKey).toBe('secret-key');
    expect(updatedProviders.openai.endpoint).toBe(DEFAULT_PROVIDERS.openai.endpoint);
    expect(updatedProviders.openrouter).toEqual(DEFAULT_PROVIDERS.openrouter);
  });

  it('restores the default endpoint when a provider endpoint is blank', () => {
    const updatedProviders = updateProviderConfig(DEFAULT_PROVIDERS, 'openrouter', {
      endpoint: '   ',
    });

    expect(updatedProviders.openrouter.endpoint).toBe(
      DEFAULT_PROVIDERS.openrouter.endpoint
    );
  });

  it('normalizes persisted provider maps against defaults', () => {
    const normalized = normalizeProviderConfigs({
      openrouter: {
        ...DEFAULT_PROVIDERS.openrouter,
        endpoint: '',
      },
    });

    expect(normalized.openrouter.endpoint).toBe(
      DEFAULT_PROVIDERS.openrouter.endpoint
    );
    expect(normalized.openai).toEqual(DEFAULT_PROVIDERS.openai);
  });

  it('fills in missing fields when normalizing a single provider', () => {
    expect(
      normalizeProviderConfig('openrouter', {
        id: 'openrouter',
        name: 'Custom OpenRouter',
        endpoint: '',
        modelsRequireAuth: false,
      }).endpoint
    ).toBe(DEFAULT_PROVIDERS.openrouter.endpoint);
  });

  it('toggles favorite model entries by provider and model id', () => {
    const favorite: FavoriteModel = {
      modelId: 'gpt-4o',
      providerId: 'openai',
      promptPrice: 1,
      completionPrice: 2,
    };

    const added = toggleFavoriteModelEntry([], favorite);
    expect(added).toEqual([favorite]);

    const removed = toggleFavoriteModelEntry(added, favorite);
    expect(removed).toEqual([]);
  });

  it('back-fills missing favorite metadata from provider models', () => {
    const favorite: FavoriteModel = {
      modelId: 'anthropic/claude-sonnet-4',
      providerId: 'openrouter',
    };
    const providerModel: ProviderModel = {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      providerId: 'openrouter',
      contextLength: 200000,
      promptPrice: 3,
      completionPrice: 15,
      modelType: 'text',
      streamSupport: true,
      supportsReasoning: false,
      supportsVision: true,
      supportsAudio: false,
    };

    expect(
      backfillFavoritesFromProviderModels([favorite], 'openrouter', [providerModel])
    ).toEqual([
      {
        ...favorite,
        contextLength: 200000,
        promptPrice: 3,
        completionPrice: 15,
        modelType: 'text',
        streamSupport: true,
        supportsReasoning: false,
        supportsVision: true,
        supportsAudio: false,
      },
    ]);
  });

  it('preserves existing favorite metadata when back-filling from provider models', () => {
    const favorite: FavoriteModel = {
      modelId: 'anthropic/claude-sonnet-4',
      providerId: 'openrouter',
      contextLength: 123456,
      promptPrice: 9,
      completionPrice: 21,
      modelType: 'text',
      streamSupport: false,
      supportsReasoning: true,
      supportsVision: false,
      supportsAudio: true,
    };
    const providerModel: ProviderModel = {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      providerId: 'openrouter',
      contextLength: 200000,
      promptPrice: 3,
      completionPrice: 15,
      modelType: 'image',
      streamSupport: true,
      supportsReasoning: false,
      supportsVision: true,
      supportsAudio: false,
    };

    expect(
      backfillFavoritesFromProviderModels([favorite], 'openrouter', [providerModel])
    ).toEqual([favorite]);
  });
});
