import { useCallback, useEffect, useState } from 'react';
import { fetchProviderModels } from '@api/providerModels';
import useStore from '@store/store';
import { ProviderConfig, ProviderId, ProviderModel } from '@type/provider';

export type SortField = 'alpha' | 'created' | 'context' | 'price';
export type SortDir = 'asc' | 'desc';
export type ProviderModelMap = Partial<Record<ProviderId, ProviderModel[]>>;
export type ProviderLoadingMap = Partial<Record<ProviderId, boolean>>;

export const hasLoadedProviderModels = (
  models: ProviderModelMap,
  providerId: ProviderId
) => Object.prototype.hasOwnProperty.call(models, providerId);

export const formatUsd = (value: number): string => {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
};

export const formatModelPrice = (
  prompt?: number,
  completion?: number
): string => {
  if (prompt == null) return '-';
  if (prompt === 0 && (completion == null || completion === 0)) return 'Free';
  return `${formatUsd(prompt)} / ${completion != null ? formatUsd(completion) : '-'}`;
};

export const sortModels = (
  models: ProviderModel[],
  search: string,
  sortField: SortField,
  sortDir: SortDir
) => {
  return models
    .filter((model) => {
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      let comparison = 0;

      switch (sortField) {
        case 'alpha':
          comparison = left.name.localeCompare(right.name);
          break;
        case 'created':
          comparison = (left.created || 0) - (right.created || 0);
          break;
        case 'context':
          comparison = (left.contextLength || 0) - (right.contextLength || 0);
          break;
        case 'price': {
          const leftPrompt =
            left.promptPrice != null && left.promptPrice >= 0
              ? left.promptPrice
              : Infinity;
          const rightPrompt =
            right.promptPrice != null && right.promptPrice >= 0
              ? right.promptPrice
              : Infinity;
          comparison = leftPrompt - rightPrompt;
          break;
        }
      }

      return sortDir === 'asc' ? comparison : -comparison;
    });
};

export const useProviderModels = (providers: Record<ProviderId, ProviderConfig>) => {
  const cachedModels = useStore((state) => state.providerModelCache);
  const setProviderModelCache = useStore((state) => state.setProviderModelCache);
  const [models, setModels] = useState<ProviderModelMap>(() => ({ ...cachedModels }));
  const [loading, setLoading] = useState<ProviderLoadingMap>({});

  // Sync local state when Zustand cache changes (e.g. cleared on endpoint/apiKey change)
  useEffect(() => {
    setModels((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next) as ProviderId[]) {
        if (!cachedModels[key]) {
          delete next[key];
          changed = true;
        }
      }
      for (const key of Object.keys(cachedModels) as ProviderId[]) {
        if (cachedModels[key] && cachedModels[key] !== prev[key]) {
          next[key] = cachedModels[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cachedModels]);

  const setProviderLoading = (providerId: ProviderId, isLoading: boolean) => {
    setLoading((previous) => ({ ...previous, [providerId]: isLoading }));
  };

  const updateModels = (providerId: ProviderId, result: ProviderModel[]) => {
    setModels((previous) => ({ ...previous, [providerId]: result }));
    setProviderModelCache(providerId, result);
  };

  const loadModels = useCallback(
    async (providerId: ProviderId, force = false) => {
      if (!force && hasLoadedProviderModels(models, providerId)) {
        return;
      }

      setProviderLoading(providerId, true);
      try {
        const result = await fetchProviderModels(providers[providerId]);
        updateModels(providerId, result);
      } finally {
        setProviderLoading(providerId, false);
      }
    },
    [models, providers]
  );

  const refreshModels = useCallback(
    async (providerId: ProviderId, providerConfig: ProviderConfig) => {
      setProviderLoading(providerId, true);
      try {
        const result = await fetchProviderModels(providerConfig);
        updateModels(providerId, result);
      } finally {
        setProviderLoading(providerId, false);
      }
    },
    []
  );

  return {
    models,
    loading,
    loadModels,
    refreshModels,
  };
};
