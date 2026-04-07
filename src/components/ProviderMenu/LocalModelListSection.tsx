/**
 * Local model list section for the Provider Menu.
 * Shows saved local models with favorite checkboxes.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import type { LocalModelDefinition } from '@src/local-llm/types';
import type { SavedModelMeta } from '@src/local-llm/storage';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import { formatBytes } from '@src/local-llm/device';

const LocalModelListSection = () => {
  const { t } = useTranslation('main');
  const localModels = useStore((s) => s.localModels);
  const savedMeta = useStore((s) => s.savedModelMeta);
  const favoriteIds = useStore((s) => s.favoriteLocalModelIds);
  const toggleFavorite = useStore((s) => s.toggleFavoriteLocalModel);

  // Show models that are saved in OPFS.
  // Merge localModels (persisted store) with catalog models whose savedModelMeta
  // indicates 'saved', so downloaded models appear even if addLocalModel was not
  // called (e.g. models downloaded before the fix, or before settings page was opened).
  const savedModels = useMemo(() => {
    const seen = new Set<string>();
    const result: LocalModelDefinition[] = [];

    // 1. Models already registered in localModels
    for (const m of localModels) {
      if (m.source !== 'opfs' || savedMeta[m.id]?.storageState !== 'saved') continue;
      seen.add(m.id);
      result.push(m);
    }

    // 2. Catalog models saved in OPFS but not yet in localModels
    for (const cm of CURATED_MODELS) {
      if (seen.has(cm.id)) continue;
      const meta = savedMeta[cm.id];
      if (!meta || meta.storageState !== 'saved') continue;
      result.push({
        id: cm.id,
        engine: cm.engine,
        tasks: cm.tasks,
        label: cm.label,
        origin: cm.huggingFaceRepo,
        source: 'opfs',
        manifest: cm.manifest,
        fileSize: meta.storedBytes || cm.expectedDownloadSize,
        displayMeta: cm.displayMeta,
      });
    }

    return result;
  }, [localModels, savedMeta]);

  if (savedModels.length === 0) return null;

  return (
    <div className='border-t border-gray-200 dark:border-gray-600 mt-2 pt-2'>
      <div className='px-4 py-2'>
        <span className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
          {t('localModel.localModelsGroup', 'Local Models')}
        </span>
      </div>
      <div className='flex flex-col'>
        {savedModels.map((model) => (
          <LocalModelRow
            key={model.id}
            model={model}
            meta={savedMeta[model.id]}
            isFavorite={favoriteIds.includes(model.id)}
            onToggleFavorite={() => toggleFavorite(model.id)}
          />
        ))}
      </div>
    </div>
  );
};

const LocalModelRow = ({
  model,
  meta,
  isFavorite,
  onToggleFavorite,
}: {
  model: LocalModelDefinition;
  meta: SavedModelMeta | undefined;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) => (
  <div className='flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors'>
    <input
      type='checkbox'
      checked={isFavorite}
      onChange={onToggleFavorite}
      className='h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0'
    />
    <div className='flex-1 min-w-0'>
      <span className='text-sm text-gray-900 dark:text-gray-100 truncate block'>
        {model.label}
      </span>
    </div>
    {model.displayMeta?.quantization && (
      <span className='text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 flex-shrink-0'>
        {model.displayMeta.quantization}
      </span>
    )}
    {model.displayMeta?.sourceLabel && (
      <span className='text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex-shrink-0'>
        {model.displayMeta.sourceLabel}
      </span>
    )}
    {model.fileSize && (
      <span className='text-xs text-gray-500 dark:text-gray-400 flex-shrink-0'>
        {formatBytes(model.fileSize)}
      </span>
    )}
  </div>
);

export default LocalModelListSection;
