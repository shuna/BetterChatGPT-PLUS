import useStore from '@store/store';
import type { ProviderId, FavoriteModel, ProviderModel } from '@type/provider';
import type { CustomModel } from '@store/custom-models-slice';

export interface ModelCostEntry {
  prompt: { price: number; unit: number };
  completion: { price: number; unit: number };
  image?: { price: number; unit: number };
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

function findCustomModel(
  customModels: CustomModel[],
  modelId: string
): CustomModel | undefined {
  return customModels.find((m) => m.id === modelId);
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

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.modelType) return fav.modelType;

  const custom = findCustomModel(state.customModels, modelId);
  if (custom) {
    return custom.architecture.modality.includes('image') ? 'image' : 'text';
  }

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.modelType) return cached.modelType;

  return 'text';
}

export function useModelType(
  modelId: string,
  providerId?: ProviderId
): 'text' | 'image' {
  return useStore((state) => {
    const fav = findFavorite(state.favoriteModels, modelId, providerId);
    if (fav?.modelType) return fav.modelType;

    const custom = findCustomModel(state.customModels, modelId);
    if (custom) {
      return custom.architecture.modality.includes('image') ? 'image' : 'text';
    }

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
  const state = useStore.getState();

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.contextLength) return fav.contextLength;

  const custom = findCustomModel(state.customModels, modelId);
  if (custom) return custom.context_length;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.contextLength) return cached.contextLength;

  return 128000;
}

export function getModelCost(
  modelId: string,
  providerId?: ProviderId
): ModelCostEntry | undefined {
  const state = useStore.getState();

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.promptPrice != null || fav?.completionPrice != null) {
    return {
      prompt: { price: fav.promptPrice ?? 0, unit: 1 },
      completion: { price: fav.completionPrice ?? 0, unit: 1 },
    };
  }

  const custom = findCustomModel(state.customModels, modelId);
  if (custom) {
    const imagePrice = parseFloat(custom.pricing.image);
    return {
      prompt: { price: parseFloat(custom.pricing.prompt), unit: 1 },
      completion: { price: parseFloat(custom.pricing.completion), unit: 1 },
      ...(imagePrice > 0 ? { image: { price: imagePrice, unit: 1 } } : {}),
    };
  }

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached && (cached.promptPrice != null || cached.completionPrice != null)) {
    return {
      prompt: { price: cached.promptPrice ?? 0, unit: 1 },
      completion: { price: cached.completionPrice ?? 0, unit: 1 },
    };
  }

  return undefined;
}

export function isModelStreamSupported(
  modelId: string,
  providerId?: ProviderId
): boolean {
  const state = useStore.getState();

  const fav = findFavorite(state.favoriteModels, modelId, providerId);
  if (fav?.streamSupport != null) return fav.streamSupport;

  const custom = findCustomModel(state.customModels, modelId);
  if (custom) return custom.is_stream_supported;

  const cached = findCachedModel(state.providerModelCache, modelId, providerId);
  if (cached?.streamSupport != null) return cached.streamSupport;

  return true;
}

export function isKnownModel(modelId: string): boolean {
  const state = useStore.getState();

  if (state.favoriteModels.some((f) => f.modelId === modelId)) return true;
  if (state.customModels.some((m) => m.id === modelId)) return true;

  for (const models of Object.values(state.providerModelCache)) {
    if (models?.some((m) => m.id === modelId)) return true;
  }

  return false;
}
