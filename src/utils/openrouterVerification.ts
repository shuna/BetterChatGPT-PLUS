import { DEFAULT_PROVIDERS } from '@store/provider-config';
import type { ProviderConfig } from '@type/provider';

export const OPENROUTER_VERIFICATION_INITIAL_DELAY_MS = 10000;
export const OPENROUTER_VERIFICATION_MAX_DELAY_MS = 120000;

export const buildVerifiedStatsKey = (chatId: string, targetNodeId: string): string =>
  `${chatId}:::${targetNodeId}`;

export const getOpenRouterVerificationRetryDelay = (attemptCount: number): number =>
  Math.min(
    OPENROUTER_VERIFICATION_INITIAL_DELAY_MS * Math.max(1, 2 ** Math.max(0, attemptCount - 1)),
    OPENROUTER_VERIFICATION_MAX_DELAY_MS
  );

export const resolveOpenRouterApiKey = (
  provider: ProviderConfig | undefined,
  fallbackEndpoint?: string,
  fallbackApiKey?: string
): string | undefined => {
  if (provider?.apiKey) return provider.apiKey;

  const openRouterEndpoint = DEFAULT_PROVIDERS.openrouter.endpoint;
  if (
    fallbackApiKey &&
    typeof fallbackEndpoint === 'string' &&
    (fallbackEndpoint.includes('openrouter.ai') || fallbackEndpoint === openRouterEndpoint)
  ) {
    return fallbackApiKey;
  }

  return undefined;
};
