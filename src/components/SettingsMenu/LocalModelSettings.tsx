import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';
import { SettingsGroup } from './SettingsMenu';
import { localModelRuntime } from '@src/local-llm/runtime';
import { EphemeralFileProvider } from '@src/local-llm/fileProvider';
import { OpfsFileProvider, getTempFileSize } from '@src/local-llm/storage';
import { rehydrateSavedModels, deleteModel } from '@src/local-llm/storage';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import type { CatalogModel } from '@src/local-llm/catalog';
import { downloadCatalogModel, downloadModelFiles } from '@src/local-llm/download';
import type { DownloadProgress, DownloadCallbacks } from '@src/local-llm/download';
import { estimateDeviceTier, getModelFit, formatBytes } from '@src/local-llm/device';
import type { DeviceTier, ModelFitLabel } from '@src/local-llm/device';
import { localAnalyze, localFormat } from '@api/localGeneration';
import type {
  LocalModelDefinition,
  LocalModelStatus,
  LocalModelTask,
  HfSearchResult,
  GgufVariant,
  GgufRepoResolution,
  HfSearchQuery,
} from '@src/local-llm/types';
import type { SavedModelMeta } from '@src/local-llm/storage';
import {
  searchHfModels,
  resolveGgufFiles,
  resolveSearchCandidate,
  generateSearchModelId,
} from '@src/local-llm/hfSearch';
import {
  saveSearchSession,
  loadSearchSession,
  clearSearchSession,
} from './localModelSearchSession';
import OpfsFileBrowser from './OpfsFileBrowser';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusColors: Record<LocalModelStatus, string> = {
  idle: 'bg-gray-300 dark:bg-gray-600',
  loading: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-500',
  busy: 'bg-blue-500 animate-pulse',
  error: 'bg-red-500',
  unloaded: 'bg-gray-300 dark:bg-gray-600',
};

const StatusBadge = ({ status }: { status: LocalModelStatus }) => {
  const { t } = useTranslation('main');
  return (
    <span className='inline-flex items-center gap-1.5 text-xs'>
      <span className={`inline-block w-2 h-2 rounded-full ${statusColors[status]}`} />
      <span className='text-gray-600 dark:text-gray-400'>
        {t(`localModel.modelStatus.${status}`)}
      </span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Fit label badge
// ---------------------------------------------------------------------------

const fitColors: Record<ModelFitLabel, string> = {
  lightweight: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  recommended: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  heavy: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  'very-heavy': 'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30',
  extreme: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
  'not-recommended': 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

const FitBadge = ({ fit, variant = 'catalog' }: { fit: ModelFitLabel; variant?: 'catalog' | 'search' }) => {
  const { t } = useTranslation('main');
  const [showTip, setShowTip] = useState(false);
  const recommendedLabel = variant === 'search'
    ? t('localModel.modelFit.balanced')
    : t('localModel.modelFit.recommended');
  const labels: Record<ModelFitLabel, string> = {
    lightweight: t('localModel.modelFit.lightweight'),
    recommended: recommendedLabel,
    heavy: t('localModel.modelFit.heavy'),
    'very-heavy': t('localModel.modelFit.veryHeavy'),
    extreme: t('localModel.modelFit.extreme'),
    'not-recommended': t('localModel.modelFit.notRecommended'),
  };
  const reasons: Record<ModelFitLabel, string> = {
    lightweight: t('localModel.fitReason.lightweight'),
    recommended: t('localModel.fitReason.recommended'),
    heavy: t('localModel.fitReason.heavy'),
    'very-heavy': t('localModel.fitReason.veryHeavy'),
    extreme: t('localModel.fitReason.extreme'),
    'not-recommended': t('localModel.fitReason.notRecommended'),
  };
  return (
    <span className='relative inline-flex flex-shrink-0'>
      <button
        type='button'
        className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap inline-flex items-center gap-0.5 ${fitColors[fit]}`}
        onClick={() => setShowTip((v) => !v)}
        onBlur={() => setShowTip(false)}
      >
        {labels[fit]}
        <svg className='w-3 h-3 opacity-60' viewBox='0 0 16 16' fill='currentColor'><path d='M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h2v5h-2V7z'/></svg>
      </button>
      {showTip && (
        <div className='absolute z-50 bottom-full mb-1 right-0 w-52 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-relaxed shadow-lg pointer-events-none'>
          {reasons[fit]}
        </div>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Task badges
// ---------------------------------------------------------------------------

const TaskBadges = ({ tasks }: { tasks: string[] }) => (
  <div className='flex gap-1'>
    {tasks.map((task) => (
      <span key={task} className='text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'>
        {task}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

const ProgressBar = ({ progress }: { progress: DownloadProgress }) => {
  const pct = progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0;
  return (
    <div className='flex flex-col gap-1'>
      <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2'>
        <div
          className='bg-blue-500 h-2 rounded-full transition-all duration-300'
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='text-xs text-gray-500 dark:text-gray-400'>
        {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
        {progress.fileCount > 1 && ` (${progress.fileIndex + 1}/${progress.fileCount})`}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Catalog model card
// ---------------------------------------------------------------------------

interface CatalogCardProps {
  model: CatalogModel;
  deviceTier: DeviceTier;
  meta: SavedModelMeta | undefined;
  runtimeStatus: LocalModelStatus;
  downloadProgress: DownloadProgress | null;
  resumeFallbackMessage: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onDownload: (model: CatalogModel) => void;
  onCancel: (modelId: string) => void;
  onResume: (model: CatalogModel) => void;
  onRetry: (model: CatalogModel) => void;
  onDelete: (modelId: string) => void;
  onLoad: (model: CatalogModel) => void;
  onUnload: (modelId: string) => void;
}

const CatalogCard = ({
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

// ---------------------------------------------------------------------------
// Downloaded model row (unified for catalog + search models)
// ---------------------------------------------------------------------------

const DownloadedModelRow = ({
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
      {/* Row 1: radio/status + model name + actions (right) */}
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

        {/* Favorite star */}
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

        {/* Unload (loaded models) */}
        {isLoaded && (
          <button
            className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40'
            onClick={(e) => { e.stopPropagation(); onUnload(modelId); }}
            disabled={runtimeStatus === 'busy'}
          >
            {t('localModel.unload')}
          </button>
        )}

        {/* Delete (non-loaded models) */}
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

      {/* Row 2: badges + size — indented to align with label */}
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

// ---------------------------------------------------------------------------
// Downloading / partial model row
// ---------------------------------------------------------------------------

const DownloadingModelRow = ({
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
      {/* Row 1: model name + actions */}
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

        {/* Favorite star */}
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

        {/* Cancel (active download) */}
        {isActivelyDownloading && (
          <button
            className='flex-shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            onClick={() => onCancel(modelId)}
          >
            {t('localModel.cancel')}
          </button>
        )}

        {/* Resume / Retry + Delete (interrupted / error) */}
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

      {/* Row 2: badges + size + progress or error */}
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

// ---------------------------------------------------------------------------
// Task assignment helpers
// ---------------------------------------------------------------------------

/** Tasks that are assignable in the UI. Order matters for rendering. */
const ASSIGNABLE_TASKS: LocalModelTask[] = ['generation', 'analysis'];

function getModelStatusLabel(
  modelId: string,
  source: string,
  runtimeStatus: LocalModelStatus,
): 'loaded' | 'saved' | 'imported' | 'notLoaded' {
  if (runtimeStatus === 'ready' || runtimeStatus === 'busy') return 'loaded';
  if (source === 'ephemeral-file') return 'imported';
  if (source === 'opfs') return 'saved';
  return 'notLoaded';
}

// ---------------------------------------------------------------------------
// Task assignment dropdown
// ---------------------------------------------------------------------------

interface TaskAssignmentRowProps {
  task: LocalModelTask;
  taskLabel: string;
  currentModelId: string | undefined;
  candidates: Array<{
    id: string;
    label: string;
    statusLabel: string;
  }>;
  isCurrentLoaded: boolean;
  onAssign: (task: LocalModelTask, modelId: string | null) => void;
  requiresLoadText: string;
}

const TaskAssignmentRow = ({
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

// ---------------------------------------------------------------------------
// Support status badge (for HF search results)
// ---------------------------------------------------------------------------

const supportColors: Record<string, string> = {
  supported: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  'needs-manual-review': 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  unsupported: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

const SupportBadge = ({ status, t }: { status: string; t: (k: string) => string }) => {
  const key = status === 'needs-manual-review' ? 'needsManualReview' : status;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${supportColors[status] ?? supportColors.unsupported}`}>
      {t(`localModel.${key}`)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Variant status badge
// ---------------------------------------------------------------------------

const variantStatusColors: Record<string, string> = {
  supported: 'text-green-700 dark:text-green-400',
  'not-recommended': 'text-amber-700 dark:text-amber-400',
  unsupported: 'text-red-700 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Search result card
// ---------------------------------------------------------------------------

interface SearchResultCardProps {
  result: HfSearchResult;
  variants: GgufRepoResolution | null;
  variantsLoading: boolean;
  selectedFileName: string | null;
  deviceTier: DeviceTier;
  /** modelId → SavedModelMeta for all search-added models from this repo */
  savedMetas: Record<string, SavedModelMeta>;
  /** modelId → DownloadProgress for active downloads from this repo */
  progresses: Record<string, DownloadProgress>;
  /** modelId → LocalModelStatus for runtime statuses */
  statuses: Record<string, LocalModelStatus>;
  resumeFallbackMessage: string | null;
  /** If this variant is already downloaded/downloading under another model ID */
  existingModelId: string | null;
  existingModelState?: 'saved' | 'downloading' | 'partial' | null;
  onSelectVariant: (repoId: string, fileName: string) => void;
  onDownload: (result: HfSearchResult, variant: GgufVariant) => void;
  onResume: (result: HfSearchResult, variant: GgufVariant) => void;
  onRetry: (result: HfSearchResult, variant: GgufVariant) => void;
  onCancel: (modelId: string) => void;
  onLoad: (result: HfSearchResult, variant: GgufVariant) => void;
  onUnload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

const SortableColumnHeader = ({ label, field, width, currentSort, currentDir, onSort, className: extraClass }: {
  label: string;
  field: string;
  width: string;
  currentSort: string;
  currentDir: 'asc' | 'desc';
  onSort: (field: string, dir: 'asc' | 'desc') => void;
  className?: string;
}) => {
  const isActive = currentSort === field;
  return (
    <span
      className={`${extraClass ?? 'hidden sm:inline'} ${width} text-right text-[12px] cursor-pointer select-none hover:text-gray-300 ${isActive ? 'font-semibold text-gray-200' : 'font-medium text-gray-500 dark:text-gray-400'}`}
      onClick={() => {
        if (isActive) {
          onSort(field, currentDir === 'desc' ? 'asc' : 'desc');
        } else {
          onSort(field, 'desc');
        }
      }}
    >
      {label}{isActive ? (currentDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Filter info button (tooltip for search exclusions)
// ---------------------------------------------------------------------------

const FilterInfoButton = () => {
  const { t } = useTranslation('main');
  const [showTip, setShowTip] = useState(false);
  return (
    <span className='relative inline-flex flex-shrink-0'>
      <button
        type='button'
        className='inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
        onClick={() => setShowTip((v) => !v)}
        onBlur={() => setShowTip(false)}
      >
        {t('localModel.hfSearchAboutExclusion')}
        <svg className='w-3 h-3' viewBox='0 0 16 16' fill='currentColor'><path d='M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h2v5h-2V7z'/></svg>
      </button>
      {showTip && (
        <div className='absolute z-50 top-full mt-1 right-0 w-64 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-600 text-white text-[11px] leading-relaxed shadow-lg'>
          {t('localModel.hfSearchFilterDetail')}
        </div>
      )}
    </span>
  );
};

/** Format download count: 1234567 → "1.23M DL", 12345 → "12.3K DL" */
function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M DL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K DL`;
  return `${n} DL`;
}

const SearchResultCard = ({
  result, variants, variantsLoading, selectedFileName, deviceTier,
  savedMetas, progresses, statuses, resumeFallbackMessage, existingModelId, existingModelState,
  onSelectVariant, onDownload, onResume, onRetry, onCancel,
  onLoad, onUnload, onDelete,
}: SearchResultCardProps) => {
  const { t } = useTranslation('main');
  const isSupported = result.supportStatus === 'supported';

  const selectedVariant = variants?.variants.find((v) => v.fileName === selectedFileName) ?? null;
  const displaySize = selectedVariant ? (selectedVariant.size > 0 ? selectedVariant.size : null) : (result.bestCandidateSize && result.bestCandidateSize > 0 ? result.bestCandidateSize : null);

  const selectedModelId = selectedVariant ? generateSearchModelId(result.repoId, selectedVariant) : null;
  const meta = selectedModelId ? savedMetas[selectedModelId] : undefined;
  const storageState = meta?.storageState ?? 'none';
  const progress = selectedModelId ? progresses[selectedModelId] ?? null : null;
  const runtimeStatus = selectedModelId ? (statuses[selectedModelId] ?? 'idle') : 'idle';
  const isLoaded = runtimeStatus === 'ready' || runtimeStatus === 'busy';
  const isLoading = runtimeStatus === 'loading';

  const isAlreadyDownloaded = existingModelId !== null;
  const canDownload = isSupported && !isAlreadyDownloaded && selectedVariant?.supportReason !== 'Split GGUF not supported' && storageState === 'none' && !progress;

  // Weight tier — based on file size, independent of device
  const fitLabel = (() => {
    if (selectedVariant?.supportReason === 'Split GGUF not supported') return 'not-recommended' as ModelFitLabel;

    const sz = displaySize ?? 0;
    if (sz === 0) return null;
    const mb = sz / (1024 * 1024);
    if (mb < 300) return 'lightweight' as ModelFitLabel;
    if (mb < 1500) return 'recommended' as ModelFitLabel;
    if (mb < 4000) return 'heavy' as ModelFitLabel;
    if (mb < 8000) return 'very-heavy' as ModelFitLabel;
    return 'extreme' as ModelFitLabel;
  })();

  // Quantization
  const quantLabel = selectedVariant?.rawQuantization
    ? selectedVariant.normalizedQuantization.toUpperCase()
    : variants?.recommendedFile
      ? variants.variants.find((v) => v.fileName === variants.recommendedFile)?.normalizedQuantization?.toUpperCase()
      : null;

  // Shared button styles
  const btnPrimary = 'text-xs px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 whitespace-nowrap';
  const btnSecondary = 'text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap';

  return (
    <div className='flex flex-col border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors'>
      {/* Row 1: Model name + (desktop: quant | date | DL | size) + (mobile: size only) */}
      <div className='flex items-center gap-2 px-3 py-1.5 min-w-0'>
        <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
          isSupported ? 'bg-green-500' : result.supportStatus === 'needs-manual-review' ? 'bg-amber-400' : 'bg-gray-400'
        }`} />
        <a
          href={result.repoUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='flex-1 text-sm text-gray-900 dark:text-white truncate overflow-hidden min-w-0 no-underline hover:underline'
        >{result.repoId}</a>
        <span className='hidden sm:inline text-[10px] text-purple-700 dark:text-purple-400 whitespace-nowrap flex-shrink-0'>
          {quantLabel ?? '—'}
        </span>
        <span className='hidden sm:inline w-20 text-right text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0'>
          {result.lastModified ? result.lastModified.slice(0, 10) : '—'}
        </span>
        <span className='hidden sm:inline w-14 text-right text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0'>
          {formatDownloads(result.downloads)}
        </span>
        <span className='w-16 text-right text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0'>
          {displaySize != null ? formatBytes(displaySize) : '—'}
        </span>
      </div>

      {/* Row 2 (mobile only): Quant | Date | DL | FitBadge */}
      <div className='sm:hidden flex items-baseline gap-2 px-3 pb-0.5 ml-5 min-w-0'>
        <span className='text-[10px] text-purple-700 dark:text-purple-400 whitespace-nowrap flex-shrink-0'>
          {quantLabel ?? '—'}
        </span>
        <span className='text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap'>
          {result.lastModified ? result.lastModified.slice(0, 10) : '—'}
        </span>
        <span className='text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap'>
          {formatDownloads(result.downloads)}
        </span>
        <span className='flex-1' />
        {fitLabel && <FitBadge fit={fitLabel} variant='search' />}
      </div>
      {/* Desktop: FitBadge on row 2 */}
      {fitLabel && (
        <div className='hidden sm:flex items-center px-3 pb-0.5 ml-5'>
          <span className='flex-1' />
          <FitBadge fit={fitLabel} variant='search' />
        </div>
      )}

      {/* Row 3: Tags (horizontally scrollable) */}
      <div className='flex items-center gap-2 px-3 pb-0.5 ml-5 min-w-0'>
        <div
          className='flex-1 overflow-x-auto flex gap-1 min-w-0'
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {result.tags.slice(0, 8).map((tag) => (
            <span key={tag} className='text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0'>{tag}</span>
          ))}
        </div>
      </div>

      {/* Row 4: Description */}
      {result.description && (
        <div className='px-3 pb-1 ml-5'>
          <span className='text-xs text-gray-500 dark:text-gray-400 line-clamp-1'>{result.description}</span>
        </div>
      )}

      {/* Variant picker + actions (aligned to model name column) */}
      {isSupported && (
        <div className='pb-2 ml-5 flex flex-col gap-1.5'>
          {variantsLoading && (
            <span className='text-xs text-gray-500 animate-pulse'>{t('localModel.loadingVariants')}</span>
          )}

          {!variantsLoading && variants && variants.variants.length > 0 && (
            <div className='flex flex-wrap items-center gap-2 pr-3'>
              <select
                className='flex-1 min-w-[180px] max-w-[260px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                value={selectedFileName ?? ''}
                onChange={(e) => onSelectVariant(result.repoId, e.target.value)}
              >
                <option value='' disabled>{t('localModel.selectVariant')}</option>
                {variants.variants.map((v) => (
                  <option key={v.fileName} value={v.fileName} disabled={v.supportReason === 'Split GGUF not supported'}>
                    {v.label}
                    {v.supportReason === 'heavy' ? ` - ${t('localModel.modelFit.heavy')}` : ''}
                    {v.supportReason === 'very-heavy' ? ` - ${t('localModel.modelFit.veryHeavy')}` : ''}
                    {v.supportReason === 'extreme' ? ` - ${t('localModel.modelFit.extreme')}` : ''}
                    {v.supportReason === 'Split GGUF not supported' ? ` - ${t('localModel.modelFit.notRecommended')}` : ''}
                  </option>
                ))}
              </select>

              {/* Action buttons — wrap to next line on mobile */}
              {selectedVariant && storageState === 'none' && !progress && !isAlreadyDownloaded && (
                <button className={`${btnPrimary} ml-auto`} onClick={() => onDownload(result, selectedVariant)} disabled={!canDownload}>{t('localModel.download')}</button>
              )}
              {selectedVariant && isAlreadyDownloaded && storageState === 'none' && (
                <span className={`text-xs whitespace-nowrap ${existingModelState === 'downloading' ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                  {existingModelState === 'downloading' ? t('localModel.downloading') : t('localModel.storageState.saved')}
                </span>
              )}
              {selectedVariant && (storageState === 'downloading' || progress) && (
                <>
                  <div className='flex-1 min-w-[80px] max-w-[200px]'>
                    {progress ? <ProgressBar progress={progress} /> : <span className='text-xs text-gray-500'>{t('localModel.downloading')}</span>}
                  </div>
                  {selectedModelId && <button className={btnSecondary} onClick={() => onCancel(selectedModelId)}>{t('localModel.cancel')}</button>}
                </>
              )}
              {selectedVariant && storageState === 'partial' && !progress && (
                <>
                  <button className={btnPrimary} onClick={() => onResume(result, selectedVariant)}>{t('localModel.resume')}</button>
                  <button className={btnSecondary} onClick={() => onRetry(result, selectedVariant)}>{t('localModel.retry')}</button>
                  {selectedModelId && <button className={btnSecondary} onClick={() => onDelete(selectedModelId)}>{t('localModel.delete')}</button>}
                </>
              )}
              {selectedVariant && storageState === 'saved' && !isLoaded && !isLoading && (
                <>
                  <button className={btnPrimary} onClick={() => onLoad(result, selectedVariant)}>{t('localModel.load')}</button>
                  {selectedModelId && <button className={btnSecondary} onClick={() => onDelete(selectedModelId)}>{t('localModel.delete')}</button>}
                </>
              )}
              {selectedVariant && storageState === 'saved' && isLoading && <StatusBadge status='loading' />}
              {selectedVariant && storageState === 'saved' && isLoaded && (
                <>
                  <StatusBadge status={runtimeStatus} />
                  {selectedModelId && <button className={btnSecondary} onClick={() => onUnload(selectedModelId)} disabled={runtimeStatus === 'busy'}>{t('localModel.unload')}</button>}
                </>
              )}
            </div>
          )}

          {/* Partial/error info below dropdown */}
          {selectedVariant && storageState === 'partial' && !progress && meta?.storedBytes && (
            <span className='text-xs text-amber-600 dark:text-amber-400'>
              {t('localModel.storageState.partial')} ({formatBytes(meta.storedBytes)})
              {resumeFallbackMessage && ` — ${resumeFallbackMessage}`}
            </span>
          )}
          {selectedVariant && selectedVariant.supportStatus !== 'supported' && selectedVariant.supportReason && (
            <span className={`text-xs hidden sm:block ${variantStatusColors[selectedVariant.supportStatus] ?? ''}`}>
              {selectedVariant.supportReason === 'heavy' ? t('localModel.fitReason.heavy')
                : selectedVariant.supportReason === 'very-heavy' ? t('localModel.fitReason.veryHeavy')
                : selectedVariant.supportReason === 'extreme' ? t('localModel.fitReason.extreme')
                : selectedVariant.supportReason}
            </span>
          )}
          {meta?.lastError && storageState !== 'downloading' && (
            <span className='text-xs text-red-600 dark:text-red-400 truncate'>{meta.lastError}</span>
          )}

          {!variantsLoading && variants && variants.variants.length === 0 && (
            <span className='text-xs text-gray-500'>{t('localModel.hfSearchNoResults')}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EPHEMERAL_MODEL_ID = '__wllama_test__';

const LocalModelSettings = () => {
  const { t } = useTranslation('main');

  // Store state
  const localModelEnabled = useStore((s) => s.localModelEnabled);
  const setLocalModelEnabled = useStore((s) => s.setLocalModelEnabled);
  const savedModelMeta = useStore((s) => s.savedModelMeta);
  const localModels = useStore((s) => s.localModels);
  const activeLocalModels = useStore((s) => s.activeLocalModels);
  const favoriteLocalModelIds = useStore((s) => s.favoriteLocalModelIds);
  const toggleFavoriteLocalModel = useStore((s) => s.toggleFavoriteLocalModel);

  // Local UI state
  const [enabled, setEnabled] = useState(localModelEnabled);
  const [rehydrated, setRehydrated] = useState(false);

  // Ephemeral model state (manual file picker)
  const [ephemeralStatus, setEphemeralStatus] = useState<LocalModelStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ephemeralLoadError, setEphemeralLoadError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [contextLength, setContextLength] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<'generate' | 'analyze' | 'format'>('generate');
  const [analyzeInstruction, setAnalyzeInstruction] = useState('');
  const [formatPreset, setFormatPreset] = useState<'summarize' | 'rewrite' | 'bullets'>('summarize');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Download state
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, DownloadProgress>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const [resumeFallbacks, setResumeFallbacks] = useState<Record<string, string>>({});

  // OPFS browser refresh trigger — incremented on every storage mutation
  const [opfsBrowserRefresh, setOpfsBrowserRefresh] = useState(0);
  const bumpOpfsBrowser = useCallback(() => setOpfsBrowserRefresh((n) => n + 1), []);

  // HF Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngine, setSearchEngine] = useState<HfSearchQuery['engine']>('all');
  const [searchSort, setSearchSort] = useState<'downloads' | 'lastModified' | 'size'>('lastModified');
  const [searchSortDir, setSearchSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchResults, setSearchResults] = useState<HfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [variantMap, setVariantMap] = useState<Record<string, GgufRepoResolution>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [variantLoading, setVariantLoading] = useState<Record<string, boolean>>({});
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  /** Tracks search downloads that must remain visible regardless of search query changes */
  const [activeSearchDownloads, setActiveSearchDownloads] = useState<Record<string, {
    result: HfSearchResult;
    variant: GgufVariant;
    modelId: string;
  }>>({});
  const [searchNextUrl, setSearchNextUrl] = useState<string | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search session persistence helpers
  const pagesLoadedRef = useRef(1);
  /** Target page count for restoration after page reload; null = not restoring */
  const pendingRestoreRef = useRef<number | null>(null);
  /** Set to true once the initial restore has been applied (prevents re-restore) */
  const restoredRef = useRef(false);

  // Runtime statuses for all known models (catalog + ephemeral)
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, LocalModelStatus>>(() => {
    const initial: Record<string, LocalModelStatus> = {};
    initial[EPHEMERAL_MODEL_ID] = localModelRuntime.getStatus(EPHEMERAL_MODEL_ID);
    for (const model of CURATED_MODELS) {
      initial[model.id] = localModelRuntime.getStatus(model.id);
    }
    for (const m of useStore.getState().localModels) {
      if (!(m.id in initial)) {
        initial[m.id] = localModelRuntime.getStatus(m.id);
      }
    }
    return initial;
  });

  // Device tier (computed once)
  const deviceTier = useMemo(() => estimateDeviceTier(), []);

  // Derive active test model from task assignments
  const generationModelId = activeLocalModels.generation ?? null;
  const analysisModelId = activeLocalModels.analysis ?? null;

  // For test generation: which model to use per tab
  const getTestModelId = useCallback((mode: 'generate' | 'analyze' | 'format'): string | null => {
    if (mode === 'generate') {
      return generationModelId;
    }
    // analyze/format: prefer analysis assignment, fall back to generation
    return analysisModelId ?? generationModelId;
  }, [generationModelId, analysisModelId]);

  const hasAnyAssignment = generationModelId !== null || analysisModelId !== null;

  // Check if any assigned model is actually loaded
  const isTestModelLoaded = useCallback((mode: 'generate' | 'analyze' | 'format'): boolean => {
    const modelId = getTestModelId(mode);
    if (!modelId) return false;
    const status = runtimeStatuses[modelId] ?? 'idle';
    return status === 'ready' || status === 'busy';
  }, [getTestModelId, runtimeStatuses]);

  // Sync toggle to store
  useEffect(() => {
    setLocalModelEnabled(enabled);
  }, [enabled]);

  // Subscribe to runtime status changes
  useEffect(() => {
    const unsubscribe = localModelRuntime.subscribe(() => {
      const newStatuses: Record<string, LocalModelStatus> = {};
      newStatuses[EPHEMERAL_MODEL_ID] = localModelRuntime.getStatus(EPHEMERAL_MODEL_ID);
      for (const model of CURATED_MODELS) {
        newStatuses[model.id] = localModelRuntime.getStatus(model.id);
      }
      // Also track search-added models
      for (const m of useStore.getState().localModels) {
        if (!(m.id in newStatuses)) {
          newStatuses[m.id] = localModelRuntime.getStatus(m.id);
        }
      }
      setRuntimeStatuses(newStatuses);
      setEphemeralStatus(newStatuses[EPHEMERAL_MODEL_ID]);
    });
    return unsubscribe;
  }, []);

  // Rehydrate OPFS state on first mount
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!enabled || rehydratedRef.current) return;
    rehydratedRef.current = true;

    // Build rehydration entries from catalog + search-added models
    const searchModels = useStore.getState().localModels
      .filter((m) => m.source === 'opfs' && !CURATED_MODELS.some((c) => c.id === m.id))
      .map((m) => ({ id: m.id, manifest: m.manifest }));
    const entries = [...CURATED_MODELS, ...searchModels];

    rehydrateSavedModels(entries).then((meta) => {
      const store = useStore.getState();
      for (const [id, m] of Object.entries(meta)) {
        store.updateSavedModelMeta(id, m);
        // Ensure saved models have a definition in localModels
        if (m.storageState === 'saved' && !store.localModels.some((lm) => lm.id === id)) {
          const catalog = CURATED_MODELS.find((c) => c.id === id);
          if (catalog) {
            store.addLocalModel({
              id: catalog.id,
              engine: catalog.engine,
              tasks: catalog.tasks,
              label: catalog.label,
              origin: catalog.huggingFaceRepo,
              source: 'opfs',
              manifest: catalog.manifest,
              fileSize: m.storedBytes || catalog.expectedDownloadSize,
              displayMeta: catalog.displayMeta,
            });
          }
        }
      }
      setRehydrated(true);
    }).catch(() => {
      setRehydrated(true);
    });
  }, [enabled]);

  // ----- Auto-assignment helper (only-if-unset) -----
  const autoAssignIfUnset = useCallback((modelId: string, tasks: LocalModelTask[]) => {
    const store = useStore.getState();
    for (const task of tasks) {
      if (!store.activeLocalModels[task]) {
        store.setActiveLocalModel(task, modelId);
      }
    }
  }, []);

  // ----- Catalog model actions -----

  const handleDownload = useCallback((model: CatalogModel) => {
    // Prevent duplicate downloads
    if (abortControllers.current[model.id]) return;

    const controller = new AbortController();
    abortControllers.current[model.id] = controller;

    const store = useStore.getState();
    store.updateSavedModelMeta(model.id, {
      storageState: 'downloading',
      storedBytes: 0,
      storedFiles: [],
      lastError: undefined,
      downloadRevision: model.revision,
    });

    bumpOpfsBrowser();
    downloadCatalogModel(model, {
      onProgress: (p) => {
        setDownloadProgresses((prev) => ({ ...prev, [model.id]: p }));
      },
      onFileComplete: (_fileName, fileSize) => {
        const currentMeta = useStore.getState().savedModelMeta[model.id];
        useStore.getState().updateSavedModelMeta(model.id, {
          storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
          storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
        });
        bumpOpfsBrowser();
      },
      onComplete: (totalBytes) => {
        const store = useStore.getState();
        store.updateSavedModelMeta(model.id, {
          storageState: 'saved',
          storedBytes: totalBytes,
          storedFiles: [...model.downloadFiles],
          lastVerifiedAt: Date.now(),
        });
        // Register model definition so it appears in the model list
        store.addLocalModel({
          id: model.id,
          engine: model.engine,
          tasks: model.tasks,
          label: model.label,
          origin: model.huggingFaceRepo,
          source: 'opfs',
          manifest: model.manifest,
          fileSize: totalBytes,
          displayMeta: model.displayMeta,
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
        bumpOpfsBrowser();
      },
      onError: (error, _modelId, _fileName) => {
        useStore.getState().updateSavedModelMeta(model.id, {
          storageState: 'partial',
          lastError: error.message,
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
        bumpOpfsBrowser();
      },
    }, controller.signal);
  }, [bumpOpfsBrowser]);

  const handleCancelDownload = useCallback((modelId: string) => {
    abortControllers.current[modelId]?.abort();
    delete abortControllers.current[modelId];
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    useStore.getState().updateSavedModelMeta(modelId, {
      storageState: 'partial',
      lastError: undefined,
    });
    bumpOpfsBrowser();
  }, [bumpOpfsBrowser]);

  const handleRetry = useCallback((model: CatalogModel) => {
    handleDownload(model);
  }, [handleDownload]);

  const handleResumeCatalog = useCallback((model: CatalogModel) => {
    if (abortControllers.current[model.id]) return;

    const controller = new AbortController();
    abortControllers.current[model.id] = controller;

    const store = useStore.getState();
    store.updateSavedModelMeta(model.id, {
      storageState: 'downloading',
      lastError: undefined,
    });

    // Clear any previous fallback message
    setResumeFallbacks((prev) => {
      const { [model.id]: _, ...rest } = prev;
      return rest;
    });

    bumpOpfsBrowser();
    downloadCatalogModel(model, {
      onProgress: (p) => {
        setDownloadProgresses((prev) => ({ ...prev, [model.id]: p }));
      },
      onFileComplete: (_fileName, fileSize) => {
        const currentMeta = useStore.getState().savedModelMeta[model.id];
        useStore.getState().updateSavedModelMeta(model.id, {
          storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
          storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
        });
        bumpOpfsBrowser();
      },
      onComplete: (totalBytes) => {
        useStore.getState().updateSavedModelMeta(model.id, {
          storageState: 'saved',
          storedBytes: totalBytes,
          storedFiles: [...model.downloadFiles],
          lastVerifiedAt: Date.now(),
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
        bumpOpfsBrowser();
      },
      onError: (error, _modelId, _fileName) => {
        useStore.getState().updateSavedModelMeta(model.id, {
          storageState: 'partial',
          lastError: error.message,
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
        bumpOpfsBrowser();
      },
      onResumeFallback: (fileName) => {
        setResumeFallbacks((prev) => ({
          ...prev,
          [model.id]: t('localModel.resumeFallback') as string,
        }));
      },
    }, controller.signal, true /* resume */);
  }, [t, bumpOpfsBrowser]);

  const handleDeleteCatalogModel = useCallback(async (modelId: string) => {
    if (!window.confirm(t('localModel.confirmDelete') as string)) return;

    if (localModelRuntime.isLoaded(modelId)) {
      await localModelRuntime.unloadModel(modelId);
    }

    // Clear task assignments pointing to this model
    const store = useStore.getState();
    for (const task of ASSIGNABLE_TASKS) {
      if (store.activeLocalModels[task] === modelId) {
        store.setActiveLocalModel(task, null);
      }
    }

    await deleteModel(modelId);
    store.removeSavedModelMeta(modelId);
    store.removeLocalModel(modelId);
    bumpOpfsBrowser();
  }, [t, bumpOpfsBrowser]);

  const handleLoadCatalogModel = useCallback(async (model: CatalogModel) => {
    const provider = new OpfsFileProvider(model.id, model.manifest);

    try {
      if (localModelRuntime.isLoaded(model.id)) {
        await localModelRuntime.unloadModel(model.id);
      }

      await localModelRuntime.loadModel(
        {
          id: model.id,
          engine: model.engine,
          tasks: model.tasks,
          label: model.label,
          origin: model.huggingFaceRepo,
          source: 'opfs',
          manifest: model.manifest,
        },
        provider,
      );

      const caps = localModelRuntime.getCapabilities(model.id);
      const store = useStore.getState();
      store.addLocalModel({
        id: model.id,
        engine: model.engine,
        tasks: model.tasks,
        label: model.label,
        origin: model.huggingFaceRepo,
        source: 'opfs',
        manifest: model.manifest,
      });

      // Auto-assign only to tasks that are currently unset
      autoAssignIfUnset(model.id, model.tasks);

      // Auto-favorite on load
      if (!store.favoriteLocalModelIds.includes(model.id)) {
        store.toggleFavoriteLocalModel(model.id);
      }

      if (caps?.contextLength) setContextLength(caps.contextLength);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [autoAssignIfUnset]);

  const handleUnloadCatalogModel = useCallback(async (modelId: string) => {
    await localModelRuntime.unloadModel(modelId);
    // Assignments remain — model is still in store, just not loaded
  }, []);

  // ----- Ephemeral file selection & model load -----
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEphemeralLoadError(null);
    setFileName(file.name);
    setOutput('');
    setContextLength(null);

    const provider = new EphemeralFileProvider(
      new Map([[file.name, file]]),
      { kind: 'single-file', entrypoint: file.name },
      EPHEMERAL_MODEL_ID,
    );

    try {
      if (localModelRuntime.isLoaded(EPHEMERAL_MODEL_ID)) {
        await localModelRuntime.unloadModel(EPHEMERAL_MODEL_ID);
      }
      await localModelRuntime.loadModel(
        {
          id: EPHEMERAL_MODEL_ID,
          engine: 'wllama',
          tasks: ['generation', 'analysis'],
          label: file.name,
          origin: file.name,
          source: 'ephemeral-file',
          manifest: { kind: 'single-file', entrypoint: file.name },
          fileSize: file.size,
          lastFileName: file.name,
        },
        provider,
      );
      const caps = localModelRuntime.getCapabilities(EPHEMERAL_MODEL_ID);
      if (caps?.contextLength) setContextLength(caps.contextLength);

      const store = useStore.getState();
      store.addLocalModel({
        id: EPHEMERAL_MODEL_ID,
        engine: 'wllama',
        tasks: ['generation', 'analysis'],
        label: file.name,
        origin: file.name,
        source: 'ephemeral-file',
        manifest: { kind: 'single-file', entrypoint: file.name },
        fileSize: file.size,
        lastFileName: file.name,
      });

      // Auto-assign only to tasks that are currently unset
      autoAssignIfUnset(EPHEMERAL_MODEL_ID, ['generation', 'analysis']);
    } catch (err) {
      setEphemeralLoadError((err as Error).message);
    }

    e.target.value = '';
  }, [autoAssignIfUnset]);

  // ----- Task assignment -----
  const handleTaskAssign = useCallback((task: LocalModelTask, modelId: string | null) => {
    useStore.getState().setActiveLocalModel(task, modelId);
  }, []);

  // Build assignment candidates for a given task.
  // Includes both loaded models (from localModels) and saved catalog models
  // (from CURATED_MODELS + savedModelMeta) that support the task.
  const getTaskCandidates = useCallback((task: LocalModelTask) => {
    const seen = new Set<string>();
    const candidates: Array<{ id: string; label: string; statusLabel: string }> = [];

    // 1. Models already in localModels (loaded or previously registered)
    for (const m of localModels) {
      if (!m.tasks.includes(task)) continue;
      seen.add(m.id);
      const status = runtimeStatuses[m.id] ?? 'idle';
      const statusLabel = getModelStatusLabel(m.id, m.source, status);
      candidates.push({
        id: m.id,
        label: m.label,
        statusLabel: t(`localModel.${statusLabel}`),
      });
    }

    // 2. Saved catalog models not yet in localModels
    for (const cm of CURATED_MODELS) {
      if (seen.has(cm.id)) continue;
      if (!cm.tasks.includes(task)) continue;
      const meta = savedModelMeta[cm.id];
      if (!meta || meta.storageState !== 'saved') continue;
      candidates.push({
        id: cm.id,
        label: cm.label,
        statusLabel: t('localModel.saved'),
      });
    }

    return candidates;
  }, [localModels, runtimeStatuses, savedModelMeta, t]);

  // ----- Generation -----
  const handleGenerate = useCallback(async () => {
    const modelId = getTestModelId('generate');
    if (!prompt.trim() || !modelId) return;
    const engine = localModelRuntime.getWllamaEngine(modelId);
    if (!engine) return;

    setGenerating(true);
    setOutput('');

    try {
      await engine.generate(
        prompt,
        { maxTokens: 256, temperature: 0.7 },
        (text) => {
          setOutput(text);
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        },
        'test',
      );
    } catch (err) {
      setOutput((prev) => prev + `\n[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, getTestModelId]);

  const handleAnalyze = useCallback(async () => {
    if (!prompt.trim() || !analyzeInstruction.trim()) return;
    setGenerating(true);
    setOutput('');
    try {
      const result = await localAnalyze(prompt, analyzeInstruction, 'test');
      setOutput(result);
    } catch (err) {
      setOutput(`[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, analyzeInstruction]);

  const handleFormat = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setOutput('');
    try {
      const result = await localFormat(prompt, formatPreset, 'test');
      setOutput(result);
    } catch (err) {
      setOutput(`[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, formatPreset]);

  const handleAbort = useCallback(() => {
    const modelId = getTestModelId(testMode);
    if (!modelId) return;
    const engine = localModelRuntime.getWllamaEngine(modelId);
    engine?.abort();
  }, [getTestModelId, testMode]);

  const handleUnloadEphemeral = useCallback(async () => {
    await localModelRuntime.unloadModel(EPHEMERAL_MODEL_ID);
    setContextLength(null);
    setFileName(null);
    setOutput('');
    // Assignments remain — user can reassign via dropdown
  }, []);

  // ----- HF Search -----
  // Resolve variants for a batch of search results
  const resolveVariantsForResults = useCallback((results: HfSearchResult[]) => {
    for (const r of results) {
      if (r.supportStatus === 'supported' && (r.engine === 'wllama' || r.tags.includes('gguf'))) {
        setVariantLoading((prev) => ({ ...prev, [r.repoId]: true }));
        resolveGgufFiles(r.repoId).then((resolution) => {
          setVariantLoading((prev) => ({ ...prev, [r.repoId]: false }));
          if (resolution) {
            setVariantMap((prev) => ({ ...prev, [r.repoId]: resolution }));
            if (resolution.recommendedFile) {
              setSelectedVariants((prev) => ({ ...prev, [r.repoId]: resolution.recommendedFile! }));
            }
            const bestVariant = resolution.recommendedFile
              ? resolution.variants.find((v) => v.fileName === resolution.recommendedFile)
              : resolution.variants.find((v) => v.size > 0);
            setSearchResults((prev) =>
              prev.map((sr) =>
                sr.repoId === r.repoId ? {
                  ...sr,
                  bestCandidateSize: bestVariant?.size && bestVariant.size > 0 ? bestVariant.size : sr.bestCandidateSize,
                  lastModified: resolution.lastModified ?? sr.lastModified,
                } : sr,
              ),
            );
          } else {
            setSearchResults((prev) =>
              prev.map((sr) =>
                sr.repoId === r.repoId
                  ? { ...sr, supportStatus: 'needs-manual-review' as const, supportReason: 'Could not resolve GGUF files from repository' }
                  : sr,
              ),
            );
          }
        });
      }
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearchedOnce(true);
    setSearchResults([]);
    setVariantMap({});
    setSelectedVariants({});
    setSearchNextUrl(null);
    setSearchHasMore(false);
    pagesLoadedRef.current = 1;

    try {
      // size sort is client-side only; API uses downloads as fallback
      const apiSort = searchSort === 'size' ? 'downloads' : searchSort;
      const { results, nextPageUrl } = await searchHfModels({
        query: searchQuery,
        engine: searchEngine,
        sort: apiSort,
        sortDir: searchSort === 'size' ? 'desc' : searchSortDir,
        limit: 20,
      });
      // Client-side sort by size if requested (applied after variant resolution updates sizes)
      const sorted = searchSort === 'size'
        ? [...results].sort((a, b) => {
            const sa = a.bestCandidateSize ?? 0;
            const sb = b.bestCandidateSize ?? 0;
            return searchSortDir === 'asc' ? sa - sb : sb - sa;
          })
        : results;
      setSearchResults(sorted);
      setSearchNextUrl(nextPageUrl);
      setSearchHasMore(nextPageUrl !== null);
      resolveVariantsForResults(sorted);
    } catch {
      // Search failed silently
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchEngine, searchSort, searchSortDir, resolveVariantsForResults]);

  // Load more results (appends to existing)
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !searchHasMore || !searchNextUrl) return;
    setLoadingMore(true);

    try {
      const apiSort = searchSort === 'size' ? 'downloads' : searchSort;
      const { results, nextPageUrl } = await searchHfModels({
        query: searchQuery,
        engine: searchEngine,
        sort: apiSort,
        sortDir: searchSort === 'size' ? 'desc' : searchSortDir,
        nextUrl: searchNextUrl,
      });
      setSearchNextUrl(nextPageUrl);
      setSearchHasMore(nextPageUrl !== null);
      if (results.length > 0) {
        setSearchResults((prev) => {
          const existing = new Set(prev.map((r) => r.repoId));
          const newResults = results.filter((r) => !existing.has(r.repoId));
          return [...prev, ...newResults];
        });
        resolveVariantsForResults(results);
      }
      pagesLoadedRef.current += 1;
      // Persist updated page count
      saveSearchSession({
        query: searchQuery, engine: searchEngine,
        sort: searchSort, sortDir: searchSortDir,
        pagesLoaded: pagesLoadedRef.current,
      });
    } catch {
      setSearchHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [searchQuery, searchEngine, searchSort, searchSortDir, searchNextUrl, searchHasMore, loadingMore, resolveVariantsForResults]);

  // Auto-load more when sentinel scrolls into view
  const searchSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!searchHasMore || loadingMore) return;
    const sentinel = searchSentinelRef.current;
    if (!sentinel) return;

    // Use IntersectionObserver with the nearest scrollable ancestor as root
    // Find the scrollable parent for the observer root
    let root: HTMLElement | null = sentinel.parentElement;
    while (root && root.scrollHeight <= root.clientHeight + 1) {
      root = root.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { root: root ?? undefined, rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchHasMore, loadingMore, handleLoadMore, searchResults.length]);

  // Debounced incremental search (also re-triggers on sort/dir change)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      if (searchResults.length > 0 && !searchQuery.trim()) {
        setSearchResults([]);
      }
      return;
    }
    const timer = setTimeout(() => {
      handleSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchEngine, searchSort, searchSortDir]);

  // Persist search params to sessionStorage whenever they change
  useEffect(() => {
    if (!searchQuery.trim()) {
      clearSearchSession();
      return;
    }
    saveSearchSession({
      query: searchQuery,
      engine: searchEngine,
      sort: searchSort,
      sortDir: searchSortDir,
      pagesLoaded: pagesLoadedRef.current,
    });
  }, [searchQuery, searchEngine, searchSort, searchSortDir]);

  // Restore search state from sessionStorage on mount (after rehydration)
  useEffect(() => {
    if (!rehydrated || restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadSearchSession();
    if (!saved) return;
    setSearchQuery(saved.query);
    setSearchEngine(saved.engine);
    setSearchSort(saved.sort);
    setSearchSortDir(saved.sortDir);
    if (saved.pagesLoaded > 1) {
      pendingRestoreRef.current = saved.pagesLoaded;
    }
    // The debounced search effect above will auto-fire handleSearch
  }, [rehydrated]);

  // Auto-load additional pages to restore pagination depth
  useEffect(() => {
    if (pendingRestoreRef.current === null) return;
    if (searching || loadingMore) return; // wait for current fetch
    if (pagesLoadedRef.current >= pendingRestoreRef.current || !searchHasMore) {
      pendingRestoreRef.current = null; // done restoring
      return;
    }
    handleLoadMore();
    // searchResults.length changes after each loadMore, re-triggering this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults.length, searching, loadingMore, searchHasMore]);

  /**
   * Check if a search variant matches an already-downloaded model (catalog or store).
   * Compares by HF repo + file name (= same download URL).
   * Returns the existing model ID if found, null otherwise.
   */
  const findExistingModelForVariant = useCallback((repoId: string, fileName: string): string | null => {
    // Check catalog models
    for (const cm of CURATED_MODELS) {
      if (cm.huggingFaceRepo === repoId && cm.downloadFiles.includes(fileName)) {
        return cm.id;
      }
    }
    // Check store models (search-added) by origin + manifest entrypoint
    const store = useStore.getState();
    for (const m of store.localModels) {
      if (m.origin === repoId && m.manifest.kind === 'single-file' && m.manifest.entrypoint === fileName) {
        return m.id;
      }
    }
    return null;
  }, []);

  const handleSelectVariant = useCallback((repoId: string, fileName: string) => {
    setSelectedVariants((prev) => ({ ...prev, [repoId]: fileName }));
  }, []);

  const handleDownloadSearchResult = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    // Check if this exact file is already downloaded or downloading under a different model ID
    const existingId = findExistingModelForVariant(result.repoId, variant.fileName);
    if (existingId) {
      const meta = useStore.getState().savedModelMeta[existingId];
      if (meta?.storageState === 'saved' || meta?.storageState === 'downloading' || abortControllers.current[existingId]) {
        return;
      }
    }

    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;

    const modelId = generateSearchModelId(result.repoId, variant);

    // Prevent duplicate downloads
    if (abortControllers.current[modelId]) return;

    // Track as active search download (sticky visibility)
    setActiveSearchDownloads((prev) => ({
      ...prev,
      [modelId]: { result, variant, modelId },
    }));

    // Don't duplicate in store
    const store = useStore.getState();
    if (!store.localModels.some((m) => m.id === modelId)) {
      store.addLocalModel({
        id: modelId,
        engine: candidate.engine,
        tasks: candidate.tasks,
        label: candidate.label,
        origin: result.repoId,
        source: 'opfs',
        manifest: candidate.manifest,
        fileSize: candidate.estimatedSize,
      });
    }

    store.updateSavedModelMeta(modelId, {
      storageState: 'downloading',
      storedBytes: 0,
      storedFiles: [],
      lastError: undefined,
    });

    const controller = new AbortController();
    abortControllers.current[modelId] = controller;

    bumpOpfsBrowser();
    downloadModelFiles(
      {
        modelId,
        repo: result.repoId,
        revision: 'main',
        files: candidate.downloadFiles,
      },
      {
        onProgress: (p) => {
          setDownloadProgresses((prev) => ({ ...prev, [modelId]: p }));
        },
        onFileComplete: (_fileName, fileSize) => {
          const currentMeta = useStore.getState().savedModelMeta[modelId];
          useStore.getState().updateSavedModelMeta(modelId, {
            storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
            storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
          });
          bumpOpfsBrowser();
        },
        onComplete: (totalBytes) => {
          useStore.getState().updateSavedModelMeta(modelId, {
            storageState: 'saved',
            storedBytes: totalBytes,
            storedFiles: [...candidate.downloadFiles],
            lastVerifiedAt: Date.now(),
          });
          setDownloadProgresses((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          // Remove from sticky active downloads (now in "Downloaded Models")
          setActiveSearchDownloads((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          delete abortControllers.current[modelId];
          bumpOpfsBrowser();
        },
        onError: (error) => {
          useStore.getState().updateSavedModelMeta(modelId, {
            storageState: 'partial',
            lastError: error.message,
          });
          setDownloadProgresses((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          // Keep in activeSearchDownloads — user needs to see error/retry
          delete abortControllers.current[modelId];
          bumpOpfsBrowser();
        },
      },
      controller.signal,
    );
  }, [bumpOpfsBrowser]);

  const handleResumeSearchModel = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;
    const modelId = generateSearchModelId(result.repoId, variant);

    if (abortControllers.current[modelId]) return;

    // Track as active search download (sticky visibility)
    setActiveSearchDownloads((prev) => ({
      ...prev,
      [modelId]: { result, variant, modelId },
    }));

    const store = useStore.getState();
    store.updateSavedModelMeta(modelId, {
      storageState: 'downloading',
      lastError: undefined,
    });
    setResumeFallbacks((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });

    const controller = new AbortController();
    abortControllers.current[modelId] = controller;

    bumpOpfsBrowser();
    downloadModelFiles(
      {
        modelId,
        repo: result.repoId,
        revision: 'main',
        files: candidate.downloadFiles,
        resume: true,
      },
      {
        onProgress: (p) => {
          setDownloadProgresses((prev) => ({ ...prev, [modelId]: p }));
        },
        onFileComplete: (_fileName, fileSize) => {
          const currentMeta = useStore.getState().savedModelMeta[modelId];
          useStore.getState().updateSavedModelMeta(modelId, {
            storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
            storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
          });
          bumpOpfsBrowser();
        },
        onComplete: (totalBytes) => {
          useStore.getState().updateSavedModelMeta(modelId, {
            storageState: 'saved',
            storedBytes: totalBytes,
            storedFiles: [...candidate.downloadFiles],
            lastVerifiedAt: Date.now(),
          });
          setDownloadProgresses((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          setActiveSearchDownloads((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          delete abortControllers.current[modelId];
          bumpOpfsBrowser();
        },
        onError: (error) => {
          useStore.getState().updateSavedModelMeta(modelId, {
            storageState: 'partial',
            lastError: error.message,
          });
          setDownloadProgresses((prev) => {
            const { [modelId]: _, ...rest } = prev;
            return rest;
          });
          delete abortControllers.current[modelId];
          bumpOpfsBrowser();
        },
        onResumeFallback: () => {
          setResumeFallbacks((prev) => ({
            ...prev,
            [modelId]: t('localModel.resumeFallback') as string,
          }));
        },
      },
      controller.signal,
    );
  }, [t, bumpOpfsBrowser]);

  const handleRetrySearchModel = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    // Retry = fresh download (no resume)
    handleDownloadSearchResult(result, variant);
  }, [handleDownloadSearchResult]);

  const handleCancelSearchDownload = useCallback((modelId: string) => {
    abortControllers.current[modelId]?.abort();
    delete abortControllers.current[modelId];
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    useStore.getState().updateSavedModelMeta(modelId, {
      storageState: 'partial',
      lastError: undefined,
    });
    bumpOpfsBrowser();
  }, [bumpOpfsBrowser]);

  const handleLoadSearchModel = useCallback(async (result: HfSearchResult, variant: GgufVariant) => {
    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;
    const modelId = generateSearchModelId(result.repoId, variant);

    const provider = new OpfsFileProvider(modelId, candidate.manifest);

    try {
      if (localModelRuntime.isLoaded(modelId)) {
        await localModelRuntime.unloadModel(modelId);
      }

      await localModelRuntime.loadModel(
        {
          id: modelId,
          engine: candidate.engine,
          tasks: candidate.tasks,
          label: candidate.label,
          origin: result.repoId,
          source: 'opfs',
          manifest: candidate.manifest,
          fileSize: candidate.estimatedSize,
        },
        provider,
      );

      const store = useStore.getState();
      // Ensure model definition is in store
      if (!store.localModels.some((m) => m.id === modelId)) {
        store.addLocalModel({
          id: modelId,
          engine: candidate.engine,
          tasks: candidate.tasks,
          label: candidate.label,
          origin: result.repoId,
          source: 'opfs',
          manifest: candidate.manifest,
          fileSize: candidate.estimatedSize,
        });
      }

      autoAssignIfUnset(modelId, candidate.tasks);

      // Auto-favorite on load
      if (!store.favoriteLocalModelIds.includes(modelId)) {
        store.toggleFavoriteLocalModel(modelId);
      }

      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [autoAssignIfUnset]);

  // Load the selected model from the Downloaded Models section
  const handleLoadSelected = useCallback(async () => {
    if (!selectedModelId) return;
    setLoadError(null);
    try {
      // ensureLoaded works for both catalog and search models
      await localModelRuntime.ensureLoaded(selectedModelId);

      // Ensure model def exists in store (catalog models may not be registered yet)
      const store = useStore.getState();
      if (!store.localModels.some((m) => m.id === selectedModelId)) {
        const catalog = CURATED_MODELS.find((c) => c.id === selectedModelId);
        if (catalog) {
          store.addLocalModel({
            id: catalog.id,
            engine: catalog.engine,
            tasks: catalog.tasks,
            label: catalog.label,
            origin: catalog.huggingFaceRepo,
            source: 'opfs',
            manifest: catalog.manifest,
            fileSize: catalog.expectedDownloadSize,
            displayMeta: catalog.displayMeta,
          });
        }
      }

      const def = store.localModels.find((m) => m.id === selectedModelId);
      if (def) {
        autoAssignIfUnset(selectedModelId, def.tasks);
        if (!store.favoriteLocalModelIds.includes(selectedModelId)) {
          store.toggleFavoriteLocalModel(selectedModelId);
        }
      }

      setSelectedModelId(null);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [selectedModelId, autoAssignIfUnset]);

  const handleUnloadSearchModel = useCallback(async (modelId: string) => {
    await localModelRuntime.unloadModel(modelId);
  }, []);

  const handleDeleteSearchModel = useCallback(async (modelId: string) => {
    if (!window.confirm(t('localModel.confirmDelete') as string)) return;

    if (localModelRuntime.isLoaded(modelId)) {
      await localModelRuntime.unloadModel(modelId);
    }

    const store = useStore.getState();
    for (const task of ASSIGNABLE_TASKS) {
      if (store.activeLocalModels[task] === modelId) {
        store.setActiveLocalModel(task, null);
      }
    }

    await deleteModel(modelId);
    store.removeSavedModelMeta(modelId);
    store.removeLocalModel(modelId);
    setActiveSearchDownloads((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    bumpOpfsBrowser();
  }, [t, bumpOpfsBrowser]);

  // Sync partial model storedBytes on section mount
  useEffect(() => {
    if (!rehydrated) return;
    const metas = useStore.getState().savedModelMeta;
    for (const [id, meta] of Object.entries(metas)) {
      if (meta.storageState === 'partial') {
        // Find a file to check .part size
        const model = CURATED_MODELS.find((c) => c.id === id)
          ?? useStore.getState().localModels.find((m) => m.id === id);
        if (!model) continue;
        const file = model.manifest.kind === 'single-file'
          ? model.manifest.entrypoint
          : model.manifest.requiredFiles[0];
        if (!file) continue;
        getTempFileSize(id, file).then((size) => {
          if (size > 0) {
            useStore.getState().updateSavedModelMeta(id, { storedBytes: size });
          }
        });
      }
    }
  }, [rehydrated]);

  // --- Downloading section handlers (for persisted partial/downloading models) ---

  /** Resume a downloading/partial model using only its persisted model definition. */
  const handleResumeDownloadingModel = useCallback(async (modelId: string) => {
    const model = localModels.find((m) => m.id === modelId);
    // Check catalog models too
    const catalogModel = CURATED_MODELS.find((c) => c.id === modelId);
    if (catalogModel) {
      // Delegate to catalog resume handler
      handleResumeCatalog(catalogModel);
      return;
    }
    if (!model?.origin) return;
    const fileName = model.manifest?.kind === 'single-file' ? model.manifest.entrypoint : model.manifest?.requiredFiles?.[0];
    if (!fileName) return;

    try {
      const resolution = await resolveGgufFiles(model.origin);
      if (!resolution) return;
      const variant = resolution.variants.find((v) => v.fileName === fileName);
      if (!variant) return;
      // Build a minimal HfSearchResult from the persisted model data
      const fakeResult: HfSearchResult = {
        repoId: model.origin,
        repoUrl: `https://huggingface.co/${model.origin}`,
        description: '',
        tags: [],
        downloads: 0,
        lastModified: '',
        bestCandidateSize: variant.size,
        supportStatus: 'supported',
        supportReason: '',
        engine: model.engine,
      };
      handleResumeSearchModel(fakeResult, variant);
    } catch {
      // Resolution failed — try direct retry
      handleRetryDownloadingModel(modelId);
    }
  }, [localModels, handleResumeSearchModel]);

  /** Retry a failed download from scratch using persisted model definition. */
  const handleRetryDownloadingModel = useCallback(async (modelId: string) => {
    const model = localModels.find((m) => m.id === modelId);
    const catalogModel = CURATED_MODELS.find((c) => c.id === modelId);
    if (catalogModel) {
      handleDownload(catalogModel);
      return;
    }
    if (!model?.origin) return;
    const fileName = model.manifest?.kind === 'single-file' ? model.manifest.entrypoint : model.manifest?.requiredFiles?.[0];
    if (!fileName) return;

    try {
      const resolution = await resolveGgufFiles(model.origin);
      if (!resolution) return;
      const variant = resolution.variants.find((v) => v.fileName === fileName);
      if (!variant) return;
      const fakeResult: HfSearchResult = {
        repoId: model.origin,
        repoUrl: `https://huggingface.co/${model.origin}`,
        description: '',
        tags: [],
        downloads: 0,
        lastModified: '',
        bestCandidateSize: variant.size,
        supportStatus: 'supported',
        supportReason: '',
        engine: model.engine,
      };
      handleDownloadSearchResult(fakeResult, variant);
    } catch {
      // Can't resolve — show error
      useStore.getState().updateSavedModelMeta(modelId, {
        storageState: 'partial',
        lastError: 'Failed to resolve model files for retry',
      });
    }
  }, [localModels, handleDownloadSearchResult]);

  /** Delete a downloading/partial model (both catalog and search). */
  const handleDeleteDownloadingModel = useCallback(async (modelId: string) => {
    if (!window.confirm(t('localModel.confirmDelete') as string)) return;
    abortControllers.current[modelId]?.abort();
    delete abortControllers.current[modelId];
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    await deleteModel(modelId);
    useStore.getState().removeSavedModelMeta(modelId);
    useStore.getState().removeLocalModel(modelId);
    setActiveSearchDownloads((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    bumpOpfsBrowser();
  }, [t, bumpOpfsBrowser]);

  /** Cancel an active download for the downloading section. */
  const handleCancelDownloadingModel = useCallback((modelId: string) => {
    handleCancelSearchDownload(modelId);
  }, [handleCancelSearchDownload]);

  const isEphemeralReady = ephemeralStatus === 'ready' || ephemeralStatus === 'busy';

  // Whether test area should show: need at least one assignment that is loaded
  const canTestGenerate = isTestModelLoaded('generate');
  const canTestAnalyze = isTestModelLoaded('analyze') || isTestModelLoaded('generate');
  const showTestArea = canTestGenerate || canTestAnalyze;

  // Analysis fallback indicator
  const analysisFallsBack = !analysisModelId && !!generationModelId;

  // Device tier label
  const tierLabels: Record<DeviceTier, string> = {
    low: t('localModel.deviceTierLow'),
    standard: t('localModel.deviceTierStandard'),
    high: t('localModel.deviceTierHigh'),
  };

  // Task labels
  const taskLabels: Record<string, string> = {
    generation: t('localModel.taskGeneration'),
    analysis: t('localModel.taskAnalysis'),
  };

  return (
    <div className='flex flex-col gap-5'>
      {/* Experimental notice */}
      <div className='flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300'>
        <span className='font-semibold whitespace-nowrap'>{t('localModel.experimental')}</span>
        <span>{t('localModel.experimentalNote')}</span>
      </div>

      {/* 1. Enable toggle + device tier */}
      <SettingsGroup label=''>
        <div>
          <Toggle
            label={t('localModel.enabled')}
            isChecked={enabled}
            setIsChecked={setEnabled}
          />
          {enabled && (
            <div className='px-4 pb-3 -mt-1 text-xs text-gray-500 dark:text-gray-400'>
              {t('localModel.deviceTier')}: <span className='font-medium text-gray-700 dark:text-gray-300'>{tierLabels[deviceTier]}</span>
            </div>
          )}
        </div>
      </SettingsGroup>

      {enabled && (
        <>
          {/* Task Assignment */}
          {(localModels.length > 0 || Object.values(savedModelMeta).some((m) => m.storageState === 'saved')) && (
            <SettingsGroup label={t('localModel.taskAssignment')}>
              {ASSIGNABLE_TASKS.map((task) => {
                const currentId = activeLocalModels[task];
                const currentStatus = currentId ? (runtimeStatuses[currentId] ?? 'idle') : 'idle';
                const isCurrentLoaded = currentStatus === 'ready' || currentStatus === 'busy';

                return (
                  <TaskAssignmentRow
                    key={task}
                    task={task}
                    taskLabel={taskLabels[task] ?? task}
                    currentModelId={currentId}
                    candidates={getTaskCandidates(task)}
                    isCurrentLoaded={isCurrentLoaded}
                    onAssign={handleTaskAssign}
                    requiresLoadText={t('localModel.assignmentRequiresLoad') as string}
                  />
                );
              })}
              {analysisFallsBack && (
                <div className='px-4 py-2'>
                  <span className='text-xs text-gray-500 dark:text-gray-400 italic'>
                    {t('localModel.analysisFallsBackToGeneration')}
                  </span>
                </div>
              )}
            </SettingsGroup>
          )}

          {/* Test generation area */}
          {showTestArea && (
            <SettingsGroup label={t('localModel.testGenerate')}>
              <div className='px-4 py-3 flex flex-col gap-3'>
                {/* Mode tabs */}
                <div className='flex gap-1 rounded-md bg-gray-100 dark:bg-gray-700 p-0.5'>
                  {(['generate', 'analyze', 'format'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                        testMode === mode
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                      onClick={() => setTestMode(mode)}
                    >
                      {mode === 'generate' ? 'Generate' : mode === 'analyze' ? 'Analyze' : 'Format'}
                    </button>
                  ))}
                </div>

                {/* Input area */}
                <textarea
                  className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500'
                  rows={3}
                  placeholder={testMode === 'generate'
                    ? (t('localModel.testPromptPlaceholder') as string)
                    : 'Enter text...'
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={generating}
                />

                {testMode === 'analyze' && (
                  <input
                    type='text'
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    placeholder='Instruction (e.g. "Identify the key themes")'
                    value={analyzeInstruction}
                    onChange={(e) => setAnalyzeInstruction(e.target.value)}
                    disabled={generating}
                  />
                )}

                {testMode === 'format' && (
                  <select
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    value={formatPreset}
                    onChange={(e) => setFormatPreset(e.target.value as typeof formatPreset)}
                    disabled={generating}
                  >
                    <option value='summarize'>Summarize</option>
                    <option value='rewrite'>Rewrite</option>
                    <option value='bullets'>Bullet Points</option>
                  </select>
                )}

                {/* Action buttons */}
                <div className='flex gap-2'>
                  <button
                    className='btn btn-primary text-sm px-4 py-1.5'
                    onClick={
                      testMode === 'generate' ? handleGenerate
                        : testMode === 'analyze' ? handleAnalyze
                        : handleFormat
                    }
                    disabled={
                      generating || !prompt.trim() ||
                      !isTestModelLoaded(testMode) ||
                      (testMode === 'analyze' && !analyzeInstruction.trim())
                    }
                  >
                    {generating ? t('localModel.generating') : (
                      testMode === 'generate' ? t('localModel.testGenerate')
                        : testMode === 'analyze' ? 'Analyze'
                        : 'Format'
                    )}
                  </button>
                  {generating && (
                    <button
                      className='btn btn-neutral text-sm px-4 py-1.5'
                      onClick={handleAbort}
                    >
                      Stop
                    </button>
                  )}
                </div>

                {/* Output */}
                {output && (
                  <div className='flex flex-col gap-1'>
                    <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                      {t('localModel.output')}
                    </span>
                    <div
                      ref={outputRef}
                      className='max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono'
                    >
                      {output}
                    </div>
                  </div>
                )}
              </div>
            </SettingsGroup>
          )}

          {/* 2. Downloaded models list — only fully saved models */}
          {(() => {
            const catalogIds = new Set(CURATED_MODELS.map((m) => m.id));
            const completedCatalog = CURATED_MODELS.filter((m) =>
              savedModelMeta[m.id]?.storageState === 'saved',
            );
            const completedSearch = localModels.filter((m) =>
              m.source === 'opfs'
              && !catalogIds.has(m.id)
              && savedModelMeta[m.id]?.storageState === 'saved',
            );
            const hasAnyDownloaded = completedCatalog.length > 0 || completedSearch.length > 0;
            const anyLoading = selectedModelId
              ? (runtimeStatuses[selectedModelId] ?? 'idle') === 'loading'
              : false;
            const selectedAlreadyLoaded = selectedModelId
              ? ['ready', 'busy'].includes(runtimeStatuses[selectedModelId] ?? 'idle')
              : false;

            return (
              <SettingsGroup label={
                <div className='flex items-center justify-between w-full'>
                  <span>{t('localModel.downloadedModels')}</span>
                  {hasAnyDownloaded && (
                    <button
                      className='btn btn-primary text-xs px-3 py-1 normal-case tracking-normal font-normal disabled:opacity-50 disabled:cursor-not-allowed'
                      onClick={handleLoadSelected}
                      disabled={!selectedModelId || anyLoading || selectedAlreadyLoaded}
                    >
                      {anyLoading ? t('localModel.modelStatus.loading') : t('localModel.load')}
                    </button>
                  )}
                </div>
              }>
                {!hasAnyDownloaded && (
                  <div className='px-4 py-6 text-center'>
                    <p className='text-xs text-gray-400 dark:text-gray-500'>
                      {t('localModel.noDownloadedModels')}
                    </p>
                  </div>
                )}

                {loadError && (
                  <div className='px-4 py-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap'>
                    {t('localModel.loadError')}: {loadError}
                  </div>
                )}

                {completedCatalog.map((model) => (
                  <DownloadedModelRow
                    key={model.id}
                    modelId={model.id}
                    label={model.label}
                    tasks={model.tasks}
                    fileSize={model.expectedDownloadSize}
                    fitBadge={<FitBadge fit={getModelFit(model.recommendedDeviceTier, deviceTier)} />}
                    runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                    isSelected={selectedModelId === model.id}
                    onSelect={() => setSelectedModelId(model.id)}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onUnload={handleUnloadCatalogModel}
                    onDelete={handleDeleteCatalogModel}
                  />
                ))}
                {completedSearch.map((model) => (
                  <DownloadedModelRow
                    key={model.id}
                    modelId={model.id}
                    label={model.label}
                    tasks={model.tasks}
                    fileSize={model.fileSize}
                    runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                    isSelected={selectedModelId === model.id}
                    onSelect={() => setSelectedModelId(model.id)}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onUnload={handleUnloadSearchModel}
                    onDelete={handleDeleteSearchModel}
                  />
                ))}
              </SettingsGroup>
            );
          })()}

          {/* 2.5. Downloading / partial models */}
          {(() => {
            const catalogIds = new Set(CURATED_MODELS.map((m) => m.id));
            const downloadingCatalog = CURATED_MODELS.filter((m) =>
              savedModelMeta[m.id]?.storageState === 'downloading' || savedModelMeta[m.id]?.storageState === 'partial',
            );
            const downloadingSearch = localModels.filter((m) =>
              m.source === 'opfs'
              && !catalogIds.has(m.id)
              && (savedModelMeta[m.id]?.storageState === 'downloading' || savedModelMeta[m.id]?.storageState === 'partial'),
            );
            const hasAnyDownloading = downloadingCatalog.length > 0 || downloadingSearch.length > 0;

            if (!hasAnyDownloading) return null;

            return (
              <SettingsGroup label={t('localModel.downloadingModels')}>
                {downloadingCatalog.map((model) => (
                  <DownloadingModelRow
                    key={model.id}
                    modelId={model.id}
                    label={model.label}
                    tasks={model.tasks}
                    fileSize={model.expectedDownloadSize}
                    progress={downloadProgresses[model.id] ?? null}
                    meta={savedModelMeta[model.id]}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onCancel={handleCancelDownloadingModel}
                    onResume={handleResumeDownloadingModel}
                    onRetry={handleRetryDownloadingModel}
                    onDelete={handleDeleteDownloadingModel}
                  />
                ))}
                {downloadingSearch.map((model) => (
                  <DownloadingModelRow
                    key={model.id}
                    modelId={model.id}
                    label={model.label}
                    tasks={model.tasks}
                    fileSize={model.fileSize}
                    progress={downloadProgresses[model.id] ?? null}
                    meta={savedModelMeta[model.id]}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onCancel={handleCancelDownloadingModel}
                    onResume={handleResumeDownloadingModel}
                    onRetry={handleRetryDownloadingModel}
                    onDelete={handleDeleteDownloadingModel}
                  />
                ))}
              </SettingsGroup>
            );
          })()}

          {/* 3. Manual import */}
          <SettingsGroup label={t('localModel.importedFiles')}>
            <div className='px-4 py-3 flex flex-col gap-3'>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                {t('localModel.selectGgufHint')}
              </p>
              <div className='flex items-center gap-3'>
                <button
                  className='btn btn-neutral text-sm px-4 py-1.5'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ephemeralStatus === 'loading'}
                >
                  {ephemeralStatus === 'loading' ? t('localModel.modelStatus.loading') : t('localModel.selectGgufFile')}
                </button>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.gguf'
                  className='hidden'
                  onChange={handleFileSelect}
                />
                {ephemeralStatus !== 'idle' && <StatusBadge status={ephemeralStatus} />}
              </div>

              {fileName && (
                <div className='text-xs text-gray-600 dark:text-gray-400 truncate'>
                  {fileName}
                </div>
              )}

              {ephemeralLoadError && (
                <div className='text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap'>
                  {t('localModel.loadError')}: {ephemeralLoadError}
                </div>
              )}

              {isEphemeralReady && (
                <div className='flex items-center gap-2'>
                  {contextLength !== null && (
                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                      {t('localModel.contextLength')}: {contextLength.toLocaleString()}
                    </span>
                  )}
                  <button
                    className='btn btn-neutral text-xs px-3 py-1 ml-auto'
                    onClick={handleUnloadEphemeral}
                    disabled={generating}
                  >
                    {t('localModel.unload')}
                  </button>
                </div>
              )}
            </div>
          </SettingsGroup>

          {/* Recommended models — not yet fully downloaded */}
          {CURATED_MODELS.filter((m) => savedModelMeta[m.id]?.storageState !== 'saved').length > 0 && (
            <SettingsGroup label={t('localModel.recommendedModels')}>
              {CURATED_MODELS.filter((m) => savedModelMeta[m.id]?.storageState !== 'saved').map((model) => (
                <CatalogCard
                  key={model.id}
                  model={model}
                  deviceTier={deviceTier}
                  meta={savedModelMeta[model.id]}
                  runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                  downloadProgress={downloadProgresses[model.id] ?? null}
                  resumeFallbackMessage={resumeFallbacks[model.id] ?? null}
                  isFavorite={favoriteLocalModelIds.includes(model.id)}
                  onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                  onDownload={handleDownload}
                  onCancel={handleCancelDownload}
                  onResume={handleResumeCatalog}
                  onRetry={handleRetry}
                  onDelete={handleDeleteCatalogModel}
                  onLoad={handleLoadCatalogModel}
                  onUnload={handleUnloadCatalogModel}
                />
              ))}
            </SettingsGroup>
          )}

          {/* OPFS Storage Management */}
          <SettingsGroup label={t('localModel.opfsBrowser.title')}>
            <div className='px-4 py-2 text-xs text-gray-500 dark:text-gray-400'>
              {t('localModel.opfsBrowser.description')}
            </div>
            <OpfsFileBrowser
              refreshTrigger={opfsBrowserRefresh}
              onStorageChanged={() => {
                // Trigger rehydration refresh after storage changes
                rehydratedRef.current = false;
                bumpOpfsBrowser();
              }}
            />
          </SettingsGroup>

          {/* 4. Hugging Face Search */}
          <SettingsGroup label=''>
            {/* Sticky block: section label + search bar + column headers */}
            <div className='sticky -top-6 z-10 bg-gray-50 dark:bg-gray-700 rounded-t-lg'>
              {/* Section label row with filter info icon */}
              <div className='flex items-center justify-between px-3 pt-2 pb-1'>
                <span className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {t('localModel.hfSearch')}
                </span>
                <FilterInfoButton />
              </div>
              {/* Search bar */}
              <div className='px-3 pb-2 flex items-center gap-2'>
                <div className='flex-1 relative'>
                  <input
                    type='text'
                    className='w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 pl-3 pr-8 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    placeholder={t('localModel.hfSearchPlaceholder') as string}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      type='button'
                    >
                      &times;
                    </button>
                  )}
                </div>
                <select
                  className='rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
                  value={searchEngine}
                  onChange={(e) => setSearchEngine(e.target.value as HfSearchQuery['engine'])}
                >
                  <option value='all'>{t('localModel.engineAll')}</option>
                  <option value='wllama'>{t('localModel.engineWllama')}</option>
                  <option value='transformers.js'>{t('localModel.engineTransformersJs')}</option>
                </select>
                {searching && (
                  <span className='text-xs text-gray-500 animate-pulse whitespace-nowrap'>{t('localModel.hfSearching')}</span>
                )}
              </div>
              {/* Column headers */}
              {hasSearchedOnce && searchResults.length > 0 && (
                <>
                  {/* Desktop: headers aligned with Row 1 inline columns */}
                  <div className='hidden sm:flex items-center gap-2 px-3 py-1 border-t border-gray-200 dark:border-gray-600'>
                    <span className='flex-1' />
                    <span className='text-[10px] font-medium text-gray-500 dark:text-gray-400'>{t('localModel.quantization')}</span>
                    <SortableColumnHeader className='inline' label={t('localModel.hfLastModified')} field='lastModified' width='w-20' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='DL' field='downloads' width='w-14' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='Size' field='size' width='w-16' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                  </div>
                  {/* Mobile: compact header row */}
                  <div className='sm:hidden flex items-center justify-end gap-3 px-3 py-1 ml-5 border-t border-gray-200 dark:border-gray-600'>
                    <SortableColumnHeader className='inline' label={t('localModel.hfLastModified')} field='lastModified' width='' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='DL' field='downloads' width='' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='Size' field='size' width='' currentSort={searchSort} currentDir={searchSortDir} onSort={(f, d) => { setSearchSort(f as typeof searchSort); setSearchSortDir(d); }} />
                  </div>
                </>
              )}
              {/* No results */}
              {hasSearchedOnce && !searching && searchResults.length === 0 && searchQuery.trim() && Object.keys(activeSearchDownloads).length === 0 && (
                <div className='px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center'>
                  {t('localModel.hfSearchNoResults')}
                </div>
              )}
            </div>

            {/* Search results container — maintain min-height after first search to prevent layout shift */}
            <div style={hasSearchedOnce ? { minHeight: '800px' } : undefined}>

            {/* Active search downloads — always visible (downloading/partial/error) */}
            {Object.values(activeSearchDownloads)
              // Don't show duplicates if they're also in search results
              .filter((d) => !searchResults.some((r) => r.repoId === d.result.repoId))
              .map((d) => {
                const repoMetas: Record<string, SavedModelMeta> = {};
                const repoProgresses: Record<string, DownloadProgress> = {};
                const repoStatuses: Record<string, LocalModelStatus> = {};
                if (savedModelMeta[d.modelId]) repoMetas[d.modelId] = savedModelMeta[d.modelId];
                if (downloadProgresses[d.modelId]) repoProgresses[d.modelId] = downloadProgresses[d.modelId];
                if (runtimeStatuses[d.modelId]) repoStatuses[d.modelId] = runtimeStatuses[d.modelId];
                const resolution = variantMap[d.result.repoId] ?? null;

                return (
                  <SearchResultCard
                    key={`active-${d.modelId}`}
                    result={d.result}
                    variants={resolution}
                    variantsLoading={false}
                    selectedFileName={d.variant.fileName}
                    deviceTier={deviceTier}
                    savedMetas={repoMetas}
                    progresses={repoProgresses}
                    statuses={repoStatuses}
                    resumeFallbackMessage={resumeFallbacks[d.modelId] ?? null}
                    existingModelId={null}
                    existingModelState={null}
                    onSelectVariant={handleSelectVariant}
                    onDownload={handleDownloadSearchResult}
                    onResume={handleResumeSearchModel}
                    onRetry={handleRetrySearchModel}
                    onCancel={handleCancelSearchDownload}
                    onLoad={handleLoadSearchModel}
                    onUnload={handleUnloadSearchModel}
                    onDelete={handleDeleteSearchModel}
                  />
                );
              })
            }

            {/* Search results */}
            {searchResults.length > 0 && searchResults.map((result) => {
              const repoPrefix = `hf--${result.repoId.split('/').map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).join('--')}--`;
              const repoMetas: Record<string, SavedModelMeta> = {};
              const repoProgresses: Record<string, DownloadProgress> = {};
              const repoStatuses: Record<string, LocalModelStatus> = {};
              for (const [id, meta] of Object.entries(savedModelMeta)) {
                if (id.startsWith(repoPrefix)) repoMetas[id] = meta;
              }
              for (const [id, prog] of Object.entries(downloadProgresses)) {
                if (id.startsWith(repoPrefix)) repoProgresses[id] = prog;
              }
              for (const [id, status] of Object.entries(runtimeStatuses)) {
                if (id.startsWith(repoPrefix)) repoStatuses[id] = status;
              }
              const selectedFile = selectedVariants[result.repoId] ?? null;
              const selectedVar = variantMap[result.repoId]?.variants.find((v) => v.fileName === selectedFile);
              const selectedMid = selectedVar ? generateSearchModelId(result.repoId, selectedVar) : null;
              const fallbackMsg = selectedMid ? (resumeFallbacks[selectedMid] ?? null) : null;
              const existingId = selectedFile ? findExistingModelForVariant(result.repoId, selectedFile) : null;
              // Show as existing if saved, downloading, or has active download
              const existingState = existingId ? savedModelMeta[existingId]?.storageState : undefined;
              const isExistingActive = existingId != null && (
                existingState === 'saved' || existingState === 'downloading' || !!abortControllers.current[existingId]
              );

              return (
                <SearchResultCard
                  key={result.repoId}
                  result={result}
                  variants={variantMap[result.repoId] ?? null}
                  variantsLoading={variantLoading[result.repoId] ?? false}
                  selectedFileName={selectedFile}
                  deviceTier={deviceTier}
                  savedMetas={repoMetas}
                  progresses={repoProgresses}
                  statuses={repoStatuses}
                  resumeFallbackMessage={fallbackMsg}
                  existingModelId={isExistingActive ? existingId : null}
                  existingModelState={isExistingActive ? (existingState as 'saved' | 'downloading' | 'partial' | null) ?? null : null}
                  onSelectVariant={handleSelectVariant}
                  onDownload={handleDownloadSearchResult}
                  onResume={handleResumeSearchModel}
                  onRetry={handleRetrySearchModel}
                  onCancel={handleCancelSearchDownload}
                  onLoad={handleLoadSearchModel}
                  onUnload={handleUnloadSearchModel}
                  onDelete={handleDeleteSearchModel}
                />
              );
            })}

            {/* Auto-load sentinel */}
            {searchHasMore && searchResults.length > 0 && (
              <div ref={searchSentinelRef} className='px-4 py-2 text-center'>
                {loadingMore && (
                  <span className='text-xs text-gray-500 animate-pulse'>{t('localModel.hfSearching')}</span>
                )}
              </div>
            )}


            </div>
          </SettingsGroup>

        </>
      )}
    </div>
  );
};

export default LocalModelSettings;
