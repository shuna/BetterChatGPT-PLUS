import useStore from '@store/store';
import type { CustomProviderModel, ProviderId, FavoriteModel, ProviderModel } from '@type/provider';
import { UNKNOWN_MODEL_CONTEXT_LENGTH } from './tokenBudget';

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
  providerId?: ProviderId
): 'text' | 'image' {
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
  providerId?: ProviderId
): 'text' | 'image' {
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

export function getModelMaxToken(
  modelId: string,
  providerId?: ProviderId
): number {
  return getModelContextInfo(modelId, providerId).contextLength;
}

export function getModelContextInfo(
  modelId: string,
  providerId?: ProviderId
): { contextLength: number; isFallback: boolean } {
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
  providerId?: ProviderId
): ModelCostEntry | undefined {
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

export function isModelStreamSupported(
  modelId: string,
  providerId?: ProviderId
): boolean {
  const state = useStore.getState();

  const custom = findProviderCustomModel(state.providerCustomModels, modelId, providerId);
  if (custom?.streamSupport != null) return custom.streamSupport;

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.streamSupport != null) return fav.streamSupport;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.streamSupport != null) return cached.streamSupport;

  return true;
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
