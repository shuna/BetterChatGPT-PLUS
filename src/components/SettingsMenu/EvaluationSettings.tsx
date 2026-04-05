import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { SettingsGroup, SettingsRow } from './SettingsMenu';
import type { EvaluationSettings as EvaluationSettingsType, EvaluationTriggerMode, QualityScores, QualityAxisThreshold } from '@type/evaluation';
import { qualityAxisKeys } from '@type/evaluation';

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

const DualThresholdSlider = ({
  threshold,
  onChange,
}: {
  threshold: QualityAxisThreshold;
  onChange: (t: QualityAxisThreshold) => void;
}) => {
  const redPct = Math.round(threshold.red * 100);
  const greenPct = Math.round(threshold.green * 100);

  const trackBackground = `linear-gradient(to right, rgb(239,68,68) 0%, rgb(239,68,68) ${redPct}%, rgb(234,179,8) ${redPct}%, rgb(234,179,8) ${greenPct}%, rgb(34,197,94) ${greenPct}%, rgb(34,197,94) 100%)`;

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
      {/* Red text input */}
      <input
        type='number'
        min={0}
        max={100}
        value={redPct}
        onChange={(e) => handleRedInput(e.target.value)}
        className='w-12 rounded border border-gray-300 px-1 py-0.5 text-xs text-center dark:border-gray-600 dark:bg-gray-700 dark:text-white'
        title='Red threshold'
      />

      {/* Slider track */}
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
          className='absolute inset-x-0 w-full h-2 appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer'
          style={{ zIndex: 2 }}
        />
        {/* Green thumb */}
        <input
          type='range'
          min={0}
          max={100}
          value={greenPct}
          onChange={(e) => handleGreenChange(parseInt(e.target.value, 10))}
          className='absolute inset-x-0 w-full h-2 appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer'
          style={{ zIndex: 3 }}
        />
      </div>

      {/* Green text input */}
      <input
        type='number'
        min={0}
        max={100}
        value={greenPct}
        onChange={(e) => handleGreenInput(e.target.value)}
        className='w-12 rounded border border-gray-300 px-1 py-0.5 text-xs text-center dark:border-gray-600 dark:bg-gray-700 dark:text-white'
        title='Green threshold'
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main settings component
// ---------------------------------------------------------------------------

const EvaluationSettings = () => {
  const { t } = useTranslation('main');
  const settings = useStore((state) => state.evaluationSettings);
  const setEvaluationSetting = useStore((state) => state.setEvaluationSetting);
  const qualityThresholds = useStore((state) => state.qualityThresholds);
  const setQualityThreshold = useStore((state) => state.setQualityThreshold);

  const settingRows: {
    key: keyof EvaluationSettingsType;
    labelKey: string;
  }[] = [
    { key: 'safetyPreSend', labelKey: 'evaluation.safetyPreSend' },
    { key: 'safetyPostReceive', labelKey: 'evaluation.safetyPostReceive' },
    { key: 'qualityPreSend', labelKey: 'evaluation.qualityPreSend' },
    { key: 'qualityPostReceive', labelKey: 'evaluation.qualityPostReceive' },
  ];

  return (
    <div className='flex flex-col gap-5'>
      <SettingsGroup label={t('evaluation.safetyTitle')}>
        {settingRows.slice(0, 2).map((row) => (
          <SettingsRow key={row.key} label={t(row.labelKey)}>
            <ModeSelect
              value={settings[row.key]}
              onChange={(mode) => setEvaluationSetting(row.key, mode)}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>

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
        <div className='space-y-3'>
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
              <div className='text-sm text-gray-700 dark:text-gray-300'>
                {t(`evaluation.axis.${axis}`)}
              </div>
              <DualThresholdSlider
                threshold={qualityThresholds[axis]}
                onChange={(th) => setQualityThreshold(axis, th)}
              />
            </div>
          ))}
        </div>
      </SettingsGroup>

      <p className='text-xs text-gray-500 dark:text-gray-400'>
        {t('evaluation.description')}
      </p>
    </div>
  );
};

export default EvaluationSettings;
