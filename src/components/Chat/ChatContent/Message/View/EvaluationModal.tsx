import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import RadarChart from './RadarChart';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys, systemQualityAxisKeys, moderationCategoryKeys, categoryToI18nKey, getSafetyStatus, summarizeSafetyScores } from '@type/evaluation';
import type { QualityEvaluationMode, QualityScores, AxisProgressState } from '@type/evaluation';
import type {
  EvaluationResult,
  SafetyCheckResult,
  QualityEvaluationResult,
  QualityThresholds,
  SafetyThresholds,
  EvaluationScope,
  EvaluationOmittedMode,
  LocalModerationResult,
  EvaluationContextInfo,
  AxisProgressMap,
} from '@type/evaluation';
import { runSafetyCheck, runQualityEvaluation } from '@api/evaluation';
import { runLocalQualityEvaluation } from '@api/localEvaluation';
import { prepareModelsForExecution } from '@src/local-llm/orchestrator';
import type { ResolvedProvider } from '@hooks/submitHelpers';
import { formatEvaluationErrorMessage } from '@utils/evaluationError';
import type { FormattedEvaluationError } from '@utils/evaluationError';
import { resolveEvalContext } from '@utils/evaluationContext';
import { useLocalModelBusy } from '@hooks/useLocalModelBusy';
import i18next from 'i18next';

export type TabId = 'safety' | 'quality';

interface EvaluationModalProps {
  chatId: string;
  nodeId: string;
  chatIndex: number;
  messageIndex: number;
  phase: 'pre-send' | 'post-receive';
  role: string;
  resolvedProvider: ResolvedProvider;
  model: string;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  initialTab?: TabId;
}

// ---------------------------------------------------------------------------
// Scope / Omitted Options
// ---------------------------------------------------------------------------

/** Inline scope controls: radio buttons + omitted checkbox, placed in each tab header */
const InlineScopeControls = ({
  scope,
  omittedMode,
  role,
  onScopeChange,
  onOmittedModeChange,
}: {
  scope: EvaluationScope;
  omittedMode: EvaluationOmittedMode;
  role: string;
  onScopeChange: (s: EvaluationScope) => void;
  onOmittedModeChange: (m: EvaluationOmittedMode) => void;
}) => {
  const { t } = useTranslation('main');
  const singleLabel = role === 'assistant'
    ? t('evaluation.scopeSingleAssistant')
    : t('evaluation.scopeSingle');
  return (
    <div className='flex flex-wrap items-center gap-2.5 text-xs pl-2'>
      <label className='flex items-center gap-1 cursor-pointer text-gray-600 dark:text-gray-400'>
        <input
          type='radio'
          name='eval-scope'
          checked={scope === 'full-context'}
          onChange={() => onScopeChange('full-context')}
          className='accent-blue-600'
        />
        {t('evaluation.scopeFullContext')}
      </label>
      <label className='flex items-center gap-1 cursor-pointer text-gray-600 dark:text-gray-400'>
        <input
          type='radio'
          name='eval-scope'
          checked={scope === 'single'}
          onChange={() => onScopeChange('single')}
          className='accent-blue-600'
        />
        {singleLabel}
      </label>
      {scope === 'full-context' && (
        <label className='flex items-center gap-1 cursor-pointer text-gray-500 dark:text-gray-400 ml-1 border-l border-gray-300 dark:border-gray-600 pl-2'>
          <input
            type='checkbox'
            checked={omittedMode === 'include-omitted'}
            onChange={(e) =>
              onOmittedModeChange(
                e.target.checked ? 'include-omitted' : 'respect-omitted'
              )
            }
            className='accent-blue-600'
          />
          {t('evaluation.includeOmitted')}
        </label>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Error Banner
// ---------------------------------------------------------------------------

const ErrorBanner = ({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className='rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 break-all whitespace-pre-wrap'>
    {message}
    {action && (
      <button
        className='mt-2 block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors'
        onClick={action.onClick}
      >
        {action.label}
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Safety Tab
// ---------------------------------------------------------------------------

const SafetyTab = ({
  result,
  localSafety,
  isRunning,
  onReEvaluate,
  error,
  onOpenProxySettings,
  thresholds,
  scope,
  omittedMode,
  role,
  onScopeChange,
  onOmittedModeChange,
}: {
  result?: SafetyCheckResult;
  localSafety?: LocalModerationResult;
  isRunning: boolean;
  onReEvaluate: () => void;
  error?: FormattedEvaluationError | null;
  onOpenProxySettings: () => void;
  thresholds: SafetyThresholds;
  scope: EvaluationScope;
  omittedMode: EvaluationOmittedMode;
  role: string;
  onScopeChange: (s: EvaluationScope) => void;
  onOmittedModeChange: (m: EvaluationOmittedMode) => void;
}) => {
  const { t } = useTranslation('main');
  const summary = result
    ? summarizeSafetyScores(result.categoryScores, thresholds)
    : { status: 'safe' as const, reviewCategories: [], blockCategories: [] };

  const categoryEntries = result
    ? moderationCategoryKeys
        .filter((k) => typeof result.categoryScores[k] === 'number')
        .map((k) => [k, result.categoryScores[k] as number] as const)
    : [];

  const radarLabels = categoryEntries.map(([cat]) => t(`evaluation.category.${categoryToI18nKey(cat)}`));
  const radarScores = categoryEntries.map(([, score]) => score);

  return (
    <div className='space-y-4'>
      {/* Header row 1: status + re-evaluate */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {result && (
            <span
              className={`text-sm font-medium px-2 py-1 rounded whitespace-nowrap ${
                summary.status === 'block'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : summary.status === 'review'
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {summary.status === 'block'
                ? t('evaluation.flagged')
                : summary.status === 'review'
                ? t('evaluation.review')
                : t('evaluation.safe')}
            </span>
          )}
          {!result && !isRunning && (
            <span className='text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap'>
              {t('evaluation.notEvaluated')}
            </span>
          )}
        </div>
        <button
          className='text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 whitespace-nowrap'
          onClick={onReEvaluate}
          disabled={isRunning}
        >
          {isRunning ? t('evaluation.running') : result ? t('evaluation.reEvaluate') : t('evaluation.runEvaluation')}
        </button>
      </div>
      {/* Header row 2: scope controls */}
      <InlineScopeControls
        scope={scope}
        omittedMode={omittedMode}
        role={role}
        onScopeChange={onScopeChange}
        onOmittedModeChange={onOmittedModeChange}
      />

      {error && (
        <ErrorBanner
          message={error.message}
          action={
            error.isProxyNotConfigured
              ? { label: t('evaluation.openProxySettings'), onClick: onOpenProxySettings }
              : undefined
          }
        />
      )}

      {/* Radar chart */}
      {categoryEntries.length > 0 && (
        <div className='flex justify-center'>
          <RadarChart
            labels={radarLabels}
            scores={radarScores}
            size={400}
            invertAxis
            colorOverride={
              summary.status === 'block'
                ? { fill: 'rgba(239,68,68,0.25)', stroke: 'rgb(239,68,68)' }
                : summary.status === 'review'
                ? { fill: 'rgba(107,114,128,0.25)', stroke: 'rgb(107,114,128)' }
                : { fill: 'rgba(34,197,94,0.25)', stroke: 'rgb(34,197,94)' }
            }
          />
        </div>
      )}

      {/* Category table */}
      {categoryEntries.length > 0 && (
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
              <th className='py-2 font-medium'>{t('evaluation.modalCategory')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalThresholdPass')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalThresholdWarn')}</th>
              <th className='py-2 font-medium text-center'>{t('evaluation.modalStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {categoryEntries.map(([cat, score]) => {
              const threshold = thresholds[cat];
              const status = getSafetyStatus(score, threshold);
              const pct = (score * 100).toFixed(1);
              return (
                <tr key={cat} className='border-t border-gray-100 dark:border-gray-700'>
                  <td className='py-2 text-gray-700 dark:text-gray-300'>
                    {t(`evaluation.category.${categoryToI18nKey(cat)}`)}
                  </td>
                  <td className='py-2 text-right text-gray-600 dark:text-gray-400'>
                    {pct}%
                  </td>
                  <td className='py-2 text-right text-gray-500 dark:text-gray-400'>
                    {Math.round(threshold.review * 100)}%{t('evaluation.thresholdSuffixBelow')}
                  </td>
                  <td className='py-2 text-right text-gray-500 dark:text-gray-400'>
                    {Math.round(threshold.block * 100)}%{t('evaluation.thresholdSuffixBelow')}
                  </td>
                  <td className='py-2 text-center'>
                    {status === 'block' ? (
                      <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-500' />
                    ) : status === 'review' ? (
                      <span className='inline-block w-2.5 h-2.5 rounded-full bg-gray-400' />
                    ) : (
                      <span className='inline-block w-2.5 h-2.5 rounded-full bg-green-500' />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Local screening section */}
      {localSafety && (
        <div className='mt-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2'>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-semibold text-amber-800 dark:text-amber-300'>
              {t('evaluation.localScreening')}
            </span>
            <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-400'>
              {t('evaluation.localScreeningReference')}
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              localSafety.screening === 'safe' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              localSafety.screening === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {localSafety.screening}
            </span>
          </div>
          {localSafety.rawScores.length > 0 && (
            <div className='space-y-1'>
              {localSafety.rawScores.map((s) => (
                <div key={s.label} className='flex items-center gap-2 text-xs'>
                  <span className='w-28 text-gray-600 dark:text-gray-400 truncate'>{s.label}</span>
                  <div className='flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
                    <div
                      className='h-full bg-amber-500 rounded-full'
                      style={{ width: `${Math.round(s.score * 100)}%` }}
                    />
                  </div>
                  <span className='w-8 text-right text-gray-500 dark:text-gray-400'>
                    {Math.round(s.score * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className='text-[10px] text-gray-400 dark:text-gray-500'>
            {new Date(localSafety.timestamp).toLocaleString(i18next.language)}
          </div>
        </div>
      )}

      {result && (
        <div className='text-xs text-gray-400 dark:text-gray-500'>
          {new Date(result.timestamp).toLocaleString(i18next.language)}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Quality Tab
// ---------------------------------------------------------------------------

const AxisProgressBadge = ({ state }: { state?: AxisProgressState }) => {
  const { t } = useTranslation('main');
  if (!state || state === 'done') return null;
  if (state === 'generating') {
    return (
      <span className='inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-800/40 text-blue-600 dark:text-blue-400 animate-pulse'>
        <svg className='w-2.5 h-2.5 animate-spin' viewBox='0 0 16 16' fill='none'>
          <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='2' strokeDasharray='28' strokeDashoffset='8' />
        </svg>
        {t('evaluation.axisGenerating')}
      </span>
    );
  }
  return (
    <span className='text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'>
      {t('evaluation.axisWaiting')}
    </span>
  );
};

const QualityTab = ({
  result,
  isRunning,
  onReEvaluate,
  error,
  thresholds,
  disabledReason,
  scope,
  omittedMode,
  role,
  onScopeChange,
  onOmittedModeChange,
  axisProgress,
}: {
  result?: QualityEvaluationResult;
  isRunning: boolean;
  thresholds: QualityThresholds;
  onReEvaluate: () => void;
  error?: FormattedEvaluationError | null;
  disabledReason?: string | null;
  axisProgress?: AxisProgressMap;
  scope: EvaluationScope;
  omittedMode: EvaluationOmittedMode;
  role: string;
  onScopeChange: (s: EvaluationScope) => void;
  onOmittedModeChange: (m: EvaluationOmittedMode) => void;
}) => {
  const { t } = useTranslation('main');

  const isSystem = result?.kind === 'system';
  const axisKeys = isSystem ? systemQualityAxisKeys : qualityAxisKeys;
  const axisPrefix = isSystem ? 'evaluation.systemAxis' : 'evaluation.axis';
  const labels = axisKeys.map((k) => t(`${axisPrefix}.${k}`));
  const scores = result ? axisKeys.map((k) => (result.scores as unknown as Record<string, number>)[k]) : [];
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const avgRed = qualityAxisKeys.reduce((s, k) => s + thresholds[k].red, 0) / qualityAxisKeys.length;
  const avgGreen = qualityAxisKeys.reduce((s, k) => s + thresholds[k].green, 0) / qualityAxisKeys.length;
  const avgDotColor =
    avgScore >= avgGreen ? 'bg-green-500' : avgScore >= avgRed ? 'bg-yellow-500' : 'bg-red-500';
  const radarColor: { fill: string; stroke: string } =
    avgScore >= avgGreen
      ? { fill: 'rgba(34,197,94,0.25)', stroke: 'rgb(34,197,94)' }
      : avgScore >= avgRed
      ? { fill: 'rgba(234,179,8,0.25)', stroke: 'rgb(234,179,8)' }
      : { fill: 'rgba(239,68,68,0.25)', stroke: 'rgb(239,68,68)' };

  return (
    <div className='space-y-4'>
      {/* Header row 1: status + re-evaluate */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {result && (
            <>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${avgDotColor}`} />
              <span className='text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap'>
                {t('evaluation.modalAverage')}: {Math.round(avgScore * 100)}%
              </span>
            </>
          )}
          {!result && !isRunning && (
            <span className='text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap'>
              {t('evaluation.notEvaluated')}
            </span>
          )}
        </div>
        <button
          className='text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 whitespace-nowrap'
          onClick={onReEvaluate}
          disabled={isRunning || !!disabledReason}
          title={disabledReason ?? undefined}
        >
          {isRunning ? t('evaluation.running') : result ? t('evaluation.reEvaluate') : t('evaluation.runEvaluation')}
        </button>
      </div>
      {/* Header row 2: scope controls */}
      <InlineScopeControls
        scope={scope}
        omittedMode={omittedMode}
        role={role}
        onScopeChange={onScopeChange}
        onOmittedModeChange={onOmittedModeChange}
      />

      {disabledReason && !isRunning && (
        <div className='text-xs text-amber-600 dark:text-amber-400'>
          {disabledReason}
        </div>
      )}

      {error && <ErrorBanner message={error.message} />}

      {/* Local source badge */}
      {result?.source === 'local' && (
        <div className='flex items-center gap-2 mb-1'>
          <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-400 font-medium'>
            {t('evaluation.localQualityExperimental')}
          </span>
        </div>
      )}

      {/* Radar chart */}
      {result && (
        <div className='flex justify-center'>
          <RadarChart labels={labels} scores={scores} size={400} colorOverride={radarColor} />
        </div>
      )}

      {/* Score table */}
      {result && (
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
              <th className='py-2 font-medium'>{t('evaluation.modalAxis')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalThreshold')}</th>
              <th className='py-2 font-medium text-center'>{t('evaluation.modalStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {axisKeys.map((axis) => {
              const score = (result.scores as unknown as Record<string, number>)[axis];
              const th = (thresholds as Record<string, { red: number; green: number }>)[axis]
                ?? { red: 0.5, green: 0.8 };
              const dotColor =
                score >= th.green ? 'bg-green-500' : score >= th.red ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <tr key={axis} className='border-t border-gray-100 dark:border-gray-700'>
                  <td className='py-2 text-gray-700 dark:text-gray-300'>
                    <span className='flex items-center gap-1.5'>
                      {t(`${axisPrefix}.${axis}`)}
                      <AxisProgressBadge state={axisProgress?.[axis as keyof QualityScores]} />
                    </span>
                  </td>
                  <td className='py-2 text-right text-gray-600 dark:text-gray-400'>
                    {Math.round(score * 100)}%
                  </td>
                  <td className='py-2 text-right text-gray-500 dark:text-gray-400'>
                    {Math.round(th.red * 100)}%{t('evaluation.thresholdSuffixAbove')}
                  </td>
                  <td className='py-2 text-center'>
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className='border-t-2 border-gray-200 dark:border-gray-600'>
              <td className='py-2 font-semibold text-gray-900 dark:text-gray-200'>
                {t('evaluation.modalAverage')}
              </td>
              <td className='py-2 text-right font-bold text-gray-900 dark:text-gray-200'>
                {Math.round(avgScore * 100)}%
              </td>
              <td />
              <td className='py-2 text-center'>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${avgDotColor}`} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* Reasoning per axis */}
      {(result || axisProgress) && (
        <div className='space-y-2'>
          {axisKeys.map((axis) => {
            const reasoning = result ? (result.reasoning as unknown as Record<string, string>)[axis] : undefined;
            const progress = axisProgress?.[axis as keyof QualityScores];
            if (!reasoning && !progress) return null;
            return (
              <div key={axis} className='text-sm'>
                <div className='flex items-center gap-1'>
                  <span className='font-medium text-gray-700 dark:text-gray-300'>
                    {t(`${axisPrefix}.${axis}`)}:
                  </span>
                  <AxisProgressBadge state={progress} />
                  {reasoning && <button
                    className='p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
                    title={t('evaluation.copyReasoning') as string}
                    onClick={() => navigator.clipboard.writeText(reasoning)}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='currentColor' className='w-3.5 h-3.5'>
                      <path d='M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z' />
                      <path d='M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z' />
                    </svg>
                  </button>}
                </div>
                {reasoning && <span className='text-gray-600 dark:text-gray-400'>{reasoning}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Suggestions */}
      {result && result.promptSuggestions.length > 0 && (
        <div className='space-y-1'>
          <h5 className='text-sm font-semibold text-gray-700 dark:text-gray-300'>
            {t('evaluation.promptSuggestions')}
          </h5>
          <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5'>
            {result.promptSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {result && result.configSuggestions.length > 0 && (
        <div className='space-y-1'>
          <h5 className='text-sm font-semibold text-gray-700 dark:text-gray-300'>
            {t('evaluation.configSuggestions')}
          </h5>
          <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5'>
            {result.configSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className='text-xs text-gray-400 dark:text-gray-500'>
          {new Date(result.timestamp).toLocaleString(i18next.language)}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

const EvaluationModal: React.FC<EvaluationModalProps> = ({
  chatId,
  nodeId,
  chatIndex,
  messageIndex,
  phase,
  role,
  resolvedProvider,
  model,
  setIsModalOpen,
  initialTab,
}) => {
  const { t } = useTranslation('main');

  // Fixed width based on viewport — recalculated only on window resize
  const computeDialogWidth = () => {
    const vw = window.innerWidth;
    if (vw < 640) return vw - 32;          // mobile: full width minus padding
    if (vw < 1024) return Math.min(vw - 64, 720);  // tablet
    return Math.min(vw - 128, 896);        // desktop: max ~56rem
  };
  const [dialogWidth, setDialogWidth] = useState(computeDialogWidth);

  useEffect(() => {
    const handleResize = () => setDialogWidth(computeDialogWidth());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'safety');
  const [safetyRunning, setSafetyRunning] = useState(false);
  const [qualityRunning, setQualityRunning] = useState(false);
  const [safetyError, setSafetyError] = useState<FormattedEvaluationError | null>(null);
  const [qualityError, setQualityError] = useState<FormattedEvaluationError | null>(null);

  // Scope options (shared across tabs)
  const [scope, setScope] = useState<EvaluationScope>('full-context');
  const [omittedMode, setOmittedMode] = useState<EvaluationOmittedMode>('respect-omitted');

  const setShowProxySettings = useStore((state) => state.setShowProxySettings);
  const safetyThresholds = useStore((state) => state.safetyThresholds);
  const qualityThresholds = useStore((state) => state.qualityThresholds);

  const key = evaluationResultKey(chatId, nodeId, phase);
  const result: EvaluationResult | undefined = useStore(
    (state) => state.evaluationResults[key]
  );
  const axisProgress: AxisProgressMap | undefined = useStore(
    (state) => state.evaluationAxisProgress[key]
  );

  const currentContextInfo: EvaluationContextInfo = {
    scope,
    omittedMode: scope === 'full-context' ? omittedMode : 'respect-omitted',
  };

  const evaluationMode: QualityEvaluationMode = role === 'system' ? 'system' : role === 'assistant' ? 'assistant' : 'user';

  // Local model busy check for quality tab.
  // handleRunQuality only takes the local path when activeLocalModels['analysis'] is set,
  // so we must match exactly that condition — not the wider fallback chain in localEvaluation.ts.
  const qualityLocalModelId = useStore((s) =>
    s.localModelEnabled ? (s.activeLocalModels['analysis'] ?? null) : null
  );
  const { isBusy: isQualityModelBusy, busyReason: qualityBusyReason } = useLocalModelBusy(qualityLocalModelId);

  // Pre-resolve context to check availability for button disabling (P3)
  const preResolvedCtx = resolveEvalContext(chatIndex, messageIndex, role, scope, omittedMode);
  const qualityDisabledReason: string | null = (() => {
    if (isQualityModelBusy && qualityBusyReason) {
      return t(`localModel.busy.${qualityBusyReason}`) as string;
    }
    if (!preResolvedCtx) return t('evaluation.noContext') as string;
    if (role === 'system') {
      // System evaluation: check if there's system prompt text
      if (!preResolvedCtx.userText) return t('evaluation.noSystemText') as string;
      return null;
    }
    const promptText = scope === 'full-context' ? preResolvedCtx.contextText : preResolvedCtx.userText;
    if (!promptText) return t('evaluation.noUserText') as string;
    return null;
  })();

  const handleRunSafety = useCallback(async () => {
    const ctx = resolveEvalContext(chatIndex, messageIndex, role, scope, omittedMode);
    if (!ctx) return;

    // For full-context: check the full conversation text (all roles)
    // plus assistant text if post-receive.
    // For single: check just the target message text.
    let textToCheck: string;
    if (scope === 'full-context') {
      // Include the full conversation context
      const parts = [ctx.contextText];
      if (phase === 'post-receive' && ctx.assistantText) {
        parts.push(`[assistant]\n${ctx.assistantText}`);
      }
      textToCheck = parts.join('\n\n');
    } else {
      // Single: check just the target message
      textToCheck = phase === 'post-receive'
        ? (ctx.assistantText ?? ctx.userText)
        : ctx.userText;
    }
    if (!textToCheck) return;

    setSafetyRunning(true);
    setSafetyError(null);
    try {
      const safety = await runSafetyCheck(textToCheck);
      const existing = useStore.getState().evaluationResults[key];
      useStore.getState().setEvaluationResult(key, {
        ...existing,
        phase,
        safety,
        safetyContext: { ...currentContextInfo },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSafetyError(formatEvaluationErrorMessage(msg, t));
      console.warn('[evaluation] safety check failed:', e);
    } finally {
      setSafetyRunning(false);
    }
  }, [key, phase, chatIndex, messageIndex, role, scope, omittedMode, t]);

  const handleRunQuality = useCallback(async () => {
    const ctx = resolveEvalContext(chatIndex, messageIndex, role, scope, omittedMode);
    if (!ctx) return;
    // full-context: use contextText (all roles) so the judge sees the
    // actual generation context including prior assistant turns and system
    // messages.  single: use userText (user-role only).
    const promptText = scope === 'full-context' ? ctx.contextText : ctx.userText;
    if (!promptText) return;

    setQualityRunning(true);
    setQualityError(null);
    try {
      const store = useStore.getState();
      const analysisModelId = store.localModelEnabled
        ? (store.activeLocalModels['analysis'] ?? null)
        : null;

      if (analysisModelId) {
        // Use local analysis (evaluation) model
        await prepareModelsForExecution([analysisModelId]);
        const axisProgress = (axis: keyof QualityScores, state: AxisProgressState) => {
          useStore.getState().setEvaluationAxisProgress(key, { [axis]: state });
        };
        const quality = await runLocalQualityEvaluation(
          promptText,
          phase === 'post-receive' ? ctx.assistantText : undefined,
          axisProgress,
        );
        const existing = store.evaluationResults[key];
        store.setEvaluationResult(key, {
          ...existing,
          phase,
          quality,
          qualityContext: { ...currentContextInfo },
        });
      } else {
        // Use remote API
        const quality = await runQualityEvaluation(
          promptText,
          phase === 'post-receive' ? ctx.assistantText : undefined,
          resolvedProvider.endpoint,
          model,
          resolvedProvider.key,
          i18next.language,
          evaluationMode
        );
        const existing = store.evaluationResults[key];
        store.setEvaluationResult(key, {
          ...existing,
          phase,
          quality,
          qualityContext: { ...currentContextInfo },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQualityError(formatEvaluationErrorMessage(msg, t));
      console.warn('[evaluation] quality evaluation failed:', e);
    } finally {
      setQualityRunning(false);
      useStore.getState().clearEvaluationAxisProgress(key);
    }
  }, [key, phase, chatIndex, messageIndex, role, scope, omittedMode, resolvedProvider, model, t]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'safety', label: t('evaluation.safetyTabLabel') },
    { id: 'quality', label: t('evaluation.qualityTabLabel') },
  ];

  return (
    <PopupModal
      title={t('evaluation.modalTitle') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
      maxWidth='max-w-4xl'
    >
      <div className='px-6 pt-2 pb-6 space-y-4' style={{ width: dialogWidth }}>
        {/* Tab bar */}
        <div className='flex border-b border-gray-200 dark:border-gray-600'>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {/* Indicator dots */}
              {tab.id === 'safety' && result?.safety && (() => {
                  const summary = summarizeSafetyScores(result.safety.categoryScores, safetyThresholds);
                  const color = summary.status === 'block'
                    ? 'bg-red-500'
                    : summary.status === 'review'
                    ? 'bg-gray-400'
                    : 'bg-green-500';
                  return <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${color}`} />;
                })()}
              {tab.id === 'quality' && result?.quality && (() => {
                const q = result.quality!;
                const scoresObj = q.scores as unknown as Record<string, number>;
                const keys: string[] = q.kind === 'system' ? [...systemQualityAxisKeys] : [...qualityAxisKeys];
                const qScores = keys.map((k) => scoresObj[k]);
                const qAvg = qScores.reduce((a: number, b: number) => a + b, 0) / qScores.length;
                const thObj = qualityThresholds as unknown as Record<string, { red: number; green: number }>;
                const qAvgRed = keys.reduce((s: number, k: string) => s + (thObj[k]?.red ?? 0.5), 0) / keys.length;
                const qAvgGreen = keys.reduce((s: number, k: string) => s + (thObj[k]?.green ?? 0.8), 0) / keys.length;
                const qDot = qAvg >= qAvgGreen ? 'bg-green-500' : qAvg >= qAvgRed ? 'bg-yellow-500' : 'bg-red-500';
                return <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${qDot}`} />;
              })()}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'safety' && (
          <SafetyTab
            result={result?.safety}
            localSafety={result?.localSafety}
            isRunning={safetyRunning}
            onReEvaluate={handleRunSafety}
            error={safetyError}
            onOpenProxySettings={() => {
              setIsModalOpen(false);
              setShowProxySettings(true);
            }}
            thresholds={safetyThresholds}
            scope={scope}
            omittedMode={omittedMode}
            role={role}
            onScopeChange={setScope}
            onOmittedModeChange={setOmittedMode}
          />
        )}
        {activeTab === 'quality' && (
          <QualityTab
            result={result?.quality}
            isRunning={qualityRunning}
            onReEvaluate={handleRunQuality}
            error={qualityError}
            thresholds={qualityThresholds}
            disabledReason={qualityDisabledReason}
            axisProgress={axisProgress}
            scope={scope}
            omittedMode={omittedMode}
            role={role}
            onScopeChange={setScope}
            onOmittedModeChange={setOmittedMode}
          />
        )}
      </div>
    </PopupModal>
  );
};

export default EvaluationModal;
