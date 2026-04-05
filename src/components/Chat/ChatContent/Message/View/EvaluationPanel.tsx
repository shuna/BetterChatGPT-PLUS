import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys, categoryToI18nKey } from '@type/evaluation';
import type { EvaluationResult, SafetyCheckResult, QualityEvaluationResult, QualityAxisThreshold } from '@type/evaluation';

interface EvaluationPanelProps {
  chatId: string;
  nodeId: string;
  phase: 'pre-send' | 'post-receive';
}

const ScoreBar = ({ score, label, threshold }: { score: number; label: string; threshold: QualityAxisThreshold }) => {
  const pct = Math.round(score * 100);
  const color =
    score >= threshold.green ? 'bg-green-500' : score >= threshold.red ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className='flex items-center gap-2 text-xs'>
      <span className='w-32 text-gray-600 dark:text-gray-400 truncate' title={label}>
        {label}
      </span>
      <div className='flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className='w-8 text-right text-gray-500 dark:text-gray-400'>{pct}%</span>
    </div>
  );
};

const SafetySection = ({ result }: { result: SafetyCheckResult }) => {
  const { t } = useTranslation('main');
  const flaggedCategories = Object.entries(result.categories)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='text-xs font-semibold text-gray-600 dark:text-gray-400'>
        {t('evaluation.safetyTitle')}
      </span>
      {result.flagged ? (
        <span className='text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'>
          {t('evaluation.flagged')}（{flaggedCategories.map((cat) => t(`evaluation.category.${categoryToI18nKey(cat)}`)).join(' ')}）
        </span>
      ) : (
        <span className='text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'>
          {t('evaluation.safe')}
        </span>
      )}
    </div>
  );
};

const QualitySummary = ({ result }: { result: QualityEvaluationResult }) => {
  const { t } = useTranslation('main');
  const qualityThresholds = useStore((state) => state.qualityThresholds);

  return (
    <div className='space-y-1'>
      <div className='text-xs font-semibold text-gray-600 dark:text-gray-400'>
        {t('evaluation.qualityTitle')}
      </div>
      {qualityAxisKeys.map((axis) => (
        <ScoreBar
          key={axis}
          score={result.scores[axis]}
          label={t(`evaluation.axis.${axis}`)}
          threshold={qualityThresholds[axis]}
        />
      ))}
    </div>
  );
};

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ chatId, nodeId, phase }) => {
  const key = evaluationResultKey(chatId, nodeId, phase);
  const result: EvaluationResult | undefined = useStore(
    (state) => state.evaluationResults[key]
  );
  const pending = useStore((state) => state.evaluationPending[key]);
  const { t } = useTranslation('main');

  if (!result && !pending) return null;

  return (
    <div className='mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-3'>
      {pending && (
        <div className='text-xs text-gray-500 dark:text-gray-400 animate-pulse'>
          Evaluating...
        </div>
      )}
      {result?.safety && <SafetySection result={result.safety} />}
      {result?.quality && <QualitySummary result={result.quality} />}
    </div>
  );
};

export default EvaluationPanel;
