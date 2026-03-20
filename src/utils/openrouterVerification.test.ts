import { describe, expect, it } from 'vitest';

import {
  OPENROUTER_VERIFICATION_INITIAL_DELAY_MS,
  OPENROUTER_VERIFICATION_MAX_DELAY_MS,
  buildVerifiedStatsKey,
  getOpenRouterVerificationRetryDelay,
  resolveOpenRouterApiKey,
} from './openrouterVerification';

describe('openrouterVerification utils', () => {
  it('builds verified stats keys from chat and node ids', () => {
    expect(buildVerifiedStatsKey('chat-1', 'node-2')).toBe('chat-1:::node-2');
  });

  it('uses exponential backoff capped at the max delay', () => {
    expect(getOpenRouterVerificationRetryDelay(0)).toBe(
      OPENROUTER_VERIFICATION_INITIAL_DELAY_MS
    );
    expect(getOpenRouterVerificationRetryDelay(1)).toBe(
      OPENROUTER_VERIFICATION_INITIAL_DELAY_MS
    );
    expect(getOpenRouterVerificationRetryDelay(2)).toBe(
      OPENROUTER_VERIFICATION_INITIAL_DELAY_MS * 2
    );
    expect(getOpenRouterVerificationRetryDelay(10)).toBe(
      OPENROUTER_VERIFICATION_MAX_DELAY_MS
    );
  });

  it('prefers the provider api key when available', () => {
    expect(
      resolveOpenRouterApiKey(
        {
          id: 'openrouter',
          name: 'OpenRouter',
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          modelsEndpoint: 'https://openrouter.ai/api/v1/models',
          modelsRequireAuth: false,
          apiKey: 'provider-key',
        },
        'https://openrouter.ai/api/v1/chat/completions',
        'fallback-key'
      )
    ).toBe('provider-key');
  });

  it('falls back to the legacy top-level key for openrouter endpoints', () => {
    expect(
      resolveOpenRouterApiKey(
        undefined,
        'https://openrouter.ai/api/v1/chat/completions',
        'fallback-key'
      )
    ).toBe('fallback-key');
  });

  it('does not return the fallback key for non-openrouter endpoints', () => {
    expect(
      resolveOpenRouterApiKey(
        undefined,
        'https://api.openai.com/v1/chat/completions',
        'fallback-key'
      )
    ).toBeUndefined();
  });
});
