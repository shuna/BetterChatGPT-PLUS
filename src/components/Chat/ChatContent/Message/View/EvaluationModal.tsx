import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import RadarChart from './RadarChart';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys, moderationCategoryKeys, categoryToI18nKey, moderationThresholds } from '@type/evaluation';
import type {
  EvaluationResult,
  SafetyCheckResult,
  QualityEvaluationResult,
  QualityThresholds,
} from '@type/evaluation';
import { runSafetyCheck, runQualityEvaluation } from '@api/evaluation';
import type { ResolvedProvider } from '@hooks/submitHelpers';
import { formatEvaluationErrorMessage } from '@utils/evaluationError';
import type { FormattedEvaluationError } from '@utils/evaluationError';
import i18next from 'i18next';

type TabId = 'safety' | 'quality';

interface EvaluationModalProps {
  chatId: string;
  nodeId: string;
  phase: 'pre-send' | 'post-receive';
  userText: string;
  assistantText?: string;
  resolvedProvider: ResolvedProvider;
  model: string;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

// ---------------------------------------------------------------------------
// Safety Tab
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

const SafetyTab = ({
  result,
  isRunning,
  onReEvaluate,
  error,
  onOpenProxySettings,
}: {
  result?: SafetyCheckResult;
  isRunning: boolean;
  onReEvaluate: () => void;
  error?: FormattedEvaluationError | null;
  onOpenProxySettings: () => void;
}) => {
  const { t } = useTranslation('main');

  const categoryEntries = result
    ? moderationCategoryKeys
        .filter((k) => typeof result.categoryScores[k] === 'number')
        .map((k) => [k, result.categoryScores[k] as number] as const)
    : [];

  const radarLabels = categoryEntries.map(([cat]) => t(`evaluation.category.${categoryToI18nKey(cat)}`));
  // Invert scores: 0% risk → 100 (safe), 100% risk → 0
  const radarScores = categoryEntries.map(([, score]) => 1 - score);

  return (
    <div className='space-y-4'>
      {/* Header + Re-evaluate */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {result && (
            <span
              className={`text-sm font-medium px-2 py-1 rounded ${
                result.flagged
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {result.flagged ? t('evaluation.flagged') : t('evaluation.safe')}
            </span>
          )}
          {!result && !isRunning && (
            <span className='text-sm text-gray-500 dark:text-gray-400'>
              {t('evaluation.notEvaluated')}
            </span>
          )}
        </div>
        <button
          className='text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50'
          onClick={onReEvaluate}
          disabled={isRunning}
        >
          {isRunning ? t('evaluation.running') : result ? t('evaluation.reEvaluate') : t('evaluation.runEvaluation')}
        </button>
      </div>

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
          <RadarChart labels={radarLabels} scores={radarScores} size={300} />
        </div>
      )}

      {/* Category table */}
      {categoryEntries.length > 0 && (
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
              <th className='py-2 font-medium'>{t('evaluation.modalCategory')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalThreshold')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
              <th className='py-2 font-medium text-center'>{t('evaluation.modalStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {categoryEntries.map(([cat, score]) => {
              const flagged = result?.categories[cat];
              const pct = (score * 100).toFixed(1);
              const threshold = moderationThresholds[cat];
              const thresholdPct = (threshold * 100).toFixed(1);
              return (
                <tr key={cat} className='border-t border-gray-100 dark:border-gray-700'>
                  <td className='py-2 text-gray-700 dark:text-gray-300'>
                    {t(`evaluation.category.${categoryToI18nKey(cat)}`)}
                  </td>
                  <td className='py-2 text-right text-gray-500 dark:text-gray-400'>
                    {thresholdPct}%
                  </td>
                  <td className='py-2 text-right text-gray-600 dark:text-gray-400'>
                    {pct}%
                  </td>
                  <td className='py-2 text-center'>
                    {flagged ? (
                      <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-500' />
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

const QualityTab = ({
  result,
  isRunning,
  onReEvaluate,
  error,
  thresholds,
}: {
  result?: QualityEvaluationResult;
  isRunning: boolean;
  thresholds: QualityThresholds;
  onReEvaluate: () => void;
  error?: FormattedEvaluationError | null;
}) => {
  const { t } = useTranslation('main');

  const labels = qualityAxisKeys.map((k) => t(`evaluation.axis.${k}`));
  const scores = result ? qualityAxisKeys.map((k) => result.scores[k]) : [];
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return (
    <div className='space-y-4'>
      {/* Header + Re-evaluate */}
      <div className='flex items-center justify-between'>
        <div>
          {result && (
            <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              {t('evaluation.modalAverage')}: {Math.round(avgScore * 100)}%
            </span>
          )}
          {!result && !isRunning && (
            <span className='text-sm text-gray-500 dark:text-gray-400'>
              {t('evaluation.notEvaluated')}
            </span>
          )}
        </div>
        <button
          className='text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50'
          onClick={onReEvaluate}
          disabled={isRunning}
        >
          {isRunning ? t('evaluation.running') : result ? t('evaluation.reEvaluate') : t('evaluation.runEvaluation')}
        </button>
      </div>

      {error && <ErrorBanner message={error.message} />}

      {/* Radar chart */}
      {result && (
        <div className='flex justify-center'>
          <RadarChart labels={labels} scores={scores} size={260} />
        </div>
      )}

      {/* Score table – same layout as SafetyTab */}
      {result && (
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
              <th className='py-2 font-medium'>{t('evaluation.modalAxis')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalThreshold')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
              <th className='py-2 font-medium text-center'>{t('evaluation.modalStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {qualityAxisKeys.map((axis) => {
              const score = result.scores[axis];
              const th = thresholds[axis];
              const dotColor =
                score >= th.green ? 'bg-green-500' : score >= th.red ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <tr
                  key={axis}
                  className='border-t border-gray-100 dark:border-gray-700'
                >
                  <td className='py-2 text-gray-700 dark:text-gray-300'>
                    {t(`evaluation.axis.${axis}`)}
                  </td>
                  <td className='py-2 text-right text-gray-500 dark:text-gray-400'>
                    {Math.round(th.red * 100)}%
                  </td>
                  <td className='py-2 text-right text-gray-600 dark:text-gray-400'>
                    {Math.round(score * 100)}%
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
              <td />
              <td className='py-2 text-right font-bold text-gray-900 dark:text-gray-200'>
                {Math.round(avgScore * 100)}%
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {/* Reasoning per axis */}
      {result && (
        <div className='space-y-2'>
          {qualityAxisKeys.map((axis) => {
            const reasoning = result.reasoning[axis];
            if (!reasoning) return null;
            return (
              <div key={axis} className='text-sm'>
                <div className='flex items-center gap-1'>
                  <span className='font-medium text-gray-700 dark:text-gray-300'>
                    {t(`evaluation.axis.${axis}`)}:
                  </span>
                  <button
                    className='p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
                    title={t('evaluation.copyReasoning') as string}
                    onClick={() => navigator.clipboard.writeText(reasoning)}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='currentColor' className='w-3.5 h-3.5'>
                      <path d='M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z' />
                      <path d='M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z' />
                    </svg>
                  </button>
                </div>
                <span className='text-gray-600 dark:text-gray-400'>{reasoning}</span>
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
  phase,
  userText,
  assistantText,
  resolvedProvider,
  model,
  setIsModalOpen,
}) => {
  const { t } = useTranslation('main');
  const [activeTab, setActiveTab] = useState<TabId>('safety');
  const [safetyRunning, setSafetyRunning] = useState(false);
  const [qualityRunning, setQualityRunning] = useState(false);
  const [safetyError, setSafetyError] = useState<FormattedEvaluationError | null>(null);
  const [qualityError, setQualityError] = useState<FormattedEvaluationError | null>(null);
  const setShowProxySettings = useStore((state) => state.setShowProxySettings);
  const qualityThresholds = useStore((state) => state.qualityThresholds);

  const key = evaluationResultKey(chatId, nodeId, phase);
  const result: EvaluationResult | undefined = useStore(
    (state) => state.evaluationResults[key]
  );

  const handleRunSafety = useCallback(async () => {
    const textToCheck = phase === 'pre-send' ? userText : (assistantText ?? userText);
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
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSafetyError(formatEvaluationErrorMessage(msg, t));
      console.warn('[evaluation] safety check failed:', e);
    } finally {
      setSafetyRunning(false);
    }
  }, [key, phase, userText, assistantText, resolvedProvider]);

  const handleRunQuality = useCallback(async () => {
    if (!userText) return;
    setQualityRunning(true);
    setQualityError(null);
    try {
      const quality = await runQualityEvaluation(
        userText,
        phase === 'post-receive' ? assistantText : undefined,
        resolvedProvider.endpoint,
        model,
        resolvedProvider.key,
        i18next.language
      );
      const existing = useStore.getState().evaluationResults[key];
      useStore.getState().setEvaluationResult(key, {
        ...existing,
        phase,
        quality,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQualityError(formatEvaluationErrorMessage(msg, t));
      console.warn('[evaluation] quality evaluation failed:', e);
    } finally {
      setQualityRunning(false);
    }
  }, [key, phase, userText, assistantText, resolvedProvider, model]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'safety', label: t('evaluation.safetyTitle') },
    { id: 'quality', label: t('evaluation.qualityTitle') },
  ];

  return (
    <PopupModal
      title={t('evaluation.modalTitle') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
      maxWidth='max-w-3xl'
    >
      <div className='p-6 space-y-4'>
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
              {tab.id === 'safety' && result?.safety && (
                <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${result.safety.flagged ? 'bg-red-500' : 'bg-green-500'}`} />
              )}
              {tab.id === 'quality' && result?.quality && (
                <span className='ml-1.5 inline-block w-2 h-2 rounded-full bg-blue-500' />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'safety' && (
          <SafetyTab
            result={result?.safety}
            isRunning={safetyRunning}
            onReEvaluate={handleRunSafety}
            error={safetyError}
            onOpenProxySettings={() => {
              setIsModalOpen(false);
              setShowProxySettings(true);
            }}
          />
        )}
        {activeTab === 'quality' && (
          <QualityTab
            result={result?.quality}
            isRunning={qualityRunning}
            onReEvaluate={handleRunQuality}
            error={qualityError}
            thresholds={qualityThresholds}
          />
        )}
      </div>
    </PopupModal>
  );
};

export default EvaluationModal;
