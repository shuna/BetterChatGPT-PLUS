import { describe, expect, it } from 'vitest';
import { hasLoadedProviderModels } from './providerMenuHelpers';

describe('hasLoadedProviderModels', () => {
  it('treats an empty model array as already loaded', () => {
    expect(hasLoadedProviderModels({ openai: [] }, 'openai')).toBe(true);
  });

  it('returns false when a provider has never been loaded', () => {
    expect(hasLoadedProviderModels({ openrouter: [] }, 'openai')).toBe(false);
  });
});
