import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';
import useStore from '@store/store';

const ChatSearch = ({
  filter,
  setFilter,
}: {
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
}) => {
  const { t } = useTranslation();
  const isGrepMode = useStore((state) => state.isGrepMode);
  const setGrepMode = useStore((state) => state.setGrepMode);
  const setGrepQuery = useStore((state) => state.setGrepQuery);
  const executeGrep = useStore((state) => state.executeGrep);

  const [_filter, _setFilter] = useState<string>(filter);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    _setFilter(e.target.value);
  };

  const debouncedUpdateFilter = useRef(
    debounce((f: string) => {
      if (useStore.getState().isGrepMode) {
        setGrepQuery(f);
        executeGrep();
      } else {
        setFilter(f);
      }
    }, 500)
  ).current;

  useEffect(() => {
    debouncedUpdateFilter(_filter);
  }, [_filter]);

  const toggleMode = () => {
    _setFilter('');
    if (isGrepMode) {
      setGrepMode(false);
      setFilter('');
    } else {
      setGrepMode(true);
    }
  };

  return (
    <div className='relative flex items-center gap-1 px-2 py-1'>
      <input
        type='text'
        className='m-0 h-8 flex-1 rounded border border-gray-300 bg-transparent px-3 py-1 text-base text-gray-800 transition-opacity focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-white/20 dark:text-white dark:focus:ring-gray-600'
        placeholder={isGrepMode ? (t('searchContent') as string) : (t('search') as string)}
        value={_filter}
        onChange={handleChange}
      />
      <button
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border text-xs transition-colors ${
          isGrepMode
            ? 'border-blue-500 bg-blue-500/20 text-blue-400'
            : 'border-gray-300 text-gray-500 hover:text-gray-700 dark:border-white/20 dark:text-gray-400 dark:hover:text-white'
        }`}
        onClick={toggleMode}
        title={isGrepMode ? (t('titleSearch') as string) : (t('contentSearch') as string)}
      >
        {isGrepMode ? (
          <svg stroke='currentColor' fill='none' strokeWidth='2' viewBox='0 0 24 24' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
            <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
            <polyline points='14 2 14 8 20 8' />
            <line x1='16' y1='13' x2='8' y2='13' />
            <line x1='16' y1='17' x2='8' y2='17' />
            <polyline points='10 9 9 9 8 9' />
          </svg>
        ) : (
          <svg stroke='currentColor' fill='none' strokeWidth='2' viewBox='0 0 24 24' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
            <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
            <polyline points='14 2 14 8 20 8' />
            <circle cx='11.5' cy='14.5' r='2.5' />
            <line x1='13.3' y1='16.3' x2='15' y2='18' />
          </svg>
        )}
      </button>
    </div>
  );
};

export default ChatSearch;
