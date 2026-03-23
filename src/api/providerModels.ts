import { ProviderConfig, ProviderId, ProviderModel } from '@type/provider';
import { isClaudeReasoningModel } from '@utils/reasoning';

type UnknownRecord = Record<string, unknown>;
type ProviderPricingPayload = {
  prompt?: unknown;
  completion?: unknown;
};

type ProviderModelPayload = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  context_window?: unknown;
  created?: unknown;
  pricing?: unknown;
  architecture?: unknown;
};

type ProviderModelListPayload = {
  data?: unknown;
  models?: unknown;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const asProviderModelListPayload = (value: unknown): ProviderModelListPayload =>
  (isRecord(value) ? value : {}) as ProviderModelListPayload;

const asProviderModelPayload = (value: unknown): ProviderModelPayload =>
  (isRecord(value) ? value : {}) as ProviderModelPayload;

const asProviderPricingPayload = (value: unknown): ProviderPricingPayload =>
  (isRecord(value) ? value : {}) as ProviderPricingPayload;

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const toNumberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toMillionTokenPrice = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value * 1_000_000;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed * 1_000_000 : undefined;
  }
  return undefined;
};

const getModelEntries = (value: unknown): unknown[] => {
  const payload = asProviderModelListPayload(value);
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  return [];
};

const isSupportedModelId = (modelId: string) => {
  const normalizedId = modelId.toLowerCase();
  return !(
    normalizedId.includes('embed') ||
    normalizedId.includes('tts') ||
    normalizedId.includes('whisper') ||
    normalizedId.includes('dall-e') ||
    normalizedId.includes('moderation')
  );
};

/** Heuristic: detect reasoning models by well-known ID patterns. */
const REASONING_MODEL_RE =
  // OpenAI o-series: o1, o1-mini, o3, o3-mini, o4-mini, etc.
  // Uses word-boundary to avoid false positives like "proto1", "falcon-40b"
  /(?:^|[-/])o[134](?:$|[-/])/;

const REASONING_MODEL_NAMES = [
  'deepseek-r1',
  'deepseek-reasoner',
  'qwq',
] as const;

/** Heuristic: detect vision-capable models by well-known ID patterns. */
export const isVisionModel = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  // GPT-4o, GPT-4-turbo, GPT-4-vision
  if (/gpt-4[o-]/.test(id) && !id.includes('audio-preview')) return true;
  // Claude 3+
  if (/claude-3/.test(id)) return true;
  // Gemini (all versions support vision)
  if (id.includes('gemini')) return true;
  // Explicit vision models
  if (id.includes('vision')) return true;
  return false;
};

/** Heuristic: detect audio-capable models by well-known ID patterns. */
export const isAudioModel = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  if (id.includes('audio')) return true;
  if (id.includes('realtime')) return true;
  return false;
};

export const isReasoningModel = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  return (
    REASONING_MODEL_RE.test(id) ||
    REASONING_MODEL_NAMES.some((name) => id.includes(name)) ||
    isClaudeReasoningModel(id)
  );
};

const normalizeModelEntry = (
  providerId: ProviderId,
  entry: unknown
): ProviderModel | null => {
  const payload = asProviderModelPayload(entry);
  const id = toStringValue(payload.id) ?? toStringValue(payload.name);
  const name = toStringValue(payload.name) ?? toStringValue(payload.id);

  if (!id || !name || !isSupportedModelId(id)) {
    return null;
  }

  const pricing = asProviderPricingPayload(payload.pricing);
  const promptPrice = toMillionTokenPrice(pricing.prompt);
  const completionPrice = toMillionTokenPrice(pricing.completion);

  const arch = isRecord(payload.architecture) ? payload.architecture : {};
  const modality = typeof arch.modality === 'string' ? arch.modality : '';
  const inputModality = modality.split('->')[0] ?? '';
  const modelType: 'text' | 'image' = inputModality.includes('image') ? 'image' : 'text';

  return {
    id,
    name,
    providerId,
    contextLength:
      toNumberValue(payload.context_length) ??
      toNumberValue(payload.context_window),
    promptPrice,
    completionPrice,
    created: toNumberValue(payload.created),
    modelType,
    streamSupport: true,
    supportsReasoning: isReasoningModel(id),
    supportsVision: modelType === 'image' || isVisionModel(id),
    supportsAudio: isAudioModel(id),
  };
};

function normalizeModels(
  providerId: ProviderId,
  data: unknown
): ProviderModel[] {
  return getModelEntries(data)
    .map((entry) => normalizeModelEntry(providerId, entry))
    .filter((model): model is ProviderModel => model !== null);
}

export async function fetchProviderModels(
  provider: ProviderConfig
): Promise<ProviderModel[]> {
  if (!provider.modelsEndpoint) {
    return [];
  }

  if (provider.modelsRequireAuth && !provider.apiKey) {
    return [];
  }

  try {
    const headers: HeadersInit = {};
    if (provider.modelsRequireAuth && provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(provider.modelsEndpoint, { headers });
    if (!response.ok) {
      return [];
    }

    const json = await response.json();
    return normalizeModels(provider.id, json);
  } catch {
    return [];
  }
}
