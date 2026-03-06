import React from 'react';
import { useTranslation } from 'react-i18next';
import BranchIcon from '@icon/BranchIcon';

export type ChatView = 'chat' | 'branch-editor';

const ChatViewTabs = ({
  activeView,
  setActiveView,
}: {
  activeView: ChatView;
  setActiveView: (view: ChatView) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className='flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10'>
      <button
        className={`px-4 py-2 text-sm font-medium transition-colors ${
          activeView === 'chat'
            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        onClick={() => setActiveView('chat')}
      >
        {t('chat')}
      </button>
      <button
        className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
          activeView === 'branch-editor'
            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        onClick={() => setActiveView('branch-editor')}
      >
        <BranchIcon className='w-3.5 h-3.5' />
        {t('branchEditor')}
      </button>
    </div>
  );
};

export default ChatViewTabs;
