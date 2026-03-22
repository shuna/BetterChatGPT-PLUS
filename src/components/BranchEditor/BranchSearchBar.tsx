import React, { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@store/store';
import { searchBranchNodes } from '@utils/branchSearch';
import { MultiLayoutEntry } from './useBranchEditorLayout';

const BranchSearchBar = ({ entries }: { entries: MultiLayoutEntry[] }) => {
  const searchQuery = useStore((s) => s.searchQuery);
  const searchHistory = useStore((s) => s.searchHistory);
  const searchScope = useStore((s) => s.searchScope);
  const searchResults = useStore((s) => s.searchResults);
  const currentResultIndex = useStore((s) => s.currentResultIndex);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const saveSearchQueryToHistory = useStore((s) => s.saveSearchQueryToHistory);
  const clearSearchHistory = useStore((s) => s.clearSearchHistory);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const toggleSearchScope = useStore((s) => s.toggleSearchScope);
  const nextResult = useStore((s) => s.nextResult);
  const prevResult = useStore((s) => s.prevResult);
  const closeSearch = useStore((s) => s.closeSearch);
  const contentStore = useStore((s) => s.contentStore);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const hasSearchQuery = searchQuery.trim().length > 0;
  const [historyContentOffset, setHistoryContentOffset] = useState(0);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Run search on query/scope change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const results = searchBranchNodes(searchQuery, entries, contentStore, searchScope);
      setSearchResults(results);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, searchScope, entries, contentStore, setSearchResults]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsHistoryOpen(false);
        closeSearch();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setIsHistoryOpen(false);
        saveSearchQueryToHistory();
        if (e.shiftKey) prevResult();
        else nextResult();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsHistoryOpen(false);
        nextResult();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsHistoryOpen(false);
        prevResult();
      }
    },
    [closeSearch, nextResult, prevResult, saveSearchQueryToHistory]
  );

  const handleInputBlur = useCallback(() => {
    window.setTimeout(() => {
      if (document.activeElement !== inputRef.current) {
        setIsHistoryOpen(false);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const updateHistoryOffset = () => {
      if (!containerRef.current || !inputAreaRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const inputAreaRect = inputAreaRef.current.getBoundingClientRect();
      setHistoryContentOffset(inputAreaRect.left - containerRect.left);
    };

    updateHistoryOffset();
    window.addEventListener('resize', updateHistoryOffset);
    return () => window.removeEventListener('resize', updateHistoryOffset);
  }, []);

  return (
    <div
      ref={containerRef}
      className='react-flow__panel !bg-white dark:!bg-gray-800 !border !border-gray-300 dark:!border-gray-600 !rounded-lg !shadow-lg flex w-[22rem] items-center gap-1 px-2 py-1.5'
      style={{ position: 'absolute', right: 0, top: 4 }}
    >
      {/* Scope toggle */}
      <button
        onClick={toggleSearchScope}
        className='text-[10px] px-1.5 py-0.5 mr-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap'
        title={searchScope === 'all' ? '全ノード検索中' : 'アクティブパスのみ'}
      >
        {searchScope === 'all' ? '全体' : 'パス'}
      </button>

      <div className='relative flex min-w-0 flex-1 items-center gap-1'>
        <div ref={inputAreaRef} className='relative min-w-0 flex-1'>
          <input
            ref={inputRef}
            type='text'
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsHistoryOpen(true);
            }}
            onFocus={() => setIsHistoryOpen(true)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder='検索...'
            className={`w-full text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 ${
              hasSearchQuery ? 'pr-6' : ''
            }`}
          />
          {hasSearchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsHistoryOpen(false);
                inputRef.current?.focus();
              }}
              className='absolute right-0 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              title='検索文字列をクリア'
            >
              <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
                <path d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          ) : null}
        </div>

        {hasSearchQuery ? (
          <>
            <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[3rem] text-center'>
              {searchResults.length > 0 ? `${currentResultIndex + 1}/${searchResults.length}` : '0件'}
            </span>

            <button
              onClick={prevResult}
              disabled={searchResults.length === 0}
              className='p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
              title='前の結果'
            >
              <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
                <path d='M5 15l7-7 7 7' />
              </svg>
            </button>
            <button
              onClick={nextResult}
              disabled={searchResults.length === 0}
              className='p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
              title='次の結果'
            >
              <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
                <path d='M19 9l-7 7-7-7' />
              </svg>
            </button>
          </>
        ) : null}

      </div>

      {isHistoryOpen && searchHistory.length > 0 ? (
        <div className='absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800'>
          <div className='max-h-64 overflow-y-auto py-1' style={{ paddingLeft: historyContentOffset }}>
            {searchHistory.map((entry) => (
              <button
                key={entry}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSearchQuery(entry);
                  setIsHistoryOpen(false);
                  inputRef.current?.focus();
                }}
                className='block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                title={entry}
              >
                {entry}
              </button>
            ))}
            <div className='my-1 border-t border-gray-200 dark:border-gray-700' />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                clearSearchHistory();
                setIsHistoryOpen(false);
                inputRef.current?.focus();
              }}
              className='block w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            >
              履歴をクリア
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
};

export default BranchSearchBar;
