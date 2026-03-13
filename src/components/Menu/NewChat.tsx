import React from 'react';
import { useTranslation } from 'react-i18next';
import PlusIcon from '@icon/PlusIcon';

import useAddChat from '@hooks/useAddChat';

const NewChat = ({ folder }: { folder?: string }) => {
  const { t } = useTranslation();
  const addChat = useAddChat();

  return (
    <a
      className={`flex flex-1 cursor-pointer items-center rounded-md text-sm text-gray-700 opacity-100 transition-all duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10 ${
        folder ? 'justify-start' : 'mb-2 gap-3 border border-gray-200 px-2 py-2 dark:border-white/20'
      }`}
      onClick={() => {
        addChat(folder);
      }}
      title={folder ? String(t('newChat')) : ''}
    >
      {folder ? (
        <div className='max-h-0 parent-sibling-hover:max-h-10 hover:max-h-10 parent-sibling-hover:py-2 hover:py-2 flex items-center gap-3 overflow-hidden px-2 text-sm text-gray-600 transition-all duration-200 delay-500 dark:text-gray-100'>
          <PlusIcon /> {t('newChat')}
        </div>
      ) : (
        <>
          <PlusIcon />
          <span className='inline-flex text-sm text-gray-700 dark:text-white'>{t('newChat')}</span>
        </>
      )}
    </a>
  );
};

export default NewChat;
