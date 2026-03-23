import { describe, expect, it } from 'vitest';

import {
  isClaudeReasoningModel,
  isOpenRouterAdaptiveReasoningModel,
  isOpenRouterClaudeVerbosityModel,
  supportsMaxVerbosity,
} from './reasoning';

describe('reasoning model helpers', () => {
  it('detects Claude reasoning-capable model families', () => {
    expect(isClaudeReasoningModel('anthropic/claude-3.7-sonnet')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-sonnet-4')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-opus-4.5')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-opus-4.6')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-3.5-sonnet')).toBe(false);
  });

  it('detects OpenRouter adaptive thinking models', () => {
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.6', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-4.6-sonnet', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.6', 'openai')).toBe(false);
  });

  it('detects OpenRouter Claude verbosity support and max verbosity support', () => {
    expect(isOpenRouterClaudeVerbosityModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(true);
    expect(isOpenRouterClaudeVerbosityModel('anthropic/claude-sonnet-4', 'openai')).toBe(false);
    expect(supportsMaxVerbosity('anthropic/claude-opus-4.6', 'openrouter')).toBe(true);
    expect(supportsMaxVerbosity('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
  });
});
