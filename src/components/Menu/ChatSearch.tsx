import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';
import useStore from '@store/store';

const ChatSearch = ({
  filter,
  setFilter,
  onSearchFocusChange,
  externalQuery,
}: {
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  onSearchFocusChange?: (focused: boolean) => void;
  externalQuery?: string | null;
}) => {
  const { t } = useTranslation();
  const isGrepMode = useStore((state) => state.isGrepMode);
  const setGrepMode = useStore((state) => state.setGrepMode);
  const setGrepQuery = useStore((state) => state.setGrepQuery);
  const executeGrep = useStore((state) => state.executeGrep);
  const saveSidebarSearchHistory = useStore((state) => state.saveSidebarSearchHistory);

  const [localQuery, setLocalQuery] = useState<string>(filter);
  const [isFocused, setIsFocused] = useState(false);

  // Sync from external query (e.g. history selection)
  useEffect(() => {
    if (externalQuery != null) {
      setLocalQuery(externalQuery);
    }
  }, [externalQuery]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasQuery = localQuery.trim().length > 0;

  const debouncedExecute = useRef(
    debounce((q: string, grepMode: boolean) => {
      if (grepMode) {
        setGrepQuery(q);
        executeGrep();
      } else {
        setFilter(q);
      }
    }, 300)
  ).current;

  useEffect(() => {
    debouncedExecute(localQuery, isGrepMode);
  }, [localQuery, isGrepMode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalQuery(e.target.value);
  };

  const handleClear = () => {
    setLocalQuery('');
    setFilter('');
    setGrepQuery('');
    inputRef.current?.focus();
  };

  const switchScope = (toGrep: boolean) => {
    if (toGrep === isGrepMode) return;
    if (toGrep) {
      setGrepMode(true);
      // Keep existing query text, re-execute as grep
      if (localQuery.trim()) {
        setGrepQuery(localQuery);
        executeGrep();
      }
      setFilter(''); // Clear title filter
    } else {
      setGrepMode(false);
      // Keep existing query text, re-execute as title filter
      setFilter(localQuery);
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (hasQuery) {
          // Save to history before clearing
          saveSidebarSearchHistory(localQuery);
          handleClear();
        } else {
          inputRef.current?.blur();
        }
      } else if (e.key === 'Enter' && hasQuery) {
        saveSidebarSearchHistory(localQuery);
      }
    },
    [hasQuery, localQuery, saveSidebarSearchHistory]
  );

  return (
    <div ref={containerRef} className='relative flex items-center gap-1 py-1'>
      {/* Scope toggle: タイトル / 全文 */}
      <div className='flex shrink-0 overflow-hidden rounded border border-gray-300 dark:border-white/20'>
        <button
          onClick={() => switchScope(false)}
          className={`px-1.5 py-1 text-[10px] leading-none transition-colors ${
            !isGrepMode
              ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-white'
              : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
          }`}
          title={t('titleSearch') as string}
        >
          {t('titleSearchShort') || 'タイトル'}
        </button>
        <button
          onClick={() => switchScope(true)}
          className={`px-1.5 py-1 text-[10px] leading-none transition-colors ${
            isGrepMode
              ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-white'
              : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
          }`}
          title={t('contentSearch') as string}
        >
          {t('contentSearchShort') || '全文'}
        </button>
      </div>

      {/* Search input */}
      <div className='relative min-w-0 flex-1'>
        <input
          ref={inputRef}
          type='text'
          className={`m-0 h-8 w-full rounded border border-gray-300 bg-transparent px-3 py-1 text-base text-gray-800 transition-opacity focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-white/20 dark:text-white dark:focus:ring-gray-600 ${
            hasQuery ? 'pr-7' : ''
          }`}
          placeholder={t('search') as string}
          value={localQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            onSearchFocusChange?.(true);
          }}
          onBlur={() => {
            // Delay to allow click events on history items
            setTimeout(() => {
              setIsFocused(false);
              onSearchFocusChange?.(false);
            }, 150);
          }}
        />
        {hasQuery && (
          <button
            onClick={handleClear}
            className='absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            title={t('clearSearch') as string}
          >
            <svg className='h-3.5 w-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
              <path d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatSearch;
