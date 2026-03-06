import { ProviderConfig, ProviderId, ProviderModel } from '@store/provider-slice';

const HARDCODED_MODELS: Record<ProviderId, ProviderModel[]> = {
  openrouter: [
    { id: 'openai/gpt-4o', name: 'GPT-4o', providerId: 'openrouter', contextLength: 128000 },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openrouter', contextLength: 128000 },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', providerId: 'openrouter', contextLength: 200000 },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', providerId: 'openrouter', contextLength: 1048576 },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', contextLength: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', contextLength: 128000 },
    { id: 'gpt-4.1', name: 'GPT-4.1', providerId: 'openai', contextLength: 1047576 },
    { id: 'o3-mini', name: 'o3-mini', providerId: 'openai', contextLength: 200000 },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', providerId: 'mistral', contextLength: 128000 },
    { id: 'mistral-small-latest', name: 'Mistral Small', providerId: 'mistral', contextLength: 32000 },
    { id: 'codestral-latest', name: 'Codestral', providerId: 'mistral', contextLength: 32000 },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', providerId: 'groq', contextLength: 128000 },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', providerId: 'groq', contextLength: 32768 },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B', providerId: 'groq', contextLength: 8192 },
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', providerId: 'together', contextLength: 128000 },
    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', providerId: 'together', contextLength: 32768 },
    { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', providerId: 'together', contextLength: 32768 },
  ],
  cohere: [
    { id: 'command-r-plus', name: 'Command R+', providerId: 'cohere', contextLength: 128000 },
    { id: 'command-r', name: 'Command R', providerId: 'cohere', contextLength: 128000 },
  ],
  perplexity: [
    { id: 'sonar-pro', name: 'Sonar Pro', providerId: 'perplexity', contextLength: 200000 },
    { id: 'sonar', name: 'Sonar', providerId: 'perplexity', contextLength: 128000 },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', providerId: 'deepseek', contextLength: 64000 },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', providerId: 'deepseek', contextLength: 64000 },
  ],
  xai: [
    { id: 'grok-2', name: 'Grok 2', providerId: 'xai', contextLength: 131072 },
    { id: 'grok-2-mini', name: 'Grok 2 Mini', providerId: 'xai', contextLength: 131072 },
  ],
  fireworks: [
    { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', providerId: 'fireworks', contextLength: 128000 },
    { id: 'accounts/fireworks/models/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', providerId: 'fireworks', contextLength: 32768 },
  ],
};

function normalizeModels(
  providerId: ProviderId,
  data: any
): ProviderModel[] {
  const models: any[] = data?.data || data?.models || [];
  return models
    .filter((m: any) => {
      const id = (m.id || m.name || '').toLowerCase();
      // Filter out non-chat models
      if (id.includes('embed') || id.includes('tts') || id.includes('whisper') ||
          id.includes('dall-e') || id.includes('moderation')) {
        return false;
      }
      return true;
    })
    .map((m: any) => {
      // Pricing: OpenRouter uses pricing.prompt/completion as string per-token
      // Other providers may have different formats
      let promptPrice: number | undefined;
      let completionPrice: number | undefined;
      if (m.pricing?.prompt != null) {
        // OpenRouter: price per token as string, convert to per 1M tokens
        promptPrice = parseFloat(m.pricing.prompt) * 1_000_000;
      }
      if (m.pricing?.completion != null) {
        completionPrice = parseFloat(m.pricing.completion) * 1_000_000;
      }

      return {
        id: m.id || m.name,
        name: m.name || m.id,
        providerId,
        contextLength: m.context_length ?? m.context_window ?? undefined,
        promptPrice: promptPrice != null ? promptPrice : undefined,
        completionPrice: completionPrice != null ? completionPrice : undefined,
        created: m.created || undefined,
      };
    });
}

function markHardcoded(models: ProviderModel[]): ProviderModel[] {
  return models.map((m) => ({ ...m, isHardcoded: true }));
}

export async function fetchProviderModels(
  provider: ProviderConfig
): Promise<ProviderModel[]> {
  if (!provider.modelsEndpoint) {
    return markHardcoded(HARDCODED_MODELS[provider.id] || []);
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

export function getHardcodedModels(providerId: ProviderId): ProviderModel[] {
  return HARDCODED_MODELS[providerId] || [];
}
