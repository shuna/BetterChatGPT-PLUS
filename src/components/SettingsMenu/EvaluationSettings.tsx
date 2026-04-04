import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { SettingsGroup, SettingsRow } from './SettingsMenu';
import type { EvaluationSettings as EvaluationSettingsType, EvaluationTriggerMode } from '@type/evaluation';

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

const EvaluationSettings = () => {
  const { t } = useTranslation('main');
  const settings = useStore((state) => state.evaluationSettings);
  const setEvaluationSetting = useStore((state) => state.setEvaluationSetting);

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

      <p className='text-xs text-gray-500 dark:text-gray-400'>
        {t('evaluation.description')}
      </p>
    </div>
  );
};

export default EvaluationSettings;
