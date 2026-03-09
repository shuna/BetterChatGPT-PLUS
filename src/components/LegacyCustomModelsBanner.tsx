import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

const LegacyCustomModelsBanner = () => {
  const { t } = useTranslation('model');
  const legacyModels = useStore((s) => s._legacyCustomModels);
  const clearLegacy = useStore((s) => s.clearLegacyCustomModels);

  const modelNames = useMemo(() => {
    if (!legacyModels) return '';
    return legacyModels
      .map((m: unknown) => {
        const obj = m as Record<string, unknown>;
        return (obj.name as string) || (obj.id as string) || '?';
      })
      .join(', ');
  }, [legacyModels]);

  if (!legacyModels || legacyModels.length === 0) return null;

  return (
    <div className='fixed top-0 left-0 right-0 z-[998] bg-amber-500 text-black px-4 py-3 flex items-center justify-between gap-4 shadow-md'>
      <div className='flex-1 text-sm'>
        <strong>{t('legacy.title', '旧カスタムモデルが見つかりました')}</strong>{' '}
        {t('legacy.message', '以下のモデルをAIプロバイダ設定のCustomタブで適切なプロバイダに再登録してください: {{models}}', { models: modelNames })}
      </div>
      <button
        onClick={clearLegacy}
        className='px-3 py-1 text-sm bg-amber-700 text-white rounded hover:bg-amber-800 whitespace-nowrap'
      >
        {t('legacy.dismiss', '了解')}
      </button>
    </div>
  );
};

export default LegacyCustomModelsBanner;
