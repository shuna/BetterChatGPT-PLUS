import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FavoriteModel, ProviderConfig, ProviderId, ProviderModel } from '@type/provider';

import {
  formatModelPrice,
  SortDir,
  SortField,
  ProviderLoadingMap,
} from './providerMenuHelpers';

function SortHeader({
  field,
  label,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = currentField === field;
  const arrow = active ? (currentDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <span
      className={`cursor-pointer select-none hover:text-gray-300 ${active ? 'text-gray-200' : ''} ${className || ''}`}
      onClick={() => onSort(field)}
    >
      {label}
      {arrow}
    </span>
  );
}

const formatCreatedDate = (created?: number) =>
  created
    ? new Date(created * 1000).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '-';

const formatContextLength = (contextLength?: number) => {
  if (!contextLength) return '-';
  if (contextLength >= 1000000) return `${(contextLength / 1000000).toFixed(1)}M`;
  return `${Math.round(contextLength / 1000)}K`;
};

export function ManualModelInput({
  selectedProvider,
  favoriteModels,
  onToggleFavorite,
}: {
  selectedProvider: ProviderId;
  favoriteModels: FavoriteModel[];
  onToggleFavorite: (model: FavoriteModel) => void;
}) {
  const { t } = useTranslation('model');
  const [manualId, setManualId] = useState('');

  const handleAdd = () => {
    const id = manualId.trim();
    if (!id) return;
    const exists = favoriteModels.some(
      (f) => f.modelId === id && f.providerId === selectedProvider
    );
    if (exists) return;
    onToggleFavorite({
      modelId: id,
      providerId: selectedProvider,
      modelType: 'text',
      streamSupport: true,
    });
    setManualId('');
  };

  return (
    <div className='flex items-center gap-2 px-3 py-2 border-b dark:border-gray-600'>
      <input
        type='text'
        placeholder={t('provider.manualModelId', 'Enter custom model ID to add to list...') as string}
        value={manualId}
        onChange={(e) => setManualId(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        className='flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
      />
      <button
        onClick={handleAdd}
        disabled={!manualId.trim()}
        className='px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed'
      >
        {t('provider.addModel', 'Add')}
      </button>
    </div>
  );
}

export default function ProviderModelList({
  search,
  onSearchChange,
  loading,
  selectedProvider,
  filteredModels,
  providers,
  sortField,
  sortDir,
  onSort,
  favoriteModels,
  onToggleFavorite,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  loading: ProviderLoadingMap;
  selectedProvider: ProviderId;
  filteredModels: ProviderModel[];
  providers: Record<ProviderId, ProviderConfig>;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  favoriteModels: FavoriteModel[];
  onToggleFavorite: (model: FavoriteModel) => void;
}) {
  const { t } = useTranslation('model');

  const isFavorite = (modelId: string, providerId: ProviderId) =>
    favoriteModels.some(
      (favorite) =>
        favorite.modelId === modelId && favorite.providerId === providerId
    );

  return (
    <>
      <div className='flex items-center gap-2 p-3 border-b dark:border-gray-600'>
        <input
          type='text'
          placeholder={t('provider.search', 'Search models...') as string}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className='flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
        />
      </div>

      {!loading[selectedProvider] && filteredModels.length > 0 && (
        <div className='flex items-center gap-3 px-3 py-1.5 border-b dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 font-medium'>
          <span className='w-5' />
          <SortHeader
            field='alpha'
            label={t('provider.colName', 'Model') as string}
            currentField={sortField}
            currentDir={sortDir}
            onSort={onSort}
            className='flex-1'
          />
          <SortHeader
            field='created'
            label={t('provider.colCreated', 'Released') as string}
            currentField={sortField}
            currentDir={sortDir}
            onSort={onSort}
            className='hidden sm:inline w-20 text-right'
          />
          <SortHeader
            field='context'
            label={t('provider.colContext', 'Context') as string}
            currentField={sortField}
            currentDir={sortDir}
            onSort={onSort}
            className='hidden sm:inline w-20 text-right'
          />
          <SortHeader
            field='price'
            label={t('provider.colPrice', 'Price (In/Out)') as string}
            currentField={sortField}
            currentDir={sortDir}
            onSort={onSort}
            className='hidden md:inline w-28 text-right'
          />
        </div>
      )}

      <div className='flex-1 overflow-y-auto p-2'>
        {loading[selectedProvider] ? (
          <div className='flex items-center justify-center p-8 text-gray-500 dark:text-gray-400'>
            {t('provider.loading', 'Loading...')}
          </div>
        ) : filteredModels.length === 0 &&
          providers[selectedProvider]?.modelsRequireAuth &&
          !providers[selectedProvider]?.apiKey ? (
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
                  onToggleFavorite({
                    modelId: model.id,
                    providerId: model.providerId,
                    promptPrice: model.promptPrice,
                    completionPrice: model.completionPrice,
                    modelType: model.modelType,
                    streamSupport: model.streamSupport,
                  })
                }
                className='rounded'
              />
              <span className='flex-1 text-sm text-gray-900 dark:text-white truncate'>
                {model.name}
              </span>
              <span className='hidden sm:inline w-20 text-right text-xs text-gray-400 dark:text-gray-500'>
                {formatCreatedDate(model.created)}
              </span>
              <span className='hidden sm:inline w-20 text-right text-xs text-gray-400 dark:text-gray-500'>
                {formatContextLength(model.contextLength)}
              </span>
              <span className='hidden md:inline w-28 text-right text-xs text-gray-400 dark:text-gray-500'>
                {model.promptPrice != null && model.promptPrice >= 0
                  ? formatModelPrice(model.promptPrice, model.completionPrice)
                  : '-'}
              </span>
            </label>
          ))
        )}
      </div>
    </>
  );
}
