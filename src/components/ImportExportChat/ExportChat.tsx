import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';

import downloadFile from '@utils/downloadFile';
import { getToday } from '@utils/date';

import { ChatInterface } from '@type/chat';
import { ExportV1, ExportV2 } from '@type/export';

const ExportChat = () => {
  const { t } = useTranslation();
  const [v1Compat, setV1Compat] = useState(false);

  const handleExport = () => {
    const chats = useStore.getState().chats;
    const folders = useStore.getState().folders;

    if (v1Compat) {
      // Strip branchTree for backward compatibility
      const v1Chats = chats?.map((chat) => {
        const { branchTree, ...rest } = chat;
        return rest as ChatInterface;
      });
      const fileData: ExportV1 = {
        chats: v1Chats,
        folders,
        version: 1,
      };
      downloadFile(fileData, getToday());
    } else {
      const fileData: ExportV2 = {
        chats,
        folders,
        version: 2,
      };
      downloadFile(fileData, getToday());
    }
  };

  return (
    <div className='mt-6'>
      <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('export')} (JSON)
      </div>
      <div className='flex items-center gap-3'>
        <button
          className='btn btn-small btn-primary'
          onClick={handleExport}
          aria-label={t('export') as string}
        >
          {t('export')}
        </button>
        <label className='flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'>
          <input
            type='checkbox'
            checked={v1Compat}
            onChange={(e) => setV1Compat(e.target.checked)}
            className='rounded'
          />
          v1 {t('compatible', 'compatible')}
        </label>
      </div>
    </div>
  );
};
export default ExportChat;
