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
  promptPrice?: number;
  completionPrice?: number;
  created?: number;
  modelType?: 'text' | 'image';
  streamSupport?: boolean;
}

export interface FavoriteModel {
  modelId: string;
  providerId: ProviderId;
  promptPrice?: number;
  completionPrice?: number;
  contextLength?: number;
  modelType?: 'text' | 'image';
  streamSupport?: boolean;
}
