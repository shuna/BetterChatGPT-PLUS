import type { ProviderId } from '@type/provider';

const normalizeModelId = (modelId: string): string => modelId.toLowerCase();

export const isOpenRouterAdaptiveReasoningModel = (
  modelId: string,
  providerId?: ProviderId
): boolean => {
  if (providerId !== 'openrouter') return false;

  const id = normalizeModelId(modelId);
  return (
    (id.includes('claude') && id.includes('4.6') && id.includes('opus')) ||
    (id.includes('claude') && id.includes('4.6') && id.includes('sonnet'))
  );
};

export const isClaudeReasoningModel = (modelId: string): boolean => {
  const id = normalizeModelId(modelId);

  if (id.includes('claude') && id.includes('thinking')) return true;

  return (
    /claude-(?:3\.7|4(?:\.\d+)?)(?:$|[-/:])/.test(id) ||
    /claude-(?:sonnet|opus)-4(?:\.\d+)?(?:$|[-/:])/.test(id)
  );
};

export const isOpenRouterClaudeVerbosityModel = (
  modelId: string,
  providerId?: ProviderId
): boolean => providerId === 'openrouter' && normalizeModelId(modelId).includes('claude');

export const supportsMaxVerbosity = (
  modelId: string,
  providerId?: ProviderId
): boolean => isOpenRouterAdaptiveReasoningModel(modelId, providerId);
