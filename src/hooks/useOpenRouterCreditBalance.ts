import { useCallback, useEffect, useRef } from 'react';

import { fetchCreditBalance } from '@api/openrouter';
import useStore from '@store/store';
import { resolveOpenRouterApiKey } from '@utils/openrouterVerification';

const STALE_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_MS = 3_000;

/**
 * Fetches and caches the OpenRouter credit balance.
 *
 * Activates only when the current chat's provider is OpenRouter.
 * Auto-fetches on mount (if stale), after generation completes, and
 * exposes a manual refresh callback.
 */
export default function useOpenRouterCreditBalance(isOpenRouter: boolean) {
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef(false);

  const doFetch = useCallback(async () => {
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastFetchRef.current < COOLDOWN_MS) return;

    const state = useStore.getState();
    const apiKey = resolveOpenRouterApiKey(
      state.providers.openrouter,
      state.apiEndpoint,
      state.apiKey,
    );
    if (!apiKey) return;

    inFlightRef.current = true;
    state.setCreditBalanceFetching(true);
    try {
      const info = await fetchCreditBalance(apiKey);
      if (info) {
        useStore.getState().setCreditBalance({
          totalCredits: info.total_credits,
          totalUsage: info.total_usage,
          fetchedAt: Date.now(),
        });
      }
    } finally {
      lastFetchRef.current = Date.now();
      inFlightRef.current = false;
      useStore.getState().setCreditBalanceFetching(false);
    }
  }, []);

  // Fetch on mount if stale
  useEffect(() => {
    if (!isOpenRouter) return;
    const balance = useStore.getState().creditBalance;
    if (!balance || Date.now() - balance.fetchedAt > STALE_MS) {
      void doFetch();
    }
  }, [isOpenRouter, doFetch]);

  // Refetch when generation completes for the current chat
  const generatingSession = useStore((state) => {
    const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
    return Object.values(state.generatingSessions).find((s) => s.chatId === chatId);
  });
  const wasGeneratingRef = useRef(!!generatingSession);

  useEffect(() => {
    const isGenerating = !!generatingSession;
    if (wasGeneratingRef.current && !isGenerating && isOpenRouter) {
      void doFetch();
    }
    wasGeneratingRef.current = isGenerating;
  }, [generatingSession, isOpenRouter, doFetch]);

  return { refresh: doFetch };
}
