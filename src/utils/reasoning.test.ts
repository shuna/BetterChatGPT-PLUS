import { describe, expect, it } from 'vitest';

import {
  isClaudeReasoningModel,
  isOpenRouterAdaptiveReasoningModel,
  isOpenRouterClaudeEffortModel,
  isOpenRouterClaudeVerbosityModel,
  isOpenRouterFusionModel,
  supportsMaxVerbosity,
} from './reasoning';

describe('reasoning model helpers', () => {
  it('detects Claude reasoning-capable model families', () => {
    expect(isClaudeReasoningModel('anthropic/claude-3.7-sonnet')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-sonnet-4')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-opus-4.5')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-opus-4.6')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-opus-4.8')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-fable-5')).toBe(true);
    expect(isClaudeReasoningModel('claude-haiku-4-5-20251001')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-3.5-sonnet')).toBe(false);
    expect(isClaudeReasoningModel('anthropic/claude-2.1')).toBe(false);
    expect(isClaudeReasoningModel('anthropic/claude-instant-1.2')).toBe(false);
  });

  it('treats unknown future Claude models as reasoning-capable', () => {
    expect(isClaudeReasoningModel('anthropic/claude-nova-6')).toBe(true);
    expect(isClaudeReasoningModel('anthropic/claude-next')).toBe(true);
  });

  it('detects OpenRouter adaptive thinking models', () => {
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.6', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-4.6-sonnet', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.8', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-fable-5', 'openrouter')).toBe(true);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.5', 'openrouter')).toBe(false);
    expect(isOpenRouterAdaptiveReasoningModel('anthropic/claude-opus-4.6', 'openai')).toBe(false);
  });

  it('detects OpenRouter Claude effort-capable models (4.7+ / Fable)', () => {
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-opus-4.7', 'openrouter')).toBe(true);
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-opus-4.8', 'openrouter')).toBe(true);
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-fable-5', 'openrouter')).toBe(true);
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-opus-4.6', 'openrouter')).toBe(false);
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
    expect(isOpenRouterClaudeEffortModel('anthropic/claude-fable-5', 'openai')).toBe(false);
  });

  it('detects OpenRouter Claude verbosity support and max verbosity support', () => {
    expect(isOpenRouterClaudeVerbosityModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(true);
    expect(isOpenRouterClaudeVerbosityModel('anthropic/claude-sonnet-4', 'openai')).toBe(false);
    expect(supportsMaxVerbosity('anthropic/claude-opus-4.6', 'openrouter')).toBe(true);
    expect(supportsMaxVerbosity('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
  });

  it('detects the OpenRouter Fusion alias only on OpenRouter', () => {
    expect(isOpenRouterFusionModel('openrouter/fusion', 'openrouter')).toBe(true);
    expect(isOpenRouterFusionModel('openrouter/fusion', 'openai')).toBe(false);
    expect(isOpenRouterFusionModel('anthropic/claude-sonnet-4', 'openrouter')).toBe(false);
    expect(isOpenRouterFusionModel('openrouter/fusion')).toBe(false);
  });
});
