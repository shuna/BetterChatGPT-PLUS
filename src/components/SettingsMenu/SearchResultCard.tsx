import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@src/local-llm/device';
import type { ModelFitLabel } from '@src/local-llm/device';
import { generateSearchModelId } from '@src/local-llm/hfSearch';
import { StatusBadge, FitBadge, ProgressBar } from './LocalModelBadges';
import { variantStatusColors, formatDownloads } from './localModelConstants';
import type { SearchResultCardProps } from './localModelConstants';

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

  const quantLabel = selectedVariant?.rawQuantization
    ? selectedVariant.normalizedQuantization.toUpperCase()
    : variants?.recommendedFile
      ? variants.variants.find((v) => v.fileName === variants.recommendedFile)?.normalizedQuantization?.toUpperCase()
      : null;

  const btnPrimary = 'text-xs px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 whitespace-nowrap';
  const btnSecondary = 'text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap';

  return (
    <div className='flex flex-col border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors'>
      {/* Row 1: Model name + columns */}
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

      {/* Row 2 (mobile only) */}
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
      {/* Desktop: FitBadge */}
      {fitLabel && (
        <div className='hidden sm:flex items-center px-3 pb-0.5 ml-5'>
          <span className='flex-1' />
          <FitBadge fit={fitLabel} variant='search' />
        </div>
      )}

      {/* Row 3: Tags */}
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

      {/* Variant picker + actions */}
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

export default SearchResultCard;
