import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys, categoryToI18nKey, summarizeSafetyScores } from '@type/evaluation';
import type { EvaluationResult, SafetyCheckResult, QualityEvaluationResult, QualityAxisThreshold, LocalModerationResult, LocalQualityHint } from '@type/evaluation';
import type { TabId } from './EvaluationModal';

interface EvaluationPanelProps {
  chatId: string;
  nodeId: string;
  phase: 'pre-send' | 'post-receive';
  onOpenTab?: (tab: TabId) => void;
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

const SafetySection = ({ result, onOpenTab }: { result: SafetyCheckResult; onOpenTab?: (tab: TabId) => void }) => {
  const { t } = useTranslation('main');
  const safetyThresholds = useStore((state) => state.safetyThresholds);
  const summary = summarizeSafetyScores(result.categoryScores, safetyThresholds);
  const categories = (summary.status === 'block' ? summary.blockCategories : summary.reviewCategories)
    .map((cat) => t(`evaluation.category.${categoryToI18nKey(cat)}`));

  return (
    <div className='space-y-1'>
      <button
        type='button'
        className='text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
        onClick={() => onOpenTab?.('safety')}
      >
        {t('evaluation.safetyTabLabel')}
      </button>
      <div className='pl-4'>
        {summary.status === 'block' ? (
          <span className='text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'>
            {t('evaluation.flagged')}（{categories.join(' ')}）
          </span>
        ) : summary.status === 'review' ? (
          <span className='text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300'>
            {t('evaluation.review')}（{categories.join(' ')}）
          </span>
        ) : (
          <span className='text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'>
            {t('evaluation.safe')}
          </span>
        )}
      </div>
    </div>
  );
};

const QualitySummary = ({ result, onOpenTab }: { result: QualityEvaluationResult; onOpenTab?: (tab: TabId) => void }) => {
  const { t } = useTranslation('main');
  const qualityThresholds = useStore((state) => state.qualityThresholds);

  return (
    <div className='space-y-1'>
      <button
        type='button'
        className='text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
        onClick={() => onOpenTab?.('quality')}
      >
        {t('evaluation.qualityTabLabel')}
      </button>
      <div className='pl-4 space-y-1'>
        {result.kind === 'system'
          ? (Object.keys(result.scores) as string[]).map((axis) => (
              <ScoreBar
                key={axis}
                score={(result.scores as unknown as Record<string, number>)[axis]}
                label={t(`evaluation.systemAxis.${axis}`)}
                threshold={qualityThresholds[axis as keyof typeof qualityThresholds] ?? { red: 0.5, green: 0.8 }}
              />
            ))
          : qualityAxisKeys.map((axis) => (
              <ScoreBar
                key={axis}
                score={result.scores[axis]}
                label={t(`evaluation.axis.${axis}`)}
                threshold={qualityThresholds[axis]}
              />
            ))}
      </div>
    </div>
  );
};

const LocalSafetyBadge = ({ result }: { result: LocalModerationResult }) => {
  const { t } = useTranslation('main');
  const colorMap = {
    'safe': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'warn': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'block-candidate': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <div className='flex items-center gap-2'>
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorMap[result.screening]}`}>
        Local: {result.screening}
      </span>
      <span className='text-[10px] text-gray-400 dark:text-gray-500'>
        {t('evaluation.localScreeningReference')}
      </span>
    </div>
  );
};

const LocalQualityBadge = ({ result }: { result: LocalQualityHint }) => {
  const { t } = useTranslation('main');
  const colorMap = {
    'good': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'fair': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'poor': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <div className='flex items-center gap-2'>
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorMap[result.grade]}`}>
        Local: {result.grade}
      </span>
      <span className='text-[10px] text-gray-400 dark:text-gray-500'>
        {t('evaluation.localQualityExperimental')}
      </span>
    </div>
  );
};

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ chatId, nodeId, phase, onOpenTab }) => {
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
      {result?.localSafety && <LocalSafetyBadge result={result.localSafety} />}
      {result?.safety && <SafetySection result={result.safety} onOpenTab={onOpenTab} />}
      {result?.quality && <QualitySummary result={result.quality} onOpenTab={onOpenTab} />}
      {result?.localQualityHint && <LocalQualityBadge result={result.localQualityHint} />}
    </div>
  );
};

export default EvaluationPanel;
