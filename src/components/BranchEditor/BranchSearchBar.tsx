import React, { useCallback, useEffect, useRef } from 'react';
import useStore from '@store/store';
import { searchBranchNodes } from '@utils/branchSearch';
import { MultiLayoutEntry } from './useBranchEditorLayout';

const BranchSearchBar = ({ entries }: { entries: MultiLayoutEntry[] }) => {
  const searchQuery = useStore((s) => s.searchQuery);
  const searchScope = useStore((s) => s.searchScope);
  const searchResults = useStore((s) => s.searchResults);
  const currentResultIndex = useStore((s) => s.currentResultIndex);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const toggleSearchScope = useStore((s) => s.toggleSearchScope);
  const nextResult = useStore((s) => s.nextResult);
  const prevResult = useStore((s) => s.prevResult);
  const closeSearch = useStore((s) => s.closeSearch);
  const contentStore = useStore((s) => s.contentStore);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
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
        closeSearch();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) prevResult();
        else nextResult();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextResult();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevResult();
      }
    },
    [closeSearch, nextResult, prevResult]
  );

  return (
    <div className='absolute top-2 right-2 z-20 flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg px-2 py-1.5'>
      <input
        ref={inputRef}
        type='text'
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='検索...'
        className='w-48 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400'
      />

      {/* Scope toggle */}
      <button
        onClick={toggleSearchScope}
        className='text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap'
        title={searchScope === 'all' ? '全ノード検索中' : 'アクティブパスのみ'}
      >
        {searchScope === 'all' ? '全体' : 'パス'}
      </button>

      {/* Result count */}
      <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[3rem] text-center'>
        {searchResults.length > 0
          ? `${currentResultIndex + 1}/${searchResults.length}`
          : searchQuery.trim()
            ? '0件'
            : ''}
      </span>

      {/* Nav buttons */}
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

      {/* Close */}
      <button
        onClick={closeSearch}
        className='p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
        title='閉じる (Esc)'
      >
        <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
          <path d='M6 18L18 6M6 6l12 12' />
        </svg>
      </button>
    </div>
  );
};

export default BranchSearchBar;
