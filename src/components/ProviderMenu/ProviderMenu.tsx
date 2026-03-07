import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import {
  ProviderId,
  ProviderConfig,
  ProviderModel,
  FavoriteModel,
  PROVIDER_ORDER,
} from '@store/provider-slice';
import { fetchProviderModels } from '@api/providerModels';
import CrossIcon2 from '@icon/CrossIcon2';

type SortField = 'alpha' | 'created' | 'context' | 'price';
type SortDir = 'asc' | 'desc';

function SortHeader({
  field, label, currentField, currentDir, onSort, className,
}: {
  field: SortField; label: string; currentField: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = currentField === field;
  const arrow = active ? (currentDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <span
      className={`cursor-pointer select-none hover:text-gray-300 ${active ? 'text-gray-200' : ''} ${className || ''}`}
      onClick={() => onSort(field)}
    >
      {label}{arrow}
    </span>
  );
}

function fmtUsd(v: number): string {
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

function formatPrice(prompt?: number, completion?: number): string {
  if (prompt == null) return '-';
  if (prompt === 0 && (completion == null || completion === 0)) return 'Free';
  return `${fmtUsd(prompt)} / ${completion != null ? fmtUsd(completion) : '-'}`;
}

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
  const [models, setModels] = useState<Record<ProviderId, ProviderModel[]>>({} as any);
  const [loading, setLoading] = useState<Record<ProviderId, boolean>>({} as any);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('alpha');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Default directions per field
      setSortDir(field === 'alpha' ? 'asc' : 'desc');
    }
  };
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [endpointInput, setEndpointInput] = useState('');
  const [apiVersionInput, setApiVersionInput] = useState('');

  // Sync inputs when provider changes
  useEffect(() => {
    setApiKeyInput(providers[selectedProvider]?.apiKey || '');
    setEndpointInput(providers[selectedProvider]?.endpoint || '');
    setApiVersionInput(apiVersion || '');
  }, [selectedProvider, providers, apiVersion]);

  const loadModels = useCallback(
    async (providerId: ProviderId) => {
      if (models[providerId]?.length) return;
      setLoading((prev) => ({ ...prev, [providerId]: true }));
      try {
        const result = await fetchProviderModels(providers[providerId]);
        setModels((prev) => ({ ...prev, [providerId]: result }));
      } finally {
        setLoading((prev) => ({ ...prev, [providerId]: false }));
      }
    },
    [providers, models]
  );

  // Load models when provider is selected
  useEffect(() => {
    loadModels(selectedProvider);
  }, [selectedProvider]);

  // Reload models when API key changes for current provider
  const handleSaveSettings = () => {
    const currentProvider = providers[selectedProvider];
    const hasConfigChanges =
      (currentProvider?.apiKey || '') !== apiKeyInput ||
      (currentProvider?.endpoint || '') !== endpointInput ||
      (apiVersion || '') !== apiVersionInput;

    if (!hasConfigChanges) return;

    setProviderApiKey(selectedProvider, apiKeyInput);
    setProviderEndpoint(selectedProvider, endpointInput);
    setApiVersion(apiVersionInput);
    const providerName = providers[selectedProvider]?.name || selectedProvider;

    // Show toast notification
    useStore.getState().setToastStatus('success');
    useStore.getState().setToastMessage(`${providerName}: ${t('provider.saved', '設定を保存しました')}`);
    useStore.getState().setToastShow(true);

    // Re-fetch models with new key without clearing existing list
    const updatedConfig = { ...currentProvider, apiKey: apiKeyInput, endpoint: endpointInput };
    setLoading((prev) => ({ ...prev, [selectedProvider]: true }));
    fetchProviderModels(updatedConfig)
      .then((result) => {
        if (result.length > 0) {
          setModels((prev) => ({ ...prev, [selectedProvider]: result }));
        }
      })
      .finally(() => {
        setLoading((prev) => ({ ...prev, [selectedProvider]: false }));
      });
  };

  const isFavorite = (modelId: string, providerId: ProviderId) =>
    favoriteModels.some(
      (f) => f.modelId === modelId && f.providerId === providerId
    );

  const currentModels = models[selectedProvider] || [];

  const filteredModels = currentModels
    .filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'alpha': cmp = a.name.localeCompare(b.name); break;
        case 'created': cmp = (a.created || 0) - (b.created || 0); break;
        case 'context': cmp = (a.contextLength || 0) - (b.contextLength || 0); break;
        case 'price': {
          const ap = a.promptPrice != null && a.promptPrice >= 0 ? a.promptPrice : Infinity;
          const bp = b.promptPrice != null && b.promptPrice >= 0 ? b.promptPrice : Infinity;
          cmp = ap - bp;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

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
    <div className='fixed top-0 left-0 z-[999] w-full p-4 overflow-x-hidden overflow-y-auto h-full flex justify-center items-center'>
      <div className='relative z-2 w-full max-w-4xl md:h-auto flex justify-center max-h-[80vh]'>
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

          {/* Body */}
          <div className='flex flex-1 overflow-hidden'>
            {/* Provider sidebar */}
            <div className='w-48 border-r dark:border-gray-600 overflow-y-auto flex-shrink-0'>
              {PROVIDER_ORDER.map((pid) => {
                const p = providers[pid];
                const favCount = favoriteModels.filter(
                  (f) => f.providerId === pid
                ).length;
                return (
                  <button
                    key={pid}
                    onClick={() => setSelectedProvider(pid)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors ${
                      selectedProvider === pid
                        ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    }`}
                  >
                    <span>{p.name}</span>
                    {favCount > 0 && (
                      <span className='text-xs bg-green-600 text-white rounded-full px-1.5 py-0.5 ml-1'>
                        {favCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Model list */}
            <div className='flex-1 flex flex-col overflow-hidden'>
              {/* Search */}
              <div className='flex items-center gap-2 p-3 border-b dark:border-gray-600'>
                <input
                  type='text'
                  placeholder={t('provider.search', 'Search models...') as string}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
              </div>

              {/* Column headers (clickable sort) */}
              {!loading[selectedProvider] && filteredModels.length > 0 && (
                <div className='flex items-center gap-3 px-3 py-1.5 border-b dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 font-medium'>
                  <span className='w-5' />
                  <SortHeader field='alpha' label={t('provider.colName', 'Model') as string} currentField={sortField} currentDir={sortDir} onSort={handleSort} className='flex-1' />
                  <SortHeader field='created' label={t('provider.colCreated', 'Released') as string} currentField={sortField} currentDir={sortDir} onSort={handleSort} className='w-20 text-right' />
                  <SortHeader field='context' label={t('provider.colContext', 'Context') as string} currentField={sortField} currentDir={sortDir} onSort={handleSort} className='w-20 text-right' />
                  <SortHeader field='price' label={t('provider.colPrice', 'Price (In/Out)') as string} currentField={sortField} currentDir={sortDir} onSort={handleSort} className='w-28 text-right' />
                </div>
              )}

              {/* Models */}
              <div className='flex-1 overflow-y-auto p-2'>
                {loading[selectedProvider] ? (
                  <div className='flex items-center justify-center p-8 text-gray-500 dark:text-gray-400'>
                    {t('provider.loading', 'Loading...')}
                  </div>
                ) : filteredModels.length === 0 && providers[selectedProvider]?.modelsRequireAuth && !providers[selectedProvider]?.apiKey ? (
                  <div className='flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 text-sm text-center'>
                    {t('provider.apiKeyRequired', 'APIキーを入力してモデルリストを取得してください')}
                  </div>
                ) : filteredModels.length === 0 ? (
                  <div className='flex items-center justify-center p-8 text-gray-500 dark:text-gray-400'>
                    {t('provider.noModels', 'No models found')}
                  </div>
                ) : (
                  filteredModels.map((model) => (
                    <label
                      key={model.id}
                      className='flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    >
                      <input
                        type='checkbox'
                        checked={isFavorite(model.id, model.providerId)}
                        onChange={() =>
                          toggleFavoriteModel({
                            modelId: model.id,
                            providerId: model.providerId,
                            promptPrice: model.promptPrice,
                            completionPrice: model.completionPrice,
                          })
                        }
                        className='rounded'
                      />
                      <span className='flex-1 text-sm text-gray-900 dark:text-white truncate'>
                        {model.name}
                      </span>
                      <span className='w-20 text-right text-xs text-gray-400 dark:text-gray-500'>
                        {model.created
                          ? new Date(model.created * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : '-'}
                      </span>
                      <span className='w-20 text-right text-xs text-gray-400 dark:text-gray-500'>
                        {model.contextLength
                          ? model.contextLength >= 1000000
                            ? `${(model.contextLength / 1000000).toFixed(1)}M`
                            : `${Math.round(model.contextLength / 1000)}K`
                          : '-'}
                      </span>
                      <span className='w-28 text-right text-xs text-gray-400 dark:text-gray-500'>
                        {model.promptPrice != null && model.promptPrice >= 0 ? formatPrice(model.promptPrice, model.completionPrice) : '-'}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* Provider Settings */}
              <div className='p-3 border-t dark:border-gray-600 flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <label className='text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap w-24'>
                    {t('provider.endpointLabel', 'Endpoint:')}
                  </label>
                  <input
                    type='text'
                    value={endpointInput}
                    onChange={(e) => setEndpointInput(e.target.value)}
                    placeholder={t('provider.enterEndpoint', 'API endpoint URL') as string}
                    className='flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                  />
                </div>
                {(selectedProvider === 'openai') && (
                  <div className='flex items-center gap-2'>
                    <label className='text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap w-24'>
                      {t('provider.apiVersionLabel', 'API Version:')}
                    </label>
                    <input
                      type='text'
                      value={apiVersionInput}
                      onChange={(e) => setApiVersionInput(e.target.value)}
                      placeholder={t('provider.apiVersionPlaceholder', 'e.g. 2023-07-01-preview (Azure)') as string}
                      className='flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                    />
                  </div>
                )}
                <div className='flex items-center gap-2'>
                  <label className='text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap w-24'>
                    {t('provider.apiKeyLabel', 'API Key:')}
                  </label>
                  <input
                    type='password'
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={t('provider.enterApiKey', 'Enter API key for {{name}}...', { name: providers[selectedProvider]?.name || selectedProvider }) as string}
                    className='flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                  />
                  <button
                    onClick={handleSaveSettings}
                    className='btn btn-primary text-sm px-4 py-2'
                  >
                    {t('provider.save', 'Save')}
                  </button>
                </div>
              </div>
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
