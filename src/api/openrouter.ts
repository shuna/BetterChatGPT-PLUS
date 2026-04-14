/**
 * OpenRouter-specific API utilities.
 *
 * - Generation stats: retrieves actual token counts, cost, and the model
 *   that ultimately served the request (useful for free-tier auto-routing).
 * - Auth/key info: retrieves credit usage and rate-limit metadata.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ── Credit balance ─────────────────────────────────────────────────────

export interface OpenRouterCredits {
  total_credits: number;
  total_usage: number;
}

/**
 * Fetch credit balance from OpenRouter via /api/v1/credits.
 *
 * Returns { total_credits, total_usage } on success, null on failure.
 */
export async function fetchCreditBalance(
  apiKey: string
): Promise<OpenRouterCredits | null> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/credits`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json as { data: OpenRouterCredits }).data ?? null;
  } catch {
    return null;
  }
}

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
 * Cancel a running generation on OpenRouter.
 *
 * Best-effort: failures are silently ignored because the generation may
 * have already finished or the ID may not be cancellable.
 */
export async function cancelGeneration(
  generationId: string,
  apiKey: string
): Promise<void> {
  try {
    await fetch(
      `${OPENROUTER_BASE}/generation/${encodeURIComponent(generationId)}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
  } catch {
    // Best-effort — generation may have already finished
  }
}

/**
 * Fetch generation stats from OpenRouter.
 *
 * This function intentionally performs a single network request.
 * Retry policy is owned by the caller/UI layer so failed lookups do not
 * silently fan out into repeated background polling.
 */
export async function fetchGenerationStats(
  generationId: string,
  apiKey: string
): Promise<OpenRouterGenerationStats | null> {
  try {
    const res = await fetch(
      `${OPENROUTER_BASE}/generation?id=${encodeURIComponent(generationId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json as { data: OpenRouterGenerationStats }).data ?? null;
  } catch {
    return null;
  }
}
