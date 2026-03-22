import { describe, expect, it, vi } from 'vitest';

import type { BranchTree } from '@type/chat';
import type { SearchResult } from '@utils/branchSearch';
import { createSearchSlice, type SearchSlice } from './search-slice';

type SearchTestState = SearchSlice & {
  chats: Array<{ branchTree?: BranchTree }>;
  setBranchEditorFocusNodeId: ReturnType<typeof vi.fn>;
  switchActivePathSilent: ReturnType<typeof vi.fn>;
};

const createBranchTree = (): BranchTree => ({
  rootId: 'root',
  activePath: ['root', 'branch-a'],
  nodes: {
    root: {
      id: 'root',
      parentId: null,
      role: 'user',
      contentHash: 'h-root',
      createdAt: 1,
    },
    'branch-a': {
      id: 'branch-a',
      parentId: 'root',
      role: 'assistant',
      contentHash: 'h-a',
      createdAt: 2,
    },
    'branch-b': {
      id: 'branch-b',
      parentId: 'root',
      role: 'assistant',
      contentHash: 'h-b',
      createdAt: 3,
    },
  },
});

const createSearchState = () => {
  let state = {
    chats: [{ branchTree: createBranchTree() }],
    setBranchEditorFocusNodeId: vi.fn(),
    switchActivePathSilent: vi.fn(),
  } as unknown as SearchTestState;

  const setState = (partial: Partial<SearchTestState>) => {
    state = { ...state, ...partial };
  };

  const getState = () => state;

  state = {
    ...state,
    ...createSearchSlice(setState as never, getState as never),
  };

  return getState;
};

describe('search-slice', () => {
  it('stores recent search queries uniquely and caps history at 20 entries', () => {
    const getState = createSearchState();

    for (let i = 1; i <= 21; i++) {
      getState().saveSearchQueryToHistory(`query-${i}`);
    }
    getState().saveSearchQueryToHistory('query-10');

    expect(getState().searchHistory).toHaveLength(20);
    expect(getState().searchHistory[0]).toBe('query-10');
    expect(getState().searchHistory).not.toContain('query-1');
    expect(getState().searchHistory.filter((entry) => entry === 'query-10')).toHaveLength(1);
  });

  it('clears search history', () => {
    const getState = createSearchState();

    getState().saveSearchQueryToHistory('hello');
    expect(getState().searchHistory).toEqual(['hello']);

    getState().clearSearchHistory();
    expect(getState().searchHistory).toEqual([]);
  });

  it('preserves the current result when search results are recomputed', () => {
    const getState = createSearchState();
    const initialResults: SearchResult[] = [
      { nodeId: 'branch-a', chatIndex: 0, snippet: 'first', isOnActivePath: true },
      { nodeId: 'branch-b', chatIndex: 0, snippet: 'second', isOnActivePath: false },
    ];

    getState().setSearchResults(initialResults);
    getState().nextResult();
    expect(getState().currentResultNodeId).toBe('branch-b');
    expect(getState().currentResultIndex).toBe(1);

    getState().setSearchResults([
      { nodeId: 'branch-a', chatIndex: 0, snippet: 'first', isOnActivePath: false },
      { nodeId: 'branch-b', chatIndex: 0, snippet: 'second', isOnActivePath: true },
    ]);

    expect(getState().currentResultNodeId).toBe('branch-b');
    expect(getState().currentResultIndex).toBe(1);
  });

  it('cycles from the last result back to the first result', () => {
    const getState = createSearchState();

    getState().setSearchResults([
      { nodeId: 'branch-a', chatIndex: 0, snippet: 'first', isOnActivePath: true },
      { nodeId: 'branch-b', chatIndex: 0, snippet: 'second', isOnActivePath: false },
    ]);

    getState().nextResult();
    getState().nextResult();

    expect(getState().currentResultNodeId).toBe('branch-a');
    expect(getState().currentResultIndex).toBe(0);
  });
});
