import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listAllOpfsEntries,
  clearAllModels,
  deleteModel,
  deleteModelFile,
  getTotalStorageUsed,
} from '@src/local-llm/storage';
import type { OpfsModelEntry } from '@src/local-llm/storage';
import { formatBytes } from '@src/local-llm/device';
import { localModelRuntime } from '@src/local-llm/runtime';
import type { LocalModelTask } from '@src/local-llm/types';
import useStore from '@store/store';

// ---------------------------------------------------------------------------
// OpfsFileBrowser — visual file browser for OPFS model storage
// ---------------------------------------------------------------------------

const OpfsFileBrowser = ({
  onStorageChanged,
  refreshTrigger,
}: {
  /** Called after any deletion so the parent can refresh metadata */
  onStorageChanged?: () => void;
  /** Increment this counter to trigger a refresh from parent events (download start/stop/complete, load, etc.) */
  refreshTrigger?: number;
}) => {
  const { t } = useTranslation('main');
  const [entries, setEntries] = useState<OpfsModelEntry[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, total] = await Promise.all([
        listAllOpfsEntries(),
        getTotalStorageUsed(),
      ]);
      setEntries(list);
      setTotalSize(total);
    } catch {
      // OPFS unavailable
      setEntries([]);
      setTotalSize(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-scan OPFS when the parent signals a storage mutation
  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((modelId: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }, []);

  const handleDeleteModel = useCallback(async (modelId: string) => {
    if (!window.confirm(t('localModel.opfsBrowser.confirmDeleteModel') as string)) return;
    setDeleting(modelId);
    try {
      // Unload if running
      if (localModelRuntime.isLoaded(modelId)) {
        await localModelRuntime.unloadModel(modelId);
      }
      await deleteModel(modelId);
      // Clean store — metadata, definition, and task assignments
      const store = useStore.getState();
      for (const task of Object.keys(store.activeLocalModels) as LocalModelTask[]) {
        if (store.activeLocalModels[task] === modelId) {
          store.setActiveLocalModel(task, null);
        }
      }
      store.removeSavedModelMeta(modelId);
      store.removeLocalModel(modelId);
      onStorageChanged?.();
      await refresh();
    } catch {
      // ignore
    }
    setDeleting(null);
  }, [t, refresh, onStorageChanged]);

  const handleDeleteFile = useCallback(async (modelId: string, fileName: string) => {
    if (!window.confirm(
      (t('localModel.opfsBrowser.confirmDeleteFile') as string).replace('{{file}}', fileName),
    )) return;
    setDeleting(`${modelId}/${fileName}`);
    try {
      await deleteModelFile(modelId, fileName);
      // If this is a .part marker, also delete the corresponding data file
      // (in the current design, data is written to the final name and .part
      // is a zero-byte marker; leaving the data file would make a partial
      // download look "saved").
      if (fileName.endsWith('.part')) {
        const dataFileName = fileName.slice(0, -'.part'.length);
        try {
          await deleteModelFile(modelId, dataFileName);
        } catch {
          // Data file may not exist
        }
      }
      onStorageChanged?.();
      await refresh();
    } catch {
      // ignore
    }
    setDeleting(null);
  }, [t, refresh, onStorageChanged]);

  const handleClearAll = useCallback(async () => {
    if (!window.confirm(t('localModel.opfsBrowser.confirmClearAll') as string)) return;
    setDeleting('__all__');
    try {
      // Unload all running models
      const store = useStore.getState();
      for (const entry of entries) {
        if (localModelRuntime.isLoaded(entry.modelId)) {
          await localModelRuntime.unloadModel(entry.modelId);
        }
      }
      const deleted = await clearAllModels();
      // Clean store for all deleted models
      for (const id of deleted) {
        store.removeSavedModelMeta(id);
        store.removeLocalModel(id);
      }
      // Clear active assignments
      for (const task of Object.keys(store.activeLocalModels)) {
        store.setActiveLocalModel(task as any, null);
      }
      onStorageChanged?.();
      await refresh();
    } catch {
      // ignore
    }
    setDeleting(null);
  }, [t, entries, refresh, onStorageChanged]);

  const isDeleting = deleting !== null;

  return (
    <div className='space-y-3'>
      {/* Header: total storage + actions */}
      <div className='flex items-center justify-between px-4 py-2'>
        <div className='text-sm text-gray-700 dark:text-gray-300'>
          <span className='font-medium'>{t('localModel.opfsBrowser.totalUsage')}:</span>{' '}
          <span className='font-mono'>{formatBytes(totalSize)}</span>
          {entries.length > 0 && (
            <span className='text-gray-500 dark:text-gray-400 ml-2'>
              ({entries.length} {entries.length === 1
                ? t('localModel.opfsBrowser.model')
                : t('localModel.opfsBrowser.models')})
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <button
            className='text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50'
            onClick={refresh}
            disabled={loading || isDeleting}
          >
            {loading ? '...' : t('localModel.opfsBrowser.refresh')}
          </button>
          {entries.length > 0 && (
            <button
              className='text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50'
              onClick={handleClearAll}
              disabled={isDeleting}
            >
              {deleting === '__all__'
                ? t('localModel.opfsBrowser.clearing')
                : t('localModel.opfsBrowser.clearAll')}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className='px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center'>
          {t('localModel.opfsBrowser.empty')}
        </div>
      )}

      {/* Model list */}
      {entries.map((entry) => {
        const isExpanded = expandedModels.has(entry.modelId);
        const tempFiles = entry.files.filter((f) => f.isTemp);
        const finalFiles = entry.files.filter((f) => !f.isTemp);

        return (
          <div
            key={entry.modelId}
            className='border border-gray-200 dark:border-gray-600 rounded-lg mx-4 overflow-hidden'
          >
            {/* Model header row */}
            <div className='flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-750'>
              <button
                className='flex-1 flex items-center gap-2 text-left min-w-0'
                onClick={() => toggleExpand(entry.modelId)}
              >
                <span className='text-xs text-gray-400 select-none flex-shrink-0'>
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span className='text-sm font-medium text-gray-800 dark:text-gray-200 truncate'>
                  {entry.modelId}
                </span>
                <span className='text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0'>
                  {formatBytes(entry.totalSize)}
                </span>
                {tempFiles.length > 0 && (
                  <span className='text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0'>
                    {t('localModel.opfsBrowser.tempFiles', { count: tempFiles.length })}
                  </span>
                )}
              </button>
              <button
                className='text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 flex-shrink-0 ml-2'
                onClick={() => handleDeleteModel(entry.modelId)}
                disabled={isDeleting}
              >
                {deleting === entry.modelId
                  ? '...'
                  : t('localModel.delete')}
              </button>
            </div>

            {/* Expanded file list */}
            {isExpanded && (
              <div className='divide-y divide-gray-100 dark:divide-gray-700'>
                {entry.files.length === 0 ? (
                  <div className='px-3 py-2 text-xs text-gray-400'>
                    {t('localModel.opfsBrowser.noFiles')}
                  </div>
                ) : (
                  entry.files.map((file) => (
                    <div
                      key={file.name}
                      className='flex items-center justify-between px-3 py-1.5 text-xs'
                    >
                      <div className='flex items-center gap-2 min-w-0 flex-1'>
                        <span className='text-gray-400 flex-shrink-0'>
                          {file.isTemp ? '⏳' : '📄'}
                        </span>
                        <span className={`truncate ${
                          file.isTemp
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {file.name}
                        </span>
                        <span className='text-gray-500 dark:text-gray-400 font-mono flex-shrink-0'>
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      {file.isTemp && (
                        <button
                          className='text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-1 disabled:opacity-50 flex-shrink-0'
                          onClick={() => handleDeleteFile(entry.modelId, file.name)}
                          disabled={isDeleting}
                          title={t('localModel.delete') as string}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))
                )}

                {/* Summary row */}
                <div className='px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50'>
                  {finalFiles.length} {t('localModel.opfsBrowser.finalFiles')}
                  {tempFiles.length > 0 && (
                    <span className='ml-2 text-amber-600 dark:text-amber-400'>
                      + {tempFiles.length} {t('localModel.opfsBrowser.tempLabel')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default OpfsFileBrowser;
