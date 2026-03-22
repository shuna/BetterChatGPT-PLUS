import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { showToast } from '@utils/showToast';
import { ProviderId } from '@type/provider';
import { PROVIDER_ORDER } from '@store/provider-config';
import CrossIcon2 from '@icon/CrossIcon2';
import {
  SortDir,
  SortField,
  sortModels,
  useProviderModels,
} from './providerMenuHelpers';
import ProviderModelList from './ProviderModelList';
import ProviderCustomModelList from './ProviderCustomModelList';
import ProviderSettingsForm from './ProviderSettingsForm';
import ProviderSidebar from './ProviderSidebar';

type ViewMode = 'browse' | 'custom';

const ProviderMenu = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation('model');
  const modalRoot = document.getElementById('modal-root');

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
    setApiKeyInput(providers[selectedProvider]?.apiKey || '');
    setEndpointInput(providers[selectedProvider]?.endpoint || '');
    setApiVersionInput(apiVersion || '');
  }, [selectedProvider, providers, apiVersion]);

  useEffect(() => {
    loadModels(selectedProvider);
  }, [loadModels, selectedProvider]);

  // Keep refs in sync for unmount save
  const stateRef = useRef({ selectedProvider, apiKeyInput, endpointInput, apiVersionInput });
  stateRef.current = { selectedProvider, apiKeyInput, endpointInput, apiVersionInput };

  const saveSettings = useCallback(() => {
    const s = stateRef.current;
    const currentProviders = useStore.getState().providers;
    const currentProvider = currentProviders[s.selectedProvider];
    const currentApiVersion = useStore.getState().apiVersion;
    const hasConfigChanges =
      (currentProvider?.apiKey || '') !== s.apiKeyInput ||
      (currentProvider?.endpoint || '') !== s.endpointInput ||
      (currentApiVersion || '') !== s.apiVersionInput;

    if (!hasConfigChanges) return;

    setProviderApiKey(s.selectedProvider, s.apiKeyInput);
    setProviderEndpoint(s.selectedProvider, s.endpointInput);
    setApiVersion(s.apiVersionInput);

    showToast(`${s.selectedProvider}: ${t('provider.saved', '設定を保存しました')}`, 'success');
  }, []);

  // Auto-save on unmount
  useEffect(() => {
    return () => { saveSettings(); };
  }, []);

  const currentModels = models[selectedProvider] || [];

  const filteredModels = useMemo(
    () => sortModels(currentModels, search, sortField, sortDir),
    [currentModels, search, sortDir, sortField]
  );

  const handleClose = () => setIsModalOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div className='fixed top-0 left-0 z-[999] w-full p-2 md:p-4 overflow-x-hidden overflow-y-auto h-full flex justify-center items-center'>
      <div className='relative z-2 w-full max-w-4xl md:h-auto flex justify-center max-h-[90vh] md:max-h-[80vh]'>
        <div className='relative bg-gray-50 rounded-lg shadow dark:bg-gray-700 w-full max-h-full overflow-hidden flex flex-col'>
          {/* Header */}
          <div className='flex items-center justify-between p-4 border-b dark:border-gray-600'>
            <h3 className='ml-2 text-lg font-semibold text-gray-900 dark:text-white'>
              {t('provider.title', 'AI Provider Settings')}
            </h3>
            <button
              type='button'
              className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white'
              onClick={handleClose}
            >
              <CrossIcon2 />
            </button>
          </div>

          {/* Mobile provider selector */}
          <div className='md:hidden p-3 border-b dark:border-gray-600'>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as ProviderId)}
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
            <ProviderSidebar
              providers={providers}
              favoriteModels={favoriteModels}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
            />

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

              {viewMode === 'browse' ? (
                <>
                  <ProviderModelList
                    search={search}
                    onSearchChange={setSearch}
                    loading={loading}
                    selectedProvider={selectedProvider}
                    filteredModels={filteredModels}
                    providers={providers}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    favoriteModels={favoriteModels}
                    onToggleFavorite={toggleFavoriteModel}
                  />

                </>
              ) : (
                <ProviderCustomModelList
                  selectedProvider={selectedProvider}
                  favoriteModels={favoriteModels}
                  onToggleFavorite={toggleFavoriteModel}
                />
              )}

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
      </div>
      <div
        className='bg-gray-800/90 absolute top-0 left-0 h-full w-full z-[-1]'
        onClick={handleClose}
      />
    </div>,
    modalRoot
  );
};

export default ProviderMenu;
