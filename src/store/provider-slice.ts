import { StoreSlice } from './store';

export type ProviderId =
  | 'openrouter'
  | 'openai'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'cohere'
  | 'perplexity'
  | 'deepseek'
  | 'xai'
  | 'fireworks';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  apiKey?: string;
  endpoint: string;
  modelsEndpoint?: string;
  modelsRequireAuth: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
  providerId: ProviderId;
  contextLength?: number;
  promptPrice?: number;   // cost per 1M input tokens (USD)
  completionPrice?: number; // cost per 1M output tokens (USD)
  created?: number;       // unix timestamp
  isHardcoded?: boolean;
}

export interface FavoriteModel {
  modelId: string;
  providerId: ProviderId;
}

export const DEFAULT_PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models',
    modelsRequireAuth: false,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    modelsRequireAuth: true,
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.mistral.ai/v1/models',
    modelsRequireAuth: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    modelsRequireAuth: true,
  },
  together: {
    id: 'together',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    modelsEndpoint: 'https://api.together.xyz/v1/models',
    modelsRequireAuth: true,
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    endpoint: 'https://api.cohere.ai/v2/chat',
    modelsEndpoint: 'https://api.cohere.ai/v2/models',
    modelsRequireAuth: true,
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    modelsEndpoint: undefined,
    modelsRequireAuth: false,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    modelsEndpoint: 'https://api.deepseek.com/models',
    modelsRequireAuth: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.x.ai/v1/models',
    modelsRequireAuth: true,
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks',
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    modelsEndpoint: 'https://api.fireworks.ai/inference/v1/models',
    modelsRequireAuth: true,
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  'openrouter',
  'openai',
  'deepseek',
  'mistral',
  'groq',
  'together',
  'perplexity',
  'xai',
  'cohere',
  'fireworks',
];

export interface ProviderSlice {
  providers: Record<ProviderId, ProviderConfig>;
  favoriteModels: FavoriteModel[];
  setProviderApiKey: (id: ProviderId, key: string) => void;
  setProviderEndpoint: (id: ProviderId, endpoint: string) => void;
  toggleFavoriteModel: (model: FavoriteModel) => void;
  setFavoriteModels: (models: FavoriteModel[]) => void;
}

export const createProviderSlice: StoreSlice<ProviderSlice> = (set, get) => ({
  providers: { ...DEFAULT_PROVIDERS },
  favoriteModels: [],
  setProviderApiKey: (id: ProviderId, key: string) => {
    set((prev: ProviderSlice) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [id]: { ...prev.providers[id], apiKey: key },
      },
    }));
  },
  setProviderEndpoint: (id: ProviderId, endpoint: string) => {
    set((prev: ProviderSlice) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [id]: { ...prev.providers[id], endpoint },
      },
    }));
  },
  toggleFavoriteModel: (model: FavoriteModel) => {
    set((prev: ProviderSlice) => {
      const exists = prev.favoriteModels.some(
        (f) => f.modelId === model.modelId && f.providerId === model.providerId
      );
      return {
        ...prev,
        favoriteModels: exists
          ? prev.favoriteModels.filter(
              (f) =>
                !(
                  f.modelId === model.modelId &&
                  f.providerId === model.providerId
                )
            )
          : [...prev.favoriteModels, model],
      };
    });
  },
  setFavoriteModels: (models: FavoriteModel[]) => {
    set((prev: ProviderSlice) => ({
      ...prev,
      favoriteModels: models,
    }));
  },
});
