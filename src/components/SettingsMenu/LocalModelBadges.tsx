import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@src/local-llm/device';
import type { LocalModelStatus } from '@src/local-llm/types';
import type { ModelFitLabel } from '@src/local-llm/device';
import type { DownloadProgress } from '@src/local-llm/download';
import { statusColors, fitColors, supportColors } from './localModelConstants';

export const StatusBadge = ({ status }: { status: LocalModelStatus }) => {
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

export const FitBadge = ({ fit, variant = 'catalog' }: { fit: ModelFitLabel; variant?: 'catalog' | 'search' }) => {
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

export const TaskBadges = ({ tasks }: { tasks: string[] }) => (
  <div className='flex gap-1'>
    {tasks.map((task) => (
      <span key={task} className='text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'>
        {task}
      </span>
    ))}
  </div>
);

export const ProgressBar = ({ progress }: { progress: DownloadProgress }) => {
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

export const SupportBadge = ({ status, t }: { status: string; t: (k: string) => string }) => {
  const key = status === 'needs-manual-review' ? 'needsManualReview' : status;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${supportColors[status] ?? supportColors.unsupported}`}>
      {t(`localModel.${key}`)}
    </span>
  );
};

export const SortableColumnHeader = ({ label, field, width, currentSort, currentDir, onSort, className: extraClass }: {
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

export const FilterInfoButton = () => {
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
