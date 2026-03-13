import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ExportIcon from '@icon/ExportIcon';
import PopupModal from '@components/PopupModal';

import ImportChat from './ImportChat';
import ExportChat from './ExportChat';

const ImportExportChat = () => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  return (
    <>
      <a
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        <ExportIcon className='w-4 h-4' />
        {t('import')} / {t('export')}
      </a>
      {isModalOpen && (
        <PopupModal
          title={`${t('import')} / ${t('export')}`}
          setIsModalOpen={setIsModalOpen}
          cancelButton={false}
        >
          <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
            <ImportChat />
            <ExportChat />
            <div className='border-t my-3 border-gray-200 dark:border-gray-600' />
            {/* <ImportChatOpenAI setIsModalOpen={setIsModalOpen} /> */}
          </div>
        </PopupModal>
      )}
    </>
  );
};

export default ImportExportChat;
