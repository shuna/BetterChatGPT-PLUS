import React from 'react';
import { useTranslation } from 'react-i18next';
import { getModelFit, formatBytes } from '@src/local-llm/device';
import type { LocalModelStatus } from '@src/local-llm/types';
import type { DownloadProgress } from '@src/local-llm/download';
import type { SavedModelMeta } from '@src/local-llm/storage';
import { StatusBadge, FitBadge, TaskBadges, ProgressBar } from './LocalModelBadges';
import { statusColors } from './localModelConstants';
import type { CatalogCardProps, TaskAssignmentRowProps } from './localModelConstants';

export const CatalogCard = ({
  model, deviceTier, meta, runtimeStatus, downloadProgress, resumeFallbackMessage,
  isFavorite, onToggleFavorite,
  onDownload, onCancel, onResume, onRetry, onDelete, onLoad, onUnload,
}: CatalogCardProps) => {
  const { t } = useTranslation('main');
  const fit = getModelFit(model.recommendedDeviceTier, deviceTier);
  const storageState = meta?.storageState ?? 'none';
  const isLoaded = runtimeStatus === 'ready' || runtimeStatus === 'busy';
  const isLoading = runtimeStatus === 'loading';

  return (
    <div className='px-4 py-3 flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 min-w-0'>
          {storageState === 'saved' && (
            <input
              type='checkbox'
              checked={isFavorite}
              onChange={onToggleFavorite}
              className='h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0'
              title={isFavorite ? t('localModel.unfavorite') as string : t('localModel.favorite') as string}
            />
          )}
          <span className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
            {model.label}
          </span>
          <FitBadge fit={fit} />
        </div>
        <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap'>
          {formatBytes(model.expectedDownloadSize)}
        </span>
      </div>

      <TaskBadges tasks={model.tasks} />

      {model.notes && (
        <p className='text-xs text-gray-500 dark:text-gray-400'>{model.notes}</p>
      )}

      {/* Actions based on state */}
      <div className='flex items-center gap-2 mt-1'>
        {storageState === 'none' && !downloadProgress && (
          <button
            className='btn btn-primary text-xs px-3 py-1'
            onClick={() => onDownload(model)}
          >
            {t('localModel.download')}
          </button>
        )}

        {(storageState === 'downloading' || downloadProgress) && (
          <>
            <div className='flex-1'>
              {downloadProgress && <ProgressBar progress={downloadProgress} />}
              {!downloadProgress && (
                <span className='text-xs text-gray-500'>{t('localModel.downloading')}</span>
              )}
            </div>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onCancel(model.id)}
            >
              {t('localModel.cancel')}
            </button>
          </>
        )}

        {storageState === 'partial' && !downloadProgress && (
          <>
            <span className='text-xs text-amber-600 dark:text-amber-400'>
              {t('localModel.storageState.partial')}
              {meta?.storedBytes ? ` (${t('localModel.partialSize')}: ${formatBytes(meta.storedBytes)})` : ''}
            </span>
            <button
              className='btn btn-primary text-xs px-3 py-1'
              onClick={() => onResume(model)}
            >
              {t('localModel.resume')}
            </button>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onRetry(model)}
            >
              {t('localModel.retry')}
            </button>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onDelete(model.id)}
            >
              {t('localModel.delete')}
            </button>
            {resumeFallbackMessage && (
              <span className='text-xs text-amber-600 dark:text-amber-400'>
                {resumeFallbackMessage}
              </span>
            )}
          </>
        )}

        {storageState === 'saved' && !isLoaded && !isLoading && (
          <>
            <span className='text-xs text-green-600 dark:text-green-400'>
              {t('localModel.storageState.saved')}
            </span>
            <button
              className='btn btn-primary text-xs px-3 py-1'
              onClick={() => onLoad(model)}
            >
              {t('localModel.load')}
            </button>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onDelete(model.id)}
            >
              {t('localModel.delete')}
            </button>
          </>
        )}

        {storageState === 'saved' && isLoading && (
          <StatusBadge status='loading' />
        )}

        {storageState === 'saved' && isLoaded && (
          <>
            <StatusBadge status={runtimeStatus} />
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onUnload(model.id)}
              disabled={runtimeStatus === 'busy'}
            >
              {t('localModel.unload')}
            </button>
          </>
        )}

        {meta?.lastError && storageState !== 'downloading' && (
          <span className='text-xs text-red-600 dark:text-red-400 truncate'>
            {meta.lastError}
          </span>
        )}
      </div>
    </div>
  );
};

export const DownloadedModelRow = ({
  modelId,
  label,
  tasks,
  fileSize,
  fitBadge,
  runtimeStatus,
  isSelected,
  onSelect,
  isFavorite,
  onToggleFavorite,
  onUnload,
  onDelete,
}: {
  modelId: string;
  label: string;
  tasks: string[];
  fileSize?: number;
  fitBadge?: React.ReactNode;
  runtimeStatus: LocalModelStatus;
  isSelected: boolean;
  onSelect: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onUnload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}) => {
  const { t } = useTranslation('main');
  const isLoaded = runtimeStatus === 'ready' || runtimeStatus === 'busy';
  const isLoading = runtimeStatus === 'loading';
  const canSelect = !isLoaded && !isLoading;

  return (
    <div
      className={`px-4 py-2.5 flex flex-col gap-1 ${canSelect ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors' : ''}`}
      onClick={canSelect ? onSelect : undefined}
    >
      <div className='flex items-center gap-3'>
        <div className='flex-shrink-0 w-5 flex justify-center'>
          {canSelect && (
            <input
              type='radio'
              checked={isSelected}
              onChange={onSelect}
              onClick={(e) => e.stopPropagation()}
              className='h-4 w-4 border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500'
            />
          )}
          {(isLoaded || isLoading) && (
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[runtimeStatus]}`}
              title={t(`localModel.modelStatus.${runtimeStatus}`) as string}
            />
          )}
        </div>
        <span className='flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 break-words'>
          {label}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${
            isFavorite
              ? 'text-yellow-500 hover:text-yellow-600'
              : 'text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500'
          }`}
          title={isFavorite ? t('localModel.unfavorite') as string : t('localModel.favorite') as string}
        >
          <svg className='w-4 h-4' viewBox='0 0 20 20' fill='currentColor'>
            <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
          </svg>
        </button>

        {isLoaded && (
          <button
            className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40'
            onClick={(e) => { e.stopPropagation(); onUnload(modelId); }}
            disabled={runtimeStatus === 'busy'}
          >
            {t('localModel.unload')}
          </button>
        )}

        {canSelect && (
          <button
            className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            onClick={(e) => { e.stopPropagation(); onDelete(modelId); }}
          >
            {t('localModel.delete')}
          </button>
        )}

        {isLoading && (
          <span className='flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 animate-pulse'>
            {t('localModel.modelStatus.loading')}
          </span>
        )}
      </div>

      <div className='flex items-center gap-2 pl-8 flex-wrap'>
        {fitBadge}
        <TaskBadges tasks={tasks} />
        {fileSize != null && (
          <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap'>
            {formatBytes(fileSize)}
          </span>
        )}
      </div>
    </div>
  );
};

export const DownloadingModelRow = ({
  modelId,
  label,
  tasks,
  fileSize,
  progress,
  meta,
  isFavorite,
  onToggleFavorite,
  onCancel,
  onResume,
  onRetry,
  onDelete,
}: {
  modelId: string;
  label: string;
  tasks: string[];
  fileSize?: number;
  progress: DownloadProgress | null;
  meta: SavedModelMeta;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCancel: (modelId: string) => void;
  onResume: (modelId: string) => void;
  onRetry: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}) => {
  const { t } = useTranslation('main');
  const isActivelyDownloading = meta.storageState === 'downloading' && progress != null;
  const hasError = meta.storageState === 'partial' && !!meta.lastError;
  const isInterrupted = meta.storageState === 'partial' || (meta.storageState === 'downloading' && !progress);

  return (
    <div className='px-4 py-2.5 flex flex-col gap-1'>
      <div className='flex items-center gap-3'>
        <div className='flex-shrink-0 w-5 flex justify-center'>
          {isActivelyDownloading && (
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse' />
          )}
          {isInterrupted && !hasError && (
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-yellow-400' />
          )}
          {hasError && (
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-500' />
          )}
        </div>
        <span className='flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 break-words'>
          {label}
        </span>

        <button
          onClick={onToggleFavorite}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${
            isFavorite
              ? 'text-yellow-500 hover:text-yellow-600'
              : 'text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500'
          }`}
          title={isFavorite ? t('localModel.unfavorite') as string : t('localModel.favorite') as string}
        >
          <svg className='w-4 h-4' viewBox='0 0 20 20' fill='currentColor'>
            <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
          </svg>
        </button>

        {isActivelyDownloading && (
          <button
            className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            onClick={() => onCancel(modelId)}
          >
            {t('localModel.cancel')}
          </button>
        )}

        {isInterrupted && (
          <>
            <button
              className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
              onClick={() => (hasError ? onRetry(modelId) : onResume(modelId))}
            >
              {hasError ? t('localModel.retry') : t('localModel.resume')}
            </button>
            <button
              className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              onClick={() => onDelete(modelId)}
            >
              {t('localModel.delete')}
            </button>
          </>
        )}
      </div>

      <div className='flex flex-col gap-1 pl-8'>
        <div className='flex items-center gap-2 flex-wrap'>
          <TaskBadges tasks={tasks} />
          {fileSize != null && (
            <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap'>
              {formatBytes(fileSize)}
            </span>
          )}
          {isInterrupted && !hasError && (
            <span className='text-xs text-amber-600 dark:text-amber-400'>
              {t('localModel.downloadInterrupted')}
            </span>
          )}
        </div>
        {isActivelyDownloading && <ProgressBar progress={progress} />}
        {hasError && (
          <span className='text-xs text-red-600 dark:text-red-400 break-words'>
            {meta.lastError}
          </span>
        )}
      </div>
    </div>
  );
};

export const TaskAssignmentRow = ({
  task, taskLabel, currentModelId, candidates,
  isCurrentLoaded, onAssign, requiresLoadText,
}: TaskAssignmentRowProps) => {
  return (
    <div className='px-4 py-3 flex flex-col gap-1.5'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        <span className='text-sm font-medium text-gray-900 dark:text-gray-300 whitespace-nowrap'>
          {taskLabel}
        </span>
        <select
          className='flex-1 min-w-[180px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
          value={currentModelId ?? ''}
          onChange={(e) => onAssign(task, e.target.value || null)}
        >
          <option value=''>—</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.statusLabel})
            </option>
          ))}
        </select>
      </div>
      {currentModelId && !isCurrentLoaded && (
        <span className='text-xs text-amber-600 dark:text-amber-400'>
          {requiresLoadText}
        </span>
      )}
    </div>
  );
};
