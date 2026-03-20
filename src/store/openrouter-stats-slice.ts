import type { StoreSlice } from './store';
import type { OpenRouterGenerationStats } from '@api/openrouter';

export interface VerifiedStats {
  generationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  nativePromptTokens: number;
  nativeCompletionTokens: number;
  totalCost: number;
  cacheDiscount: number | null;
  error?: string;
  fetchedAt: number;
}

export interface PendingOpenRouterVerification {
  generationId: string;
  chatId: string;
  targetNodeId: string;
  requestedAt: number;
  nextAttemptAt: number;
  attemptCount: number;
  status: 'pending' | 'fetching' | 'failed';
  lastAttemptAt?: number;
  lastError?: string;
}

export interface OpenRouterStatsSlice {
  /**
   * Verified generation stats keyed by `chatId:::targetNodeId`.
   * Only the most recent N entries are kept to avoid unbounded growth.
   */
  verifiedStats: Record<string, VerifiedStats>;
  pendingVerifications: Record<string, PendingOpenRouterVerification>;
  setVerifiedStats: (key: string, stats: VerifiedStats) => void;
  queueVerification: (
    key: string,
    verification: Omit<
      PendingOpenRouterVerification,
      'requestedAt' | 'attemptCount' | 'status'
    > & { requestedAt?: number }
  ) => void;
  markVerificationFetching: (key: string) => void;
  markVerificationFailed: (
    key: string,
    error: string,
    nextAttemptAt: number
  ) => void;
  retryVerificationNow: (key: string) => void;
  removePendingVerification: (key: string) => void;
  clearVerifiedStats: () => void;
}

const MAX_ENTRIES = 50;

export const createOpenRouterStatsSlice: StoreSlice<OpenRouterStatsSlice> = (
  set
) => ({
  verifiedStats: {},
  pendingVerifications: {},
  setVerifiedStats: (key, stats) =>
    set((prev) => {
      const next = { ...prev.verifiedStats, [key]: stats };
      const nextPending = { ...prev.pendingVerifications };
      delete nextPending[key];
      // Evict oldest entries when over limit
      const keys = Object.keys(next);
      if (keys.length > MAX_ENTRIES) {
        const sorted = keys.sort(
          (a, b) => (next[a]?.fetchedAt ?? 0) - (next[b]?.fetchedAt ?? 0)
        );
        for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
          delete next[sorted[i]];
        }
      }
      return { verifiedStats: next, pendingVerifications: nextPending };
    }),
  queueVerification: (key, verification) =>
    set((prev) => {
      const existing = prev.pendingVerifications[key];
      return {
        pendingVerifications: {
          ...prev.pendingVerifications,
          [key]: {
            generationId: verification.generationId,
            chatId: verification.chatId,
            targetNodeId: verification.targetNodeId,
            requestedAt: verification.requestedAt ?? existing?.requestedAt ?? Date.now(),
            nextAttemptAt: verification.nextAttemptAt,
            attemptCount: existing?.attemptCount ?? 0,
            status: 'pending',
            lastAttemptAt: existing?.lastAttemptAt,
            lastError: undefined,
          },
        },
      };
    }),
  markVerificationFetching: (key) =>
    set((prev) => {
      const existing = prev.pendingVerifications[key];
      if (!existing) return prev;
      return {
        pendingVerifications: {
          ...prev.pendingVerifications,
          [key]: {
            ...existing,
            status: 'fetching',
            attemptCount: existing.attemptCount + 1,
            lastAttemptAt: Date.now(),
            lastError: undefined,
          },
        },
      };
    }),
  markVerificationFailed: (key, error, nextAttemptAt) =>
    set((prev) => {
      const existing = prev.pendingVerifications[key];
      if (!existing) return prev;
      return {
        pendingVerifications: {
          ...prev.pendingVerifications,
          [key]: {
            ...existing,
            status: 'failed',
            nextAttemptAt,
            lastError: error,
          },
        },
      };
    }),
  retryVerificationNow: (key) =>
    set((prev) => {
      const existing = prev.pendingVerifications[key];
      if (!existing) return prev;
      return {
        pendingVerifications: {
          ...prev.pendingVerifications,
          [key]: {
            ...existing,
            status: 'pending',
            nextAttemptAt: Date.now(),
            lastError: undefined,
          },
        },
      };
    }),
  removePendingVerification: (key) =>
    set((prev) => {
      if (!prev.pendingVerifications[key]) return prev;
      const next = { ...prev.pendingVerifications };
      delete next[key];
      return { pendingVerifications: next };
    }),
  clearVerifiedStats: () => set({ verifiedStats: {}, pendingVerifications: {} }),
});

export const toVerifiedStats = (
  raw: OpenRouterGenerationStats
): VerifiedStats => ({
  generationId: raw.id,
  model: raw.model,
  promptTokens: raw.tokens_prompt,
  completionTokens: raw.tokens_completion,
  nativePromptTokens: raw.native_tokens_prompt,
  nativeCompletionTokens: raw.native_tokens_completion,
  totalCost: raw.total_cost,
  cacheDiscount: raw.cache_discount,
  error: raw.error,
  fetchedAt: Date.now(),
});
