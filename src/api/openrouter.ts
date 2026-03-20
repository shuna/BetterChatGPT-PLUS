/**
 * OpenRouter-specific API utilities.
 *
 * - Generation stats: retrieves actual token counts, cost, and the model
 *   that ultimately served the request (useful for free-tier auto-routing).
 * - Auth/key info: retrieves credit usage and rate-limit metadata.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ── Generation stats ────────────────────────────────────────────────────

export interface OpenRouterGenerationStats {
  id: string;
  model: string;
  tokens_prompt: number;
  tokens_completion: number;
  native_tokens_prompt: number;
  native_tokens_completion: number;
  total_cost: number;
  cache_discount: number | null;
  created_at: string;
  /** Present when the generation failed upstream. */
  error?: string;
}

/**
 * Fetch generation stats from OpenRouter.
 *
 * The stats endpoint may return 404 if called too early (the generation
 * record hasn't been written yet).  The caller can pass `retries` to
 * automatically retry with exponential back-off.
 */
export async function fetchGenerationStats(
  generationId: string,
  apiKey: string,
  retries = 3
): Promise<OpenRouterGenerationStats | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    try {
      const res = await fetch(
        `${OPENROUTER_BASE}/generation?id=${encodeURIComponent(generationId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (res.status === 404) continue;
      if (!res.ok) return null;
      const json = await res.json();
      return (json as { data: OpenRouterGenerationStats }).data ?? null;
    } catch {
      // Network error – retry
    }
  }
  return null;
}

