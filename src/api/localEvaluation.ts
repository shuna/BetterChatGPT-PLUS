/**
 * Local evaluation API — browser-side moderation and quality hints.
 *
 * Uses Transformers.js classification for moderation screening
 * and wllama generation for quality hints.
 */

import { localModelRuntime } from '@src/local-llm/runtime';
import type { LocalModerationResult, LocalQualityHint } from '@type/evaluation';
import type { LocalModelTask } from '@src/local-llm/types';
import useStore from '@store/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveModelId(task: LocalModelTask): string | null {
  const state = useStore.getState();
  if (!state.localModelEnabled) return null;
  return state.activeLocalModels[task] ?? null;
}

// ---------------------------------------------------------------------------
// Local moderation (Transformers.js classification)
// ---------------------------------------------------------------------------

/** Screening thresholds for classification scores */
const WARN_THRESHOLD = 0.5;
const BLOCK_THRESHOLD = 0.8;

/**
 * Run local moderation screening using a Transformers.js classifier.
 *
 * Returns a 3-level screening result (safe / warn / block-candidate)
 * that is NOT a replacement for remote 13-category moderation.
 */
export async function runLocalModeration(text: string): Promise<LocalModerationResult> {
  const modelId = getActiveModelId('moderation');
  if (!modelId) {
    throw new Error('No local moderation model configured');
  }

  const engine = localModelRuntime.getTransformersEngine(modelId);
  if (!engine) {
    throw new Error('Local moderation model not loaded');
  }

  const labels = await engine.classify(text);

  // Determine screening level from classification scores.
  // The classifier may return labels like "toxic", "hate", "safe", etc.
  // We look for any "negative" label with high confidence.
  const negativeLabels = labels.filter(
    (l) => !isPositiveLabel(l.label),
  );

  const maxNegativeScore = negativeLabels.length > 0
    ? Math.max(...negativeLabels.map((l) => l.score))
    : 0;

  let screening: LocalModerationResult['screening'] = 'safe';
  if (maxNegativeScore >= BLOCK_THRESHOLD) {
    screening = 'block-candidate';
  } else if (maxNegativeScore >= WARN_THRESHOLD) {
    screening = 'warn';
  }

  return {
    screening,
    rawScores: labels.map((l) => ({ label: l.label, score: l.score })),
    source: 'local',
    timestamp: Date.now(),
  };
}

/**
 * Heuristic: labels that indicate safe/acceptable content.
 * Everything else is treated as potentially negative.
 */
function isPositiveLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower === 'safe' ||
    lower === 'not toxic' ||
    lower === 'acceptable' ||
    lower === 'none' ||
    lower === 'ok' ||
    lower.startsWith('not_') ||
    lower.startsWith('non_')
  );
}

// ---------------------------------------------------------------------------
// Local quality hint (wllama generation)
// ---------------------------------------------------------------------------

const QUALITY_HINT_PROMPT = `Rate the quality of the following response. Reply with exactly one word: "good", "fair", or "poor", followed by a brief one-sentence explanation.

Response to evaluate:
{text}

Rating:`;

/**
 * Generate a lightweight quality hint using the local wllama model.
 *
 * Returns a 3-level grade with a short comment.
 * This is experimental and should NOT be treated as authoritative.
 */
export async function runLocalQualityHint(text: string): Promise<LocalQualityHint> {
  const modelId = getActiveModelId('quality') ?? getActiveModelId('generation');
  if (!modelId) {
    throw new Error('No local quality/generation model configured');
  }

  const engine = localModelRuntime.getWllamaEngine(modelId);
  if (!engine) {
    throw new Error('Local quality model not loaded');
  }

  const prompt = QUALITY_HINT_PROMPT.replace('{text}', text.slice(0, 2000));

  const result = await engine.generate(
    prompt,
    { maxTokens: 100, temperature: 0.2 },
    () => {},
  );

  // Parse the response — expect "good/fair/poor" followed by explanation
  const trimmed = result.trim().toLowerCase();
  let grade: LocalQualityHint['grade'] = 'fair';
  if (trimmed.startsWith('good')) grade = 'good';
  else if (trimmed.startsWith('poor')) grade = 'poor';

  return {
    grade,
    comment: result.trim().slice(0, 200),
    source: 'local',
    timestamp: Date.now(),
  };
}
