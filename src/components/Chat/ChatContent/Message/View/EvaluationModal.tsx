import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import RadarChart from './RadarChart';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys } from '@type/evaluation';
import type {
  EvaluationResult,
  SafetyCheckResult,
  QualityEvaluationResult,
} from '@type/evaluation';
import { runSafetyCheck, runQualityEvaluation } from '@api/evaluation';
import type { ResolvedProvider } from '@hooks/submitHelpers';

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

const ErrorBanner = ({ message }: { message: string }) => (
  <div className='rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 break-all'>
    {message}
  </div>
);

const SafetyTab = ({
  result,
  isRunning,
  onReEvaluate,
  error,
}: {
  result?: SafetyCheckResult;
  isRunning: boolean;
  onReEvaluate: () => void;
  error?: string | null;
}) => {
  const { t } = useTranslation('main');

  const categoryEntries = result
    ? Object.entries(result.categoryScores)
        .filter(([, v]) => typeof v === 'number')
        .sort(([, a], [, b]) => (b as number) - (a as number))
    : [];

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

      {error && <ErrorBanner message={error} />}

      {/* Category table */}
      {categoryEntries.length > 0 && (
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
              <th className='py-2 font-medium'>{t('evaluation.modalCategory')}</th>
              <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
              <th className='py-2 font-medium text-center'>{t('evaluation.modalStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {categoryEntries.map(([cat, score]) => {
              const flagged = result?.categories[cat as keyof SafetyCheckResult['categories']];
              const pct = ((score as number) * 100).toFixed(1);
              return (
                <tr key={cat} className='border-t border-gray-100 dark:border-gray-700'>
                  <td className='py-2 text-gray-700 dark:text-gray-300'>{cat}</td>
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
          {new Date(result.timestamp).toLocaleString()}
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
}: {
  result?: QualityEvaluationResult;
  isRunning: boolean;
  onReEvaluate: () => void;
  error?: string | null;
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

      {error && <ErrorBanner message={error} />}

      {/* Radar chart + Table */}
      {result && (
        <div className='flex flex-col md:flex-row gap-4 items-center md:items-start'>
          <div className='flex-shrink-0'>
            <RadarChart labels={labels} scores={scores} size={260} />
          </div>
          <div className='flex-1 min-w-0'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600'>
                  <th className='py-2 font-medium'>{t('evaluation.modalAxis')}</th>
                  <th className='py-2 font-medium text-right'>{t('evaluation.modalScore')}</th>
                </tr>
              </thead>
              <tbody>
                {qualityAxisKeys.map((axis) => {
                  const score = result.scores[axis];
                  const colorClass =
                    score >= 0.8
                      ? 'text-green-600 dark:text-green-400'
                      : score >= 0.5
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400';
                  return (
                    <tr
                      key={axis}
                      className='border-t border-gray-100 dark:border-gray-700'
                    >
                      <td className='py-2 text-gray-700 dark:text-gray-300'>
                        {t(`evaluation.axis.${axis}`)}
                      </td>
                      <td className={`py-2 text-right font-semibold ${colorClass}`}>
                        {Math.round(score * 100)}%
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
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Reasoning per axis */}
      {result && (
        <div className='space-y-2'>
          {qualityAxisKeys.map((axis) => {
            const reasoning = result.reasoning[axis];
            if (!reasoning) return null;
            return (
              <div key={axis} className='text-sm'>
                <span className='font-medium text-gray-700 dark:text-gray-300'>
                  {t(`evaluation.axis.${axis}`)}:
                </span>{' '}
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
          {new Date(result.timestamp).toLocaleString()}
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
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

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
      const safety = await runSafetyCheck(
        textToCheck,
        resolvedProvider.endpoint,
        model,
        resolvedProvider.key
      );
      const existing = useStore.getState().evaluationResults[key];
      useStore.getState().setEvaluationResult(key, {
        ...existing,
        phase,
        safety,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSafetyError(msg);
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
        resolvedProvider.key
      );
      const existing = useStore.getState().evaluationResults[key];
      useStore.getState().setEvaluationResult(key, {
        ...existing,
        phase,
        quality,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQualityError(msg);
      console.warn('[evaluation] quality evaluation failed:', e);
    } finally {
      setQualityRunning(false);
    }
  }, [key, phase, userText, assistantText, resolvedProvider, model]);

  const phaseLabel =
    phase === 'pre-send'
      ? t('evaluation.phasePreSend')
      : t('evaluation.phasePostReceive');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'safety', label: t('evaluation.safetyTitle') },
    { id: 'quality', label: t('evaluation.qualityTitle') },
  ];

  return (
    <PopupModal
      title={`${t('evaluation.modalTitle')} — ${phaseLabel}`}
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
          />
        )}
        {activeTab === 'quality' && (
          <QualityTab
            result={result?.quality}
            isRunning={qualityRunning}
            onReEvaluate={handleRunQuality}
            error={qualityError}
          />
        )}
      </div>
    </PopupModal>
  );
};

export default EvaluationModal;
