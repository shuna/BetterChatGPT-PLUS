import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

const SidebarSearchHistory = ({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) => {
  const { t } = useTranslation();
  const sidebarSearchHistory = useStore((state) => state.sidebarSearchHistory);
  const clearSidebarSearchHistory = useStore((state) => state.clearSidebarSearchHistory);

  if (sidebarSearchHistory.length === 0) return null;

  return (
    <div className='flex flex-col py-1'>
      <div className='px-3 py-1 text-[10px] text-gray-400'>
        {t('recentSearches') || '最近の検索'}
      </div>
      {sidebarSearchHistory.map((entry) => (
        <button
          key={entry}
          className='flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-200/50 dark:text-gray-400 dark:hover:bg-gray-700/50'
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(entry)}
          title={entry}
        >
          <svg className='h-3 w-3 shrink-0 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
            <circle cx='12' cy='12' r='10' />
            <polyline points='12 6 12 12 16 14' />
          </svg>
          <span className='truncate'>{entry}</span>
        </button>
      ))}
      <button
        className='px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
        onMouseDown={(e) => e.preventDefault()}
        onClick={clearSidebarSearchHistory}
      >
        {t('clearHistory') || '履歴をクリア'}
      </button>
    </div>
  );
};

export default SidebarSearchHistory;
