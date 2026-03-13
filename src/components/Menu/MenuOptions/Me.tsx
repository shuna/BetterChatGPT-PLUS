import React from 'react';
import { useTranslation } from 'react-i18next';

import HeartIcon from '@icon/HeartIcon';

const Me = () => {
  const { t } = useTranslation();
  const projectUrl =
    import.meta.env.VITE_PROJECT_URL ?? 'https://github.com/shuna/weavelet-canvas';
  return (
    <a
      className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
      href={projectUrl}
      target='_blank'
    >
      <HeartIcon />
      {t('author')}
    </a>
  );
};

export default Me;
