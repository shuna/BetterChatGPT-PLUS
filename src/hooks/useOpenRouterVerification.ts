import { useEffect, useRef } from 'react';

import { fetchCreditBalance, fetchGenerationStats } from '@api/openrouter';
import useStore from '@store/store';
import { debugReport } from '@store/debug-store';
import { toVerifiedStats } from '@store/openrouter-stats-slice';
import { resolveOpenRouterApiKey } from '@utils/openrouterVerification';

const EMPTY_PENDING_VERIFICATIONS = {};
const NO_AUTO_RETRY_AT = Number.MAX_SAFE_INTEGER;

const formatDebugTime = (time = Date.now()): string =>
  new Date(time).toISOString().slice(11, 23);

export default function useOpenRouterVerification() {
  const pendingVerifications = useStore((state) =>
    state.pendingVerifications && typeof state.pendingVerifications === 'object'
      ? state.pendingVerifications
      : EMPTY_PENDING_VERIFICATIONS
  );
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
              NO_AUTO_RETRY_AT
            );
          continue;
        }

        inFlightRef.current.add(statsKey);
        useStore.getState().markVerificationFetching(statsKey);
        debugReport(`or-verify:${statsKey}`, {
          label: 'OpenRouter Verify',
          status: 'active',
          detail: `${formatDebugTime()} fetch ${verification.generationId}`,
        });

        void fetchGenerationStats(verification.generationId, resolvedApiKey)
          .then((raw) => {
            if (raw) {
              useStore.getState().setVerifiedStats(statsKey, toVerifiedStats(raw));
              debugReport(`or-verify:${statsKey}`, {
                status: 'done',
                detail: `${formatDebugTime()} fetched ${raw.id}`,
              });
              // Refresh credit balance alongside verified stats
              void fetchCreditBalance(resolvedApiKey).then((info) => {
                if (info) {
                  useStore.getState().setCreditBalance({
                    totalCredits: info.total_credits,
                    totalUsage: info.total_usage,
                    fetchedAt: Date.now(),
                  });
                }
              });
              return;
            }
            useStore
              .getState()
              .markVerificationFailed(
                statsKey,
                'OpenRouter generation stats unavailable',
                NO_AUTO_RETRY_AT
              );
            debugReport(`or-verify:${statsKey}`, {
              status: 'error',
              detail: `${formatDebugTime()} unavailable ${verification.generationId}`,
            });
          })
          .catch((error: unknown) => {
            useStore
              .getState()
              .markVerificationFailed(
                statsKey,
                error instanceof Error
                  ? error.message
                  : 'Failed to fetch OpenRouter generation stats',
                NO_AUTO_RETRY_AT
              );
            debugReport(`or-verify:${statsKey}`, {
              status: 'error',
              detail: `${formatDebugTime()} failed ${verification.generationId}`,
            });
          })
          .finally(() => {
            inFlightRef.current.delete(statsKey);
          });
      }
    }

    const futureEntries = entries.filter(([, verification]) =>
      verification.status !== 'fetching' &&
      Number.isFinite(verification.nextAttemptAt) &&
      verification.nextAttemptAt > now &&
      verification.nextAttemptAt < NO_AUTO_RETRY_AT
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
