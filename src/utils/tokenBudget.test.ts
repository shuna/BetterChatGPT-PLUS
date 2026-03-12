import { describe, expect, it } from 'vitest';

import {
  UNKNOWN_MODEL_CONTEXT_LENGTH,
  clampCompletionTokens,
  fitsContextWindow,
  getMaxCompletionTokensForContext,
  getPromptBudgetForContext,
  getReservedCompletionTokens,
} from './tokenBudget';

describe('tokenBudget', () => {
  it('reserves completion headroom when max_tokens is left at zero', () => {
    expect(getReservedCompletionTokens(8192, 0)).toBeGreaterThan(0);
    expect(getPromptBudgetForContext(8192, 0)).toBeLessThan(8192);
  });

  it('clamps completion tokens to preserve prompt headroom', () => {
    const maxCompletion = getMaxCompletionTokensForContext(8000);

    expect(clampCompletionTokens(999999, 8000)).toBe(maxCompletion);
    expect(getPromptBudgetForContext(8000, 999999)).toBe(800);
  });

  it('detects prompt budgets that still overflow the context window', () => {
    expect(fitsContextWindow(7000, 8000, 0)).toBe(false);
    expect(fitsContextWindow(6000, 8000, 0)).toBe(true);
  });

  it('keeps the unknown-model fallback conservative', () => {
    expect(UNKNOWN_MODEL_CONTEXT_LENGTH).toBe(8192);
  });
});
