import useStore from '@store/store';
import type { CustomProviderModel, ProviderId, FavoriteModel, ProviderModel } from '@type/provider';
import { isVisionModel, isAudioModel, isReasoningModel } from '@api/providerModels';
import {
  UNKNOWN_MODEL_CONTEXT_LENGTH,
  UNKNOWN_MODEL_UI_CONTEXT_LENGTH,
} from './tokenBudget';
import { localModelRuntime } from '@src/local-llm/runtime';
import { getCatalogModel } from '@src/local-llm/catalog';

const DEFAULT_LOCAL_MODEL_CONTEXT_LENGTH = 2048;

export interface ModelCostEntry {
  prompt: { price: number | null; unit: number };
  completion: { price: number | null; unit: number };
  image?: { price: number | null; unit: number };
}

function findProviderCustomModel(
  providerCustomModels: Partial<Record<ProviderId, CustomProviderModel[]>> | undefined,
  modelId: string,
  providerId?: ProviderId
): CustomProviderModel | undefined {
  if (!providerCustomModels) return undefined;
  if (providerId) {
    return providerCustomModels[providerId]?.find((m) => m.modelId === modelId);
  }
  for (const models of Object.values(providerCustomModels)) {
    if (!models) continue;
    const found = models.find((m) => m.modelId === modelId);
    if (found) return found;
  }
  return undefined;
}

function findFavorite(
  favorites: FavoriteModel[],
  modelId: string,
  providerId?: ProviderId
): FavoriteModel | undefined {
  if (providerId) {
    return favorites.find(
      (f) => f.modelId === modelId && f.providerId === providerId
    );
  }
  return favorites.find((f) => f.modelId === modelId);
}

function findCachedModel(
  cache: Partial<Record<ProviderId, ProviderModel[]>>,
  modelId: string,
  providerId?: ProviderId
): ProviderModel | undefined {
  if (providerId && cache[providerId]) {
    return cache[providerId]!.find((m) => m.id === modelId);
  }
  for (const models of Object.values(cache)) {
    if (!models) continue;
    const found = models.find((m) => m.id === modelId);
    if (found) return found;
  }
  return undefined;
}

export function getModelType(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): 'text' | 'image' {
  if (modelSource === 'local') return 'text';
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom) return custom.modelType;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.modelType) return fav.modelType;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.modelType) return cached.modelType;

  return 'text';
}

export function useModelType(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): 'text' | 'image' {
  if (modelSource === 'local') return 'text';
  return useStore((state) => {
    const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
    if (custom) return custom.modelType;

    const fav = findFavorite(state.favoriteModels, modelId, providerId);
    if (fav?.modelType) return fav.modelType;

    const cached = findCachedModel(
      state.providerModelCache,
      modelId,
      providerId
    );
    if (cached?.modelType) return cached.modelType;

    return 'text';
  });
}

/**
 * Resolve context length for a local model from multiple sources:
 * 1. Runtime capabilities (from GGUF n_ctx_train, most accurate)
 * 2. Store displayMeta (persisted from previous loads)
 * 3. Catalog metadata (pre-known values for curated models)
 * 4. DEFAULT_LOCAL_MODEL_CONTEXT_LENGTH fallback
 */
function resolveLocalModelContextLength(modelId: string): number {
  // 1. Check runtime capabilities (available after model load)
  const caps = localModelRuntime.getCapabilities(modelId);
  if (caps?.contextLength) return caps.contextLength;

  // 2. Check store for persisted context length from previous load
  const state = useStore.getState();
  const storeDef = state.localModels?.find((m: { id: string }) => m.id === modelId);
  if (storeDef?.displayMeta?.contextLength) return storeDef.displayMeta.contextLength;

  // 3. Check curated catalog
  const cat = getCatalogModel(modelId);
  if (cat?.displayMeta?.contextLength) return cat.displayMeta.contextLength;

  return DEFAULT_LOCAL_MODEL_CONTEXT_LENGTH;
}

export function getModelMaxToken(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): number {
  if (modelSource === 'local') return resolveLocalModelContextLength(modelId);
  return getModelContextInfo(modelId, providerId).contextLength;
}

export function getModelConfigContextInfo(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): { contextLength: number; isFallback: boolean } {
  if (modelSource === 'local') {
    return { contextLength: resolveLocalModelContextLength(modelId), isFallback: false };
  }
  const info = getModelContextInfo(modelId, providerId);
  if (!info.isFallback) return info;
  return { contextLength: UNKNOWN_MODEL_UI_CONTEXT_LENGTH, isFallback: true };
}

export function getModelContextInfo(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): { contextLength: number; isFallback: boolean } {
  if (modelSource === 'local') {
    return { contextLength: resolveLocalModelContextLength(modelId), isFallback: false };
  }
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.contextLength) return { contextLength: custom.contextLength, isFallback: false };

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.contextLength) return { contextLength: fav.contextLength, isFallback: false };

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.contextLength) return { contextLength: cached.contextLength, isFallback: false };

  return { contextLength: UNKNOWN_MODEL_CONTEXT_LENGTH, isFallback: true };
}

export function getModelCost(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): ModelCostEntry | undefined {
  if (modelSource === 'local') return undefined;
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom) {
    return {
      prompt: { price: custom.promptPrice ?? null, unit: 1_000_000 },
      completion: { price: custom.completionPrice ?? null, unit: 1_000_000 },
      image: { price: custom.imagePrice ?? null, unit: 1 },
    };
  }

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav) {
    return {
      prompt: { price: fav.promptPrice ?? null, unit: 1_000_000 },
      completion: { price: fav.completionPrice ?? null, unit: 1_000_000 },
      image: { price: fav.imagePrice ?? null, unit: 1 },
    };
  }

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached) {
    return {
      prompt: { price: cached.promptPrice ?? null, unit: 1_000_000 },
      completion: { price: cached.completionPrice ?? null, unit: 1_000_000 },
    };
  }

  return undefined;
}

export function getModelSupportsReasoning(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): boolean {
  if (modelSource === 'local') return false;
  const state = useStore.getState();
  const inferred = isReasoningModel(modelId);

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.supportsReasoning != null) return custom.supportsReasoning;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.supportsReasoning != null) return fav.supportsReasoning || inferred;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.supportsReasoning != null) return cached.supportsReasoning || inferred;

  return inferred;
}

export function useModelSupportsReasoning(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): boolean {
  if (modelSource === 'local') return false;
  return useStore((state) => {
    const inferred = isReasoningModel(modelId);
    const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
    if (custom?.supportsReasoning != null) return custom.supportsReasoning;

    const fav = findFavorite(state.favoriteModels, modelId, providerId);
    if (fav?.supportsReasoning != null) return fav.supportsReasoning || inferred;

    const cached = findCachedModel(state.providerModelCache, modelId, providerId);
    if (cached?.supportsReasoning != null) return cached.supportsReasoning || inferred;

    return inferred;
  });
}

export function isModelStreamSupported(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): boolean {
  if (modelSource === 'local') return true;
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.streamSupport != null) return custom.streamSupport;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.streamSupport != null) return fav.streamSupport;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.streamSupport != null) return cached.streamSupport;

  return true;
}

export function getModelSupportsVision(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): boolean {
  if (modelSource === 'local') return false;
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.supportsVision != null) return custom.supportsVision;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.supportsVision != null) return fav.supportsVision;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.supportsVision != null) return cached.supportsVision;

  return isVisionModel(modelId);
}

export function getModelSupportsAudio(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): boolean {
  if (modelSource === 'local') return false;
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.supportsAudio != null) return custom.supportsAudio;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.supportsAudio != null) return fav.supportsAudio;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.supportsAudio != null) return cached.supportsAudio;

  return isAudioModel(modelId);
}

export interface ModelCapabilities {
  reasoning: boolean;
  vision: boolean;
  audio: boolean;
  stream: boolean;
}

export function getModelCapabilities(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): ModelCapabilities {
  if (modelSource === 'local') {
    return { reasoning: false, vision: false, audio: false, stream: true };
  }
  return {
    reasoning: getModelSupportsReasoning(modelId, providerId),
    vision: getModelSupportsVision(modelId, providerId),
    audio: getModelSupportsAudio(modelId, providerId),
    stream: isModelStreamSupported(modelId, providerId),
  };
}

export function useModelCapabilities(
  modelId: string,
  providerId?: ProviderId,
  modelSource?: 'remote' | 'local'
): ModelCapabilities {
  if (modelSource === 'local') {
    return { reasoning: false, vision: false, audio: false, stream: true };
  }
  return useStore((state) => {
    const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
    const fav = findFavorite(state.favoriteModels, modelId, providerId);
    const cached = findCachedModel(state.providerModelCache, modelId, providerId);
    const inferredReasoning = isReasoningModel(modelId);

    const reasoning =
      custom?.supportsReasoning ?? (
        fav?.supportsReasoning != null ? fav.supportsReasoning || inferredReasoning
        : cached?.supportsReasoning != null ? cached.supportsReasoning || inferredReasoning
        : inferredReasoning
      );
    const vision =
      custom?.supportsVision ?? fav?.supportsVision ?? cached?.supportsVision ?? isVisionModel(modelId);
    const audio =
      custom?.supportsAudio ?? fav?.supportsAudio ?? cached?.supportsAudio ?? isAudioModel(modelId);
    const stream =
      custom?.streamSupport ?? fav?.streamSupport ?? cached?.streamSupport ?? true;

    return { reasoning, vision, audio, stream };
  });
}

export function isKnownModel(modelId: string): boolean {
  const state = useStore.getState();

  if (state.providerCustomModels) {
    for (const models of Object.values(state.providerCustomModels)) {
      if (models?.some((m) => m.modelId === modelId)) return true;
    }
  }

  if (state.favoriteModels.some((f) => f.modelId === modelId)) return true;

  for (const models of Object.values(state.providerModelCache)) {
    if (models?.some((m) => m.id === modelId)) return true;
  }

  return false;
}
