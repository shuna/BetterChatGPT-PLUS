import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import type { CustomProviderModel, FavoriteModel, ProviderId } from '@type/provider';

interface Props {
  selectedProvider: ProviderId;
  favoriteModels: FavoriteModel[];
  onToggleFavorite: (model: FavoriteModel) => void;
}

const emptyForm: Omit<CustomProviderModel, 'providerId'> = {
  modelId: '',
  name: '',
  modelType: 'text',
  contextLength: 128000,
  promptPrice: 0,
  completionPrice: 0,
  imagePrice: 0,
  streamSupport: true,
};

export default function ProviderCustomModelList({
  selectedProvider,
  favoriteModels,
  onToggleFavorite,
}: Props) {
  const { t } = useTranslation('model');
  const providerCustomModels = useStore((s) => s.providerCustomModels);
  const addProviderCustomModel = useStore((s) => s.addProviderCustomModel);
  const updateProviderCustomModel = useStore((s) => s.updateProviderCustomModel);
  const removeProviderCustomModel = useStore((s) => s.removeProviderCustomModel);

  const models = providerCustomModels[selectedProvider] || [];

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = form.modelId.trim();
    if (!id) return;

    if (editingId) {
      updateProviderCustomModel(selectedProvider, editingId, {
        ...form,
        modelId: id,
      });
      resetForm();
      return;
    }

    // Check duplicate
    if (models.some((m) => m.modelId === id)) {
      setError(t('custom.duplicateError', 'This Model ID already exists for this provider') as string);
      return;
    }

    addProviderCustomModel({
      ...form,
      modelId: id,
      providerId: selectedProvider,
    });
    resetForm();
  };

  const handleEdit = (model: CustomProviderModel) => {
    setForm({
      modelId: model.modelId,
      name: model.name || '',
      modelType: model.modelType,
      contextLength: model.contextLength ?? 128000,
      promptPrice: model.promptPrice ?? 0,
      completionPrice: model.completionPrice ?? 0,
      imagePrice: model.imagePrice ?? 0,
      streamSupport: model.streamSupport ?? true,
    });
    setEditingId(model.modelId);
    setError('');
  };

  const handleDelete = (modelId: string) => {
    removeProviderCustomModel(selectedProvider, modelId);
    if (editingId === modelId) resetForm();
  };

  const handleToggleFavorite = (model: CustomProviderModel) => {
    onToggleFavorite({
      modelId: model.modelId,
      providerId: model.providerId,
      modelType: model.modelType,
      promptPrice: model.promptPrice,
      completionPrice: model.completionPrice,
      imagePrice: model.imagePrice,
      contextLength: model.contextLength,
      streamSupport: model.streamSupport,
    });
  };

  const isFavorite = (modelId: string) =>
    favoriteModels.some(
      (f) => f.modelId === modelId && f.providerId === selectedProvider
    );

  const inputClass =
    'w-full px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5';

  return (
    <div className='flex flex-col flex-1 overflow-hidden'>
      {/* Model list */}
      <div className='flex-1 overflow-y-auto p-2'>
        {models.length === 0 ? (
          <div className='flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 text-sm'>
            {t('custom.noModels', 'No custom models added yet')}
          </div>
        ) : (
          models.map((model) => (
            <div
              key={model.modelId}
              className='flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600/50'
            >
              <input
                type='checkbox'
                checked={isFavorite(model.modelId)}
                onChange={() => handleToggleFavorite(model)}
                className='rounded'
              />
              <span className='flex-1 text-sm text-gray-900 dark:text-white truncate'>
                {model.name || model.modelId}
              </span>
              <span className='text-xs text-gray-400'>
                {model.modelType === 'image' ? '🖼' : '📝'}
              </span>
              <button
                onClick={() => handleEdit(model)}
                className='px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded'
              >
                {t('custom.edit', 'Edit')}
              </button>
              <button
                onClick={() => handleDelete(model.modelId)}
                className='px-2 py-0.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded'
              >
                {t('custom.delete', 'Delete')}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit form */}
      <div className='border-t dark:border-gray-600 p-3'>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          {editingId
            ? t('custom.editModel', 'Edit Model')
            : t('custom.addModel', 'Add Model')}
        </h4>
        <form onSubmit={handleSubmit} className='space-y-2'>
          <div className='grid grid-cols-2 gap-2'>
            <div>
              <label className={labelClass}>Model ID *</label>
              <input
                type='text'
                value={form.modelId}
                onChange={(e) => {
                  setForm({ ...form, modelId: e.target.value });
                  setError('');
                }}
                placeholder='e.g. gpt-4o-custom'
                className={inputClass}
                disabled={!!editingId}
                required
              />
            </div>
            <div>
              <label className={labelClass}>{t('custom.displayName', 'Display Name')}</label>
              <input
                type='text'
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className='grid grid-cols-3 gap-2'>
            <div>
              <label className={labelClass}>{t('custom.modelType', 'Model Type')}</label>
              <select
                value={form.modelType}
                onChange={(e) =>
                  setForm({ ...form, modelType: e.target.value as 'text' | 'image' })
                }
                className={inputClass}
              >
                <option value='text'>Text</option>
                <option value='image'>Image</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('custom.contextLength', 'Context Length')}</label>
              <input
                type='number'
                value={form.contextLength ?? ''}
                onChange={(e) =>
                  setForm({ ...form, contextLength: e.target.value ? Number(e.target.value) : undefined })
                }
                className={inputClass}
              />
            </div>
            <div className='flex items-end pb-1'>
              <label className='flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400'>
                <input
                  type='checkbox'
                  checked={form.streamSupport ?? true}
                  onChange={(e) => setForm({ ...form, streamSupport: e.target.checked })}
                  className='rounded'
                />
                {t('custom.streamSupport', 'Stream')}
              </label>
            </div>
          </div>

          <div className='grid grid-cols-3 gap-2'>
            <div>
              <label className={labelClass}>{t('custom.promptPrice', 'Prompt Price')}</label>
              <input
                type='number'
                step='any'
                value={form.promptPrice ?? ''}
                onChange={(e) =>
                  setForm({ ...form, promptPrice: e.target.value ? Number(e.target.value) : undefined })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('custom.completionPrice', 'Completion Price')}</label>
              <input
                type='number'
                step='any'
                value={form.completionPrice ?? ''}
                onChange={(e) =>
                  setForm({ ...form, completionPrice: e.target.value ? Number(e.target.value) : undefined })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('custom.imagePrice', 'Image Price')}</label>
              <input
                type='number'
                step='any'
                value={form.imagePrice ?? ''}
                onChange={(e) =>
                  setForm({ ...form, imagePrice: e.target.value ? Number(e.target.value) : undefined })
                }
                className={inputClass}
              />
            </div>
          </div>

          {error && (
            <p className='text-xs text-red-500'>{error}</p>
          )}

          <div className='flex gap-2'>
            <button
              type='submit'
              disabled={!form.modelId.trim()}
              className='px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed'
            >
              {editingId ? t('custom.save', 'Save') : t('custom.add', 'Add')}
            </button>
            {editingId && (
              <button
                type='button'
                onClick={resetForm}
                className='px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded'
              >
                {t('custom.cancel', 'Cancel')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
