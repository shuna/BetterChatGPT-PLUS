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

export interface OpenRouterStatsSlice {
  /**
   * Verified generation stats keyed by `chatId:::targetNodeId`.
   * Only the most recent N entries are kept to avoid unbounded growth.
   */
  verifiedStats: Record<string, VerifiedStats>;
  setVerifiedStats: (key: string, stats: VerifiedStats) => void;
  clearVerifiedStats: () => void;
}

const MAX_ENTRIES = 50;

export const createOpenRouterStatsSlice: StoreSlice<OpenRouterStatsSlice> = (
  set
) => ({
  verifiedStats: {},
  setVerifiedStats: (key, stats) =>
    set((prev) => {
      const next = { ...prev.verifiedStats, [key]: stats };
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
      return { verifiedStats: next };
    }),
  clearVerifiedStats: () => set({ verifiedStats: {} }),
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
