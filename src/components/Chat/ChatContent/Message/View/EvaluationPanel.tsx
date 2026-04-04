import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { evaluationResultKey, qualityAxisKeys } from '@type/evaluation';
import type { EvaluationResult, SafetyCheckResult, QualityEvaluationResult } from '@type/evaluation';

interface EvaluationPanelProps {
  chatId: string;
  nodeId: string;
  phase: 'pre-send' | 'post-receive';
}

const ScoreBar = ({ score, label }: { score: number; label: string }) => {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8 ? 'bg-green-500' : score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
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
    <div className='space-y-1.5'>
      <div className='flex items-center gap-2'>
        <span className='text-xs font-semibold text-gray-600 dark:text-gray-400'>
          {t('evaluation.safetyTitle')}
        </span>
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            result.flagged
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          {result.flagged ? t('evaluation.flagged') : t('evaluation.safe')}
        </span>
      </div>
      {flaggedCategories.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {flaggedCategories.map((cat) => (
            <span
              key={cat}
              className='text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
            >
              {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const QualitySection = ({ result }: { result: QualityEvaluationResult }) => {
  const { t } = useTranslation('main');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='space-y-2'>
      <div className='text-xs font-semibold text-gray-600 dark:text-gray-400'>
        {t('evaluation.qualityTitle')}
      </div>
      <div className='space-y-1'>
        {qualityAxisKeys.map((axis) => (
          <ScoreBar
            key={axis}
            score={result.scores[axis]}
            label={t(`evaluation.axis.${axis}`)}
          />
        ))}
      </div>
      <button
        className='text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400'
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? t('evaluation.hideDetails') : t('evaluation.showDetails')}
      </button>
      {expanded && (
        <div className='space-y-2 text-xs text-gray-600 dark:text-gray-400'>
          {qualityAxisKeys.map((axis) => {
            const reasoning = result.reasoning[axis];
            if (!reasoning) return null;
            return (
              <div key={axis}>
                <span className='font-medium'>{t(`evaluation.axis.${axis}`)}: </span>
                {reasoning}
              </div>
            );
          })}
          {result.promptSuggestions.length > 0 && (
            <div>
              <div className='font-medium mb-0.5'>{t('evaluation.promptSuggestions')}:</div>
              <ul className='list-disc list-inside'>
                {result.promptSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.configSuggestions.length > 0 && (
            <div>
              <div className='font-medium mb-0.5'>{t('evaluation.configSuggestions')}:</div>
              <ul className='list-disc list-inside'>
                {result.configSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ chatId, nodeId, phase }) => {
  const key = evaluationResultKey(chatId, nodeId, phase);
  const result: EvaluationResult | undefined = useStore(
    (state) => state.evaluationResults[key]
  );
  const pending = useStore((state) => state.evaluationPending[key]);

  if (!result && !pending) return null;

  return (
    <div className='mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-3'>
      {pending && (
        <div className='text-xs text-gray-500 dark:text-gray-400 animate-pulse'>
          Evaluating...
        </div>
      )}
      {result?.safety && <SafetySection result={result.safety} />}
      {result?.quality && <QualitySection result={result.quality} />}
    </div>
  );
};

export default EvaluationPanel;
