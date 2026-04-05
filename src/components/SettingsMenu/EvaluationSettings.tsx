import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { SettingsGroup, SettingsRow } from './SettingsMenu';
import { InfoTooltip, ResetButton } from '@components/ConfigMenu/fields';
import type {
  EvaluationSettings as EvaluationSettingsType,
  EvaluationTriggerMode,
  QualityScores,
  QualityAxisThreshold,
  ModerationCategories,
  SafetyCategoryThreshold,
} from '@type/evaluation';
import {
  moderationCategoryKeys,
  qualityAxisKeys,
  categoryToI18nKey,
  defaultQualityThresholds,
  defaultSafetyThresholds,
} from '@type/evaluation';

const modeOptions: { value: EvaluationTriggerMode; labelKey: string }[] = [
  { value: 'manual', labelKey: 'evaluation.modeManual' },
  { value: 'auto', labelKey: 'evaluation.modeAuto' },
];

const ModeSelect = ({
  value,
  onChange,
}: {
  value: EvaluationTriggerMode;
  onChange: (mode: EvaluationTriggerMode) => void;
}) => {
  const { t } = useTranslation('main');
  return (
    <select
      className='rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
      value={value}
      onChange={(e) => onChange(e.target.value as EvaluationTriggerMode)}
    >
      {modeOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {t(opt.labelKey)}
        </option>
      ))}
    </select>
  );
};

// ---------------------------------------------------------------------------
// Dual-thumb threshold slider: red | yellow | green
// ---------------------------------------------------------------------------

const thresholdInputClassName =
  'w-20 text-sm text-right bg-transparent border-b border-gray-400 dark:border-gray-500 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const MODERATION_DOCS_URL = 'https://platform.openai.com/docs/guides/moderation';
const EVALS_DOCS_URL = 'https://platform.openai.com/docs/guides/evaluation-best-practices';

const ThresholdItemLabel = ({
  label,
  description,
}: {
  label: string;
  description: React.ReactNode;
}) => (
  <div className='flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300'>
    <span>{label}</span>
    <InfoTooltip text={description} />
  </div>
);

const DualThresholdSlider = ({
  threshold,
  onChange,
  leftThumbClassName,
  rightThumbClassName,
  trackBackground,
  leftLabel,
  rightLabel,
  onResetLeft,
  showResetLeft,
  onResetRight,
  showResetRight,
}: {
  threshold: QualityAxisThreshold;
  onChange: (t: QualityAxisThreshold) => void;
  leftThumbClassName: string;
  rightThumbClassName: string;
  trackBackground: string;
  leftLabel: string;
  rightLabel: string;
  onResetLeft?: () => void;
  showResetLeft?: boolean;
  onResetRight?: () => void;
  showResetRight?: boolean;
}) => {
  const redPct = Math.round(threshold.red * 100);
  const greenPct = Math.round(threshold.green * 100);

  const handleRedChange = (val: number) => {
    const clamped = Math.min(val, greenPct);
    onChange({ red: clamped / 100, green: threshold.green });
  };

  const handleGreenChange = (val: number) => {
    const clamped = Math.max(val, redPct);
    onChange({ red: threshold.red, green: clamped / 100 });
  };

  const handleRedInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    const val = Math.max(0, Math.min(100, n));
    handleRedChange(val);
  };

  const handleGreenInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    const val = Math.max(0, Math.min(100, n));
    handleGreenChange(val);
  };

  return (
    <div className='flex items-center gap-2 w-full'>
      <div className='flex items-center gap-2'>
        {onResetLeft && <ResetButton onClick={onResetLeft} visible={showResetLeft} />}
      </div>
      <input
        type='number'
        min={0}
        max={100}
        value={redPct}
        onChange={(e) => handleRedInput(e.target.value)}
        className={thresholdInputClassName}
        title={leftLabel}
      />

      <div className='relative flex-1 h-6 flex items-center'>
        <div
          className='absolute inset-x-0 h-2 rounded-full'
          style={{ background: trackBackground }}
        />
        {/* Red thumb */}
        <input
          type='range'
          min={0}
          max={100}
          value={redPct}
          onChange={(e) => handleRedChange(parseInt(e.target.value, 10))}
          className={`absolute inset-x-0 w-full h-2 appearance-none bg-transparent pointer-events-none ${leftThumbClassName}`}
          style={{ zIndex: 2 }}
        />
        <input
          type='range'
          min={0}
          max={100}
          value={greenPct}
          onChange={(e) => handleGreenChange(parseInt(e.target.value, 10))}
          className={`absolute inset-x-0 w-full h-2 appearance-none bg-transparent pointer-events-none ${rightThumbClassName}`}
          style={{ zIndex: 3 }}
        />
      </div>

      <input
        type='number'
        min={0}
        max={100}
        value={greenPct}
        onChange={(e) => handleGreenInput(e.target.value)}
        className={thresholdInputClassName}
        title={rightLabel}
      />
      <div className='flex items-center gap-2'>
        {onResetRight && <ResetButton onClick={onResetRight} visible={showResetRight} />}
      </div>
    </div>
  );
};

const qualityLeftThumbClassName =
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer';

const qualityRightThumbClassName =
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer';

const safetyLeftThumbClassName =
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer';

const safetyRightThumbClassName =
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer';

const SafetyThresholdSlider = ({
  threshold,
  onChange,
  reviewLabel,
  blockLabel,
  onResetReview,
  showResetReview,
  onResetBlock,
  showResetBlock,
}: {
  threshold: SafetyCategoryThreshold;
  onChange: (t: SafetyCategoryThreshold) => void;
  reviewLabel: string;
  blockLabel: string;
  onResetReview?: () => void;
  showResetReview?: boolean;
  onResetBlock?: () => void;
  showResetBlock?: boolean;
}) => {
  const reviewPct = Math.round(threshold.review * 100);
  const blockPct = Math.round(threshold.block * 100);

  return (
    <DualThresholdSlider
      threshold={{ red: threshold.review, green: threshold.block }}
      onChange={(next) => onChange({ review: next.red, block: next.green })}
      leftThumbClassName={safetyLeftThumbClassName}
      rightThumbClassName={safetyRightThumbClassName}
      trackBackground={`linear-gradient(to right, rgb(34,197,94) 0%, rgb(34,197,94) ${reviewPct}%, rgb(209,213,219) ${reviewPct}%, rgb(209,213,219) ${blockPct}%, rgb(239,68,68) ${blockPct}%, rgb(239,68,68) 100%)`}
      leftLabel={reviewLabel}
      rightLabel={blockLabel}
      onResetLeft={onResetReview}
      showResetLeft={showResetReview}
      onResetRight={onResetBlock}
      showResetRight={showResetBlock}
    />
  );
};

const QualityThresholdSlider = ({
  threshold,
  onChange,
  redLabel,
  greenLabel,
  onResetRed,
  showResetRed,
  onResetGreen,
  showResetGreen,
}: {
  threshold: QualityAxisThreshold;
  onChange: (t: QualityAxisThreshold) => void;
  redLabel: string;
  greenLabel: string;
  onResetRed?: () => void;
  showResetRed?: boolean;
  onResetGreen?: () => void;
  showResetGreen?: boolean;
}) => {
  const redPct = Math.round(threshold.red * 100);
  const greenPct = Math.round(threshold.green * 100);

  return (
    <DualThresholdSlider
      threshold={threshold}
      onChange={onChange}
      leftThumbClassName={qualityLeftThumbClassName}
      rightThumbClassName={qualityRightThumbClassName}
      trackBackground={`linear-gradient(to right, rgb(239,68,68) 0%, rgb(239,68,68) ${redPct}%, rgb(234,179,8) ${redPct}%, rgb(234,179,8) ${greenPct}%, rgb(34,197,94) ${greenPct}%, rgb(34,197,94) 100%)`}
      leftLabel={redLabel}
      rightLabel={greenLabel}
      onResetLeft={onResetRed}
      showResetLeft={showResetRed}
      onResetRight={onResetGreen}
      showResetRight={showResetGreen}
    />
  );
};

// ---------------------------------------------------------------------------
// Main settings component
// ---------------------------------------------------------------------------

const EvaluationSettings = () => {
  const { t } = useTranslation('main');
  const settings = useStore((state) => state.evaluationSettings);
  const setEvaluationSetting = useStore((state) => state.setEvaluationSetting);
  const setSafetyEngine = useStore((state) => state.setSafetyEngine);
  const setHybridRemoteOnSafe = useStore((state) => state.setHybridRemoteOnSafe);
  const localModelEnabled = useStore((state) => state.localModelEnabled);
  const hasModerationModel = useStore((state) => !!state.activeLocalModels.moderation);
  const localSafetyReady = localModelEnabled && hasModerationModel;
  const safetyThresholds = useStore((state) => state.safetyThresholds);
  const setSafetyThreshold = useStore((state) => state.setSafetyThreshold);
  const qualityThresholds = useStore((state) => state.qualityThresholds);
  const setQualityThreshold = useStore((state) => state.setQualityThreshold);

  type TriggerKey = 'safetyPreSend' | 'safetyPostReceive' | 'qualityPreSend' | 'qualityPostReceive';

  const settingRows: {
    key: TriggerKey;
    labelKey: string;
  }[] = [
    { key: 'safetyPreSend', labelKey: 'evaluation.safetyPreSend' },
    { key: 'safetyPostReceive', labelKey: 'evaluation.safetyPostReceive' },
    { key: 'qualityPreSend', labelKey: 'evaluation.qualityPreSend' },
    { key: 'qualityPostReceive', labelKey: 'evaluation.qualityPostReceive' },
  ];

  return (
    <div className='flex flex-col gap-5'>
      <div>
        <div className='text-sm font-semibold text-gray-900 dark:text-gray-200'>
          {t('evaluation.safetyAboutTitle')}
        </div>
      </div>

      <p className='text-xs text-gray-500 dark:text-gray-400'>
        {t('evaluation.safetyDescription')}
      </p>

      <SettingsGroup label={t('evaluation.safetyTitle')}>
        {settingRows.slice(0, 2).map((row) => (
          <SettingsRow key={row.key} label={t(row.labelKey)}>
            <ModeSelect
              value={settings[row.key]}
              onChange={(mode) => setEvaluationSetting(row.key, mode)}
            />
          </SettingsRow>
        ))}
        {/* Safety engine selection */}
        <SettingsRow label={t('evaluation.safetyEngine') || 'Safety Engine'}>
          <select
            className='rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
            value={settings.safetyEngine}
            onChange={(e) => setSafetyEngine(e.target.value as 'remote' | 'local' | 'hybrid')}
          >
            <option value='remote'>Remote</option>
            <option value='local' disabled={!localSafetyReady}>Local</option>
            <option value='hybrid' disabled={!localSafetyReady}>Hybrid</option>
          </select>
        </SettingsRow>
        {settings.safetyEngine === 'hybrid' && (
          <div className='px-4 py-2 flex items-center justify-between'>
            <span className='text-xs text-gray-500 dark:text-gray-400'>
              {t('evaluation.hybridRemoteOnSafe') || 'Run remote even when local says safe (recommended)'}
            </span>
            <input
              type='checkbox'
              className='h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500'
              checked={settings.hybridRemoteOnSafe}
              onChange={(e) => setHybridRemoteOnSafe(e.target.checked)}
            />
          </div>
        )}
        {!localSafetyReady && (settings.safetyEngine === 'local' || settings.safetyEngine === 'hybrid') && (
          <div className='px-4 py-2 text-xs text-amber-600 dark:text-amber-400'>
            {!localModelEnabled
              ? (t('evaluation.localModelRequired') || 'Enable and configure a local model in the Local Models tab first.')
              : (t('evaluation.moderationModelRequired') || 'Assign a moderation model in the Local Models tab.')}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        label={(
          <a
            href={MODERATION_DOCS_URL}
            target='_blank'
            rel='noreferrer'
            className='underline decoration-gray-400/70 underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400'
          >
            {t('evaluation.safetyThresholds')}
          </a>
        )}
      >
        <div className='space-y-3 px-4 py-3'>
          <div className='flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-green-500' />
            <span>{t('evaluation.thresholdGreen')}</span>
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-500 ml-2' />
            <span>{t('evaluation.thresholdRed')}</span>
          </div>
          {moderationCategoryKeys.map((category) => (
            <div key={category} className='space-y-1'>
              <ThresholdItemLabel
                label={t(`evaluation.category.${categoryToI18nKey(category)}`)}
                description={t(`evaluation.categoryDescription.${categoryToI18nKey(category)}`)}
              />
              <SafetyThresholdSlider
                threshold={safetyThresholds[category]}
                onChange={(th) => setSafetyThreshold(category as keyof ModerationCategories, th)}
                reviewLabel={t('evaluation.thresholdReview')}
                blockLabel={t('evaluation.thresholdBlock')}
                onResetReview={() =>
                  setSafetyThreshold(category as keyof ModerationCategories, {
                    ...safetyThresholds[category],
                    review: defaultSafetyThresholds[category].review,
                  })}
                showResetReview={
                  safetyThresholds[category].review !== defaultSafetyThresholds[category].review
                }
                onResetBlock={() =>
                  setSafetyThreshold(category as keyof ModerationCategories, {
                    ...safetyThresholds[category],
                    block: defaultSafetyThresholds[category].block,
                  })}
                showResetBlock={
                  safetyThresholds[category].block !== defaultSafetyThresholds[category].block
                }
              />
            </div>
          ))}
        </div>
      </SettingsGroup>

      <div>
        <div className='text-sm font-semibold text-gray-900 dark:text-gray-200'>
          {t('evaluation.qualityAboutTitle')}
        </div>
      </div>

      <p className='text-xs text-gray-500 dark:text-gray-400'>
        {t('evaluation.qualityDescription')}
      </p>

      <SettingsGroup label={t('evaluation.qualityTitle')}>
        {settingRows.slice(2).map((row) => (
          <SettingsRow key={row.key} label={t(row.labelKey)}>
            <ModeSelect
              value={settings[row.key]}
              onChange={(mode) => setEvaluationSetting(row.key, mode)}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>

      <SettingsGroup label={t('evaluation.qualityThresholds')}>
        <div className='space-y-3 px-4 py-3'>
          <div className='flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-500' />
            <span>{t('evaluation.thresholdRed')}</span>
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 ml-2' />
            <span>{t('evaluation.thresholdYellow')}</span>
            <span className='inline-block w-2.5 h-2.5 rounded-full bg-green-500 ml-2' />
            <span>{t('evaluation.thresholdGreen')}</span>
          </div>
          {qualityAxisKeys.map((axis) => (
            <div key={axis} className='space-y-1'>
              <ThresholdItemLabel
                label={t(`evaluation.axis.${axis}`)}
                description={t(`evaluation.axisDescription.${axis}`)}
              />
              <QualityThresholdSlider
                threshold={qualityThresholds[axis]}
                onChange={(th) => setQualityThreshold(axis, th)}
                redLabel={t('evaluation.thresholdRed')}
                greenLabel={t('evaluation.thresholdGreen')}
                onResetRed={() =>
                  setQualityThreshold(axis, {
                    ...qualityThresholds[axis],
                    red: defaultQualityThresholds[axis].red,
                  })}
                showResetRed={
                  qualityThresholds[axis].red !== defaultQualityThresholds[axis].red
                }
                onResetGreen={() =>
                  setQualityThreshold(axis, {
                    ...qualityThresholds[axis],
                    green: defaultQualityThresholds[axis].green,
                  })}
                showResetGreen={
                  qualityThresholds[axis].green !== defaultQualityThresholds[axis].green
                }
              />
            </div>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
};

export default EvaluationSettings;
