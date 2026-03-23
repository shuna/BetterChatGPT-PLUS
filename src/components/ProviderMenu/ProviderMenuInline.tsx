import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { showToast } from '@utils/showToast';
import { ProviderId } from '@type/provider';
import { PROVIDER_ORDER } from '@store/provider-config';
import { normalizeProviderConfig } from '@store/provider-helpers';
import {
  SortDir,
  SortField,
  sortModels,
  useProviderModels,
} from './providerMenuHelpers';
import ProviderModelList from './ProviderModelList';
import ProviderCustomModelList from './ProviderCustomModelList';
import ProviderSettingsForm from './ProviderSettingsForm';

type ViewMode = 'browse' | 'custom';

const ResizableSidebar = ({
  children,
  minWidth,
  maxWidth,
  defaultWidth,
}: {
  children: React.ReactNode;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setWidth(Math.min(maxWidth, Math.max(minWidth, startW.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, minWidth, maxWidth]);

  return (
    <div className='hidden md:block relative border-r dark:border-gray-600 overflow-y-auto flex-shrink-0' style={{ width }}>
      {children}
      <div
        className='absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400/40 active:bg-blue-400/60 z-10'
        onMouseDown={onMouseDown}
      />
    </div>
  );
};

const ProviderMenuInline = ({ onSettingsChanged }: { onSettingsChanged?: () => void }) => {
  const { t } = useTranslation('model');

  const providers = useStore((state) => state.providers);
  const favoriteModels = useStore((state) => state.favoriteModels);
  const setProviderApiKey = useStore((state) => state.setProviderApiKey);
  const setProviderEndpoint = useStore((state) => state.setProviderEndpoint);
  const apiVersion = useStore((state) => state.apiVersion);
  const setApiVersion = useStore((state) => state.setApiVersion);
  const toggleFavoriteModel = useStore((state) => state.toggleFavoriteModel);

  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openrouter');
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const { models, loading, loadModels, refreshModels } = useProviderModels(providers);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('alpha');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'alpha' ? 'asc' : 'desc');
    }
  };
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [endpointInput, setEndpointInput] = useState('');
  const [apiVersionInput, setApiVersionInput] = useState('');

  useEffect(() => {
    const provider = normalizeProviderConfig(selectedProvider, providers[selectedProvider]);
    setApiKeyInput(provider.apiKey || '');
    setEndpointInput(provider.endpoint);
    setApiVersionInput(apiVersion || '');
  }, [selectedProvider, providers, apiVersion]);

  useEffect(() => {
    loadModels(selectedProvider);
  }, [loadModels, selectedProvider]);

  // Keep refs in sync for unmount save
  const stateRef = useRef({ selectedProvider, apiKeyInput, endpointInput, apiVersionInput });
  stateRef.current = { selectedProvider, apiKeyInput, endpointInput, apiVersionInput };
  const onSettingsChangedRef = useRef(onSettingsChanged);
  onSettingsChangedRef.current = onSettingsChanged;

  const saveSettings = useCallback((
    stateOverride?: {
      selectedProvider: ProviderId;
      apiKeyInput: string;
      endpointInput: string;
      apiVersionInput: string;
    }
  ) => {
    const s = stateOverride ?? stateRef.current;
    const currentProviders = useStore.getState().providers;
    const currentProvider = normalizeProviderConfig(
      s.selectedProvider,
      currentProviders[s.selectedProvider]
    );
    const currentApiVersion = useStore.getState().apiVersion;
    const normalizedEndpoint = normalizeProviderConfig(s.selectedProvider, {
      ...currentProvider,
      endpoint: s.endpointInput,
    }).endpoint;
    const hasConfigChanges =
      (currentProvider.apiKey || '') !== s.apiKeyInput ||
      currentProvider.endpoint !== normalizedEndpoint ||
      (currentApiVersion || '') !== s.apiVersionInput;

    if (!hasConfigChanges) return false;

    setProviderApiKey(s.selectedProvider, s.apiKeyInput);
    setProviderEndpoint(s.selectedProvider, normalizedEndpoint);
    setApiVersion(s.apiVersionInput);
    onSettingsChangedRef.current?.();
    return true;
  }, []);

  const handleProviderChange = useCallback((nextProvider: ProviderId) => {
    saveSettings(stateRef.current);
    setSelectedProvider(nextProvider);
  }, [saveSettings]);

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      saveSettings();
    };
  }, [saveSettings]);

  const currentModels = models[selectedProvider] || [];

  const filteredModels = useMemo(
    () => sortModels(currentModels, search, sortField, sortDir),
    [currentModels, search, sortDir, sortField]
  );

  return (
    <div className='flex flex-col h-full'>
      {/* Mobile provider selector */}
      <div className='md:hidden p-3 border-b dark:border-gray-600'>
        <select
          value={selectedProvider}
          onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
          className='w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
        >
          {PROVIDER_ORDER.map((providerId) => {
            const provider = providers[providerId];
            const favoriteCount = favoriteModels.filter(
              (f) => f.providerId === providerId
            ).length;
            return (
              <option key={providerId} value={providerId}>
                {provider.name}{favoriteCount > 0 ? ` (${favoriteCount})` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Body */}
      <div className='flex flex-1 overflow-hidden'>
        {/* Provider sidebar - resizable */}
        <ResizableSidebar minWidth={80} maxWidth={200} defaultWidth={130}>
          {PROVIDER_ORDER.map((providerId) => {
            const provider = providers[providerId];
            const favoriteCount = favoriteModels.filter(
              (favorite) => favorite.providerId === providerId
            ).length;

            return (
              <button
                key={providerId}
                onClick={() => handleProviderChange(providerId)}
                className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between transition-colors truncate ${
                  selectedProvider === providerId
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                }`}
              >
                <span className='truncate'>{provider.name}</span>
                {favoriteCount > 0 && (
                  <span className='text-xs bg-green-600 text-white rounded-full px-1.5 py-0.5 ml-1 flex-shrink-0'>
                    {favoriteCount}
                  </span>
                )}
              </button>
            );
          })}
        </ResizableSidebar>

        <div className='flex-1 flex flex-col overflow-hidden'>
          {/* Browse / Custom tabs */}
          <div className='flex border-b dark:border-gray-600'>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === 'browse'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => setViewMode('browse')}
            >
              {t('provider.tabBrowse', '公式')}
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === 'custom'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => setViewMode('custom')}
            >
              Custom
            </button>
          </div>

          <div className='flex-1 flex flex-col overflow-hidden min-h-0'>
            {viewMode === 'browse' ? (
              <ProviderModelList
                search={search}
                onSearchChange={setSearch}
                loading={loading}
                selectedProvider={selectedProvider}
                filteredModels={filteredModels}
                providers={providers}
                onRefresh={(providerId) =>
                  refreshModels(providerId, useStore.getState().providers[providerId])
                }
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                favoriteModels={favoriteModels}
                onToggleFavorite={toggleFavoriteModel}
              />
            ) : (
              <ProviderCustomModelList
                selectedProvider={selectedProvider}
                favoriteModels={favoriteModels}
                onToggleFavorite={toggleFavoriteModel}
              />
            )}
          </div>

          <ProviderSettingsForm
            selectedProvider={selectedProvider}
            providers={providers}
            endpointInput={endpointInput}
            apiVersionInput={apiVersionInput}
            apiKeyInput={apiKeyInput}
            onEndpointChange={setEndpointInput}
            onApiVersionChange={setApiVersionInput}
            onApiKeyChange={setApiKeyInput}
          />
        </div>
      </div>
    </div>
  );
};

export default ProviderMenuInline;
