import { useEffect, useRef } from 'react';

import { fetchGenerationStats } from '@api/openrouter';
import useStore from '@store/store';
import { toVerifiedStats } from '@store/openrouter-stats-slice';
import {
  getOpenRouterVerificationRetryDelay,
  resolveOpenRouterApiKey,
} from '@utils/openrouterVerification';

export default function useOpenRouterVerification() {
  const pendingVerifications = useStore((state) => state.pendingVerifications);
  const providers = useStore((state) => state.providers);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const apiKey = useStore((state) => state.apiKey);
  const inFlightRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearActiveTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const entries = Object.entries(pendingVerifications);
    if (entries.length === 0) {
      clearActiveTimer();
      return;
    }

    const now = Date.now();
    const dueEntries = entries.filter(([, verification]) =>
      verification.status !== 'fetching' && verification.nextAttemptAt <= now
    );

    if (dueEntries.length > 0) {
      for (const [statsKey, verification] of dueEntries) {
        if (inFlightRef.current.has(statsKey)) continue;

        const resolvedApiKey = resolveOpenRouterApiKey(
          providers.openrouter,
          apiEndpoint,
          apiKey
        );

        if (!resolvedApiKey) {
          useStore
            .getState()
            .markVerificationFailed(
              statsKey,
              'OpenRouter API key is not configured',
              Date.now() + getOpenRouterVerificationRetryDelay(verification.attemptCount + 1)
            );
          continue;
        }

        inFlightRef.current.add(statsKey);
        useStore.getState().markVerificationFetching(statsKey);

        void fetchGenerationStats(verification.generationId, resolvedApiKey)
          .then((raw) => {
            if (raw) {
              useStore.getState().setVerifiedStats(statsKey, toVerifiedStats(raw));
              return;
            }
            const latest = useStore.getState().pendingVerifications[statsKey];
            if (!latest) return;
            useStore
              .getState()
              .markVerificationFailed(
                statsKey,
                'OpenRouter generation stats not available yet',
                Date.now() + getOpenRouterVerificationRetryDelay(latest.attemptCount)
              );
          })
          .catch((error: unknown) => {
            const latest = useStore.getState().pendingVerifications[statsKey];
            if (!latest) return;
            useStore
              .getState()
              .markVerificationFailed(
                statsKey,
                error instanceof Error
                  ? error.message
                  : 'Failed to fetch OpenRouter generation stats',
                Date.now() + getOpenRouterVerificationRetryDelay(latest.attemptCount)
              );
          })
          .finally(() => {
            inFlightRef.current.delete(statsKey);
          });
      }
    }

    const futureEntries = entries.filter(([, verification]) =>
      verification.status !== 'fetching' && verification.nextAttemptAt > now
    );
    if (futureEntries.length === 0) {
      clearActiveTimer();
      return;
    }

    const nextAt = Math.min(...futureEntries.map(([, verification]) => verification.nextAttemptAt));
    clearActiveTimer();
    timerRef.current = setTimeout(() => {
      useStore.setState((state) => ({ pendingVerifications: { ...state.pendingVerifications } }));
    }, Math.max(0, nextAt - now));

    return () => {
      clearActiveTimer();
    };
  }, [pendingVerifications, providers, apiEndpoint, apiKey]);
}
