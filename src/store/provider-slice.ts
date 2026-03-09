import { StoreSlice } from './store';
import {
  CustomProviderModel,
  FavoriteModel,
  ProviderConfig,
  ProviderId,
  ProviderModel,
} from '@type/provider';
import { DEFAULT_PROVIDERS } from './provider-config';
import { toggleFavoriteModelEntry, updateProviderConfig } from './provider-helpers';

export interface ProviderSlice {
  providers: Record<ProviderId, ProviderConfig>;
  favoriteModels: FavoriteModel[];
  providerModelCache: Partial<Record<ProviderId, ProviderModel[]>>;
  providerCustomModels: Partial<Record<ProviderId, CustomProviderModel[]>>;
  _legacyCustomModels?: unknown[];
  showProviderMenu: boolean;
  setProviderApiKey: (id: ProviderId, key: string) => void;
  setProviderEndpoint: (id: ProviderId, endpoint: string) => void;
  toggleFavoriteModel: (model: FavoriteModel) => void;
  setFavoriteModels: (models: FavoriteModel[]) => void;
  setProviderModelCache: (id: ProviderId, models: ProviderModel[]) => void;
  setShowProviderMenu: (show: boolean) => void;
  addProviderCustomModel: (model: CustomProviderModel) => void;
  updateProviderCustomModel: (providerId: ProviderId, modelId: string, patch: Partial<CustomProviderModel>) => void;
  removeProviderCustomModel: (providerId: ProviderId, modelId: string) => void;
  clearLegacyCustomModels: () => void;
}

export const createProviderSlice: StoreSlice<ProviderSlice> = (set, get) => ({
  providers: { ...DEFAULT_PROVIDERS },
  favoriteModels: [],
  providerModelCache: {},
  providerCustomModels: {},
  _legacyCustomModels: undefined,
  showProviderMenu: false,
  setProviderApiKey: (id: ProviderId, key: string) => {
    if (get().providers[id]?.apiKey === key) return;
    set((prev: ProviderSlice) => ({
      ...prev,
      providers: updateProviderConfig(prev.providers, id, { apiKey: key }),
      providerModelCache: { ...prev.providerModelCache, [id]: undefined },
    }));
  },
  setProviderEndpoint: (id: ProviderId, endpoint: string) => {
    if (get().providers[id]?.endpoint === endpoint) return;
    set((prev: ProviderSlice) => ({
      ...prev,
      providers: updateProviderConfig(prev.providers, id, { endpoint }),
      providerModelCache: { ...prev.providerModelCache, [id]: undefined },
    }));
  },
  toggleFavoriteModel: (model: FavoriteModel) => {
    set((prev: ProviderSlice) => {
      return {
        ...prev,
        favoriteModels: toggleFavoriteModelEntry(prev.favoriteModels, model),
      };
    });
  },
  setFavoriteModels: (models: FavoriteModel[]) => {
    if (get().favoriteModels === models) return;
    set((prev: ProviderSlice) => ({
      ...prev,
      favoriteModels: models,
    }));
  },
  setProviderModelCache: (id: ProviderId, models: ProviderModel[]) => {
    set((prev: ProviderSlice) => ({
      ...prev,
      providerModelCache: { ...prev.providerModelCache, [id]: models },
    }));
  },
  setShowProviderMenu: (show: boolean) => {
    set((prev: ProviderSlice) => ({
      ...prev,
      showProviderMenu: show,
    }));
  },
  addProviderCustomModel: (model: CustomProviderModel) => {
    set((prev: ProviderSlice) => {
      const existing = prev.providerCustomModels[model.providerId] || [];
      if (existing.some((m) => m.modelId === model.modelId)) return prev;
      return {
        ...prev,
        providerCustomModels: {
          ...prev.providerCustomModels,
          [model.providerId]: [...existing, model],
        },
      };
    });
  },
  updateProviderCustomModel: (providerId: ProviderId, modelId: string, patch: Partial<CustomProviderModel>) => {
    set((prev: ProviderSlice) => {
      const existing = prev.providerCustomModels[providerId];
      if (!existing) return prev;
      return {
        ...prev,
        providerCustomModels: {
          ...prev.providerCustomModels,
          [providerId]: existing.map((m) =>
            m.modelId === modelId ? { ...m, ...patch, modelId, providerId } : m
          ),
        },
      };
    });
  },
  removeProviderCustomModel: (providerId: ProviderId, modelId: string) => {
    set((prev: ProviderSlice) => {
      const existing = prev.providerCustomModels[providerId];
      if (!existing) return prev;
      return {
        ...prev,
        providerCustomModels: {
          ...prev.providerCustomModels,
          [providerId]: existing.filter((m) => m.modelId !== modelId),
        },
      };
    });
  },
  clearLegacyCustomModels: () => {
    set((prev: ProviderSlice) => ({
      ...prev,
      _legacyCustomModels: undefined,
    }));
  },
});
