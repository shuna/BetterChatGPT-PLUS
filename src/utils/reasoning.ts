import type { ProviderId } from '@type/provider';

const normalizeModelId = (modelId: string): string => modelId.toLowerCase();

/**
 * Extract the generation number from a Claude model ID.
 * Tolerates dot/dash separators and arbitrary tier names:
 * "claude-3.7-sonnet" → 3.7, "claude-opus-4-8" → 4.8, "claude-fable-5" → 5.
 * Returns undefined when no version number is present.
 */
const getClaudeVersion = (id: string): number | undefined => {
  const match = /claude(?:-[a-z]+)*[-.](\d+(?:[.-]\d+)?)/.exec(id);
  if (!match) return undefined;
  const version = parseFloat(match[1].replace('-', '.'));
  return Number.isFinite(version) ? version : undefined;
};

/**
 * Reasoning support is the default for Claude — only the legacy generations
 * (< 3.7) lack it, so unknown/future models are treated as supported.
 */
export const isClaudeReasoningModel = (modelId: string): boolean => {
  const id = normalizeModelId(modelId);
  if (!id.includes('claude')) return false;
  if (id.includes('thinking')) return true;

  const version = getClaudeVersion(id);
  if (version === undefined) return true;
  return version >= 3.7;
};

/**
 * Adaptive thinking is the only mode from the 4.6 generation onward
 * (Opus/Sonnet 4.6, Opus 4.7/4.8, Fable 5, and future models).
 */
export const isOpenRouterAdaptiveReasoningModel = (
  modelId: string,
  providerId?: ProviderId
): boolean => {
  if (providerId !== 'openrouter') return false;

  const id = normalizeModelId(modelId);
  if (!id.includes('claude')) return false;

  const version = getClaudeVersion(id);
  if (version === undefined) return true;
  return version >= 4.6;
};

/**
 * From the 4.7 generation onward (Opus 4.7/4.8, Fable 5), fixed thinking
 * budgets (budget_tokens) are removed and the effort parameter is the
 * supported control — send reasoning.effort instead of reasoning.max_tokens.
 */
export const isOpenRouterClaudeEffortModel = (
  modelId: string,
  providerId?: ProviderId
): boolean => {
  if (providerId !== 'openrouter') return false;

  const id = normalizeModelId(modelId);
  if (!id.includes('claude')) return false;

  const version = getClaudeVersion(id);
  if (version === undefined) return true;
  return version >= 4.7;
};

export const isOpenRouterClaudeVerbosityModel = (
  modelId: string,
  providerId?: ProviderId
): boolean => providerId === 'openrouter' && normalizeModelId(modelId).includes('claude');

export const supportsMaxVerbosity = (
  modelId: string,
  providerId?: ProviderId
): boolean => isOpenRouterAdaptiveReasoningModel(modelId, providerId);
