/**
 * qualityMetrics.ts — Pure-function module for text quality analysis.
 *
 * Used to diagnose onebit model output degradation:
 * repetition, collapse, and comparison against original model output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutputQualityMetrics {
  /** Total character count */
  charCount: number;
  /** Word count (split on whitespace) */
  wordCount: number;
  /** Generation stop status */
  stopStatus: 'stop' | 'abort' | 'unknown';
  /** Max run of identical consecutive words */
  consecutiveRepeatCount: number;
  /** Ratio of repeated trigram tokens to total (0 = no repetition, 1 = all repeated) */
  trigramRepeatScore: number;
  /** Whether the output is considered collapsed/garbage */
  collapsed: boolean;
  /** Reason for collapse flag, null if not collapsed */
  collapseReason: string | null;
  /** Comparison against original (only for onebit variant) */
  diffFromOriginal?: { charDelta: number; exactMatch: boolean };
}

// ---------------------------------------------------------------------------
// Word-level repetition detection
// ---------------------------------------------------------------------------

/**
 * Count the maximum run of identical consecutive words.
 * e.g. "mij mij mij dog" → 3
 */
export function countConsecutiveWordRepetitions(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }
  return maxRun;
}

// ---------------------------------------------------------------------------
// N-gram repetition scoring
// ---------------------------------------------------------------------------

/**
 * Compute a repeated n-gram score.
 *
 * Extract all n-grams from the text (word-level).
 * Score = (number of token positions covered by repeated n-grams) / total positions.
 * A score near 0 means no repetition; near 1 means degenerate looping.
 *
 * @param text - Input text
 * @param n - N-gram size (default 3)
 */
export function computeRepeatedNgramScore(text: string, n: number = 3): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < n) return 0;

  const totalNgrams = words.length - n + 1;
  const ngramCounts = new Map<string, number>();

  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ');
    ngramCounts.set(ngram, (ngramCounts.get(ngram) ?? 0) + 1);
  }

  // Count positions covered by n-grams that appear more than once
  let repeatedPositions = 0;
  for (const count of ngramCounts.values()) {
    if (count > 1) {
      repeatedPositions += count;
    }
  }

  return repeatedPositions / totalNgrams;
}

// ---------------------------------------------------------------------------
// Collapse detection
// ---------------------------------------------------------------------------

/**
 * Detect whether output is collapsed / garbage.
 *
 * Conditions (any triggers collapse):
 * - Empty string
 * - Fewer than 5 characters
 * - Trigram repeat score > 0.7
 * - Consecutive identical word repetition >= 10
 */
export function detectCollapseFlag(text: string): {
  collapsed: boolean;
  reason: string | null;
} {
  if (text.length === 0) {
    return { collapsed: true, reason: 'empty output' };
  }
  if (text.length < 5) {
    return { collapsed: true, reason: `extremely short (${text.length} chars)` };
  }

  const consecutiveReps = countConsecutiveWordRepetitions(text);
  if (consecutiveReps >= 10) {
    return {
      collapsed: true,
      reason: `consecutive word repetition ×${consecutiveReps}`,
    };
  }

  const trigramScore = computeRepeatedNgramScore(text, 3);
  if (trigramScore > 0.7) {
    return {
      collapsed: true,
      reason: `trigram repeat score ${trigramScore.toFixed(2)}`,
    };
  }

  return { collapsed: false, reason: null };
}

// ---------------------------------------------------------------------------
// Aggregate quality computation
// ---------------------------------------------------------------------------

/**
 * Compute a full quality metrics bundle for one generation output.
 *
 * @param text - Generated text
 * @param stopStatus - How generation ended: 'stop', 'abort', or 'unknown'
 * @param originalText - (optional) Original model output for comparison
 */
export function computeOutputQuality(
  text: string,
  stopStatus: 'stop' | 'abort' | 'unknown',
  originalText?: string,
): OutputQualityMetrics {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const consecutiveRepeatCount = countConsecutiveWordRepetitions(text);
  const trigramRepeatScore = computeRepeatedNgramScore(text, 3);
  const { collapsed, reason: collapseReason } = detectCollapseFlag(text);

  const metrics: OutputQualityMetrics = {
    charCount: text.length,
    wordCount: words.length,
    stopStatus,
    consecutiveRepeatCount,
    trigramRepeatScore,
    collapsed,
    collapseReason,
  };

  if (originalText !== undefined) {
    metrics.diffFromOriginal = {
      charDelta: text.length - originalText.length,
      exactMatch: text === originalText,
    };
  }

  return metrics;
}
