import { StoreSlice } from './store';
import { SearchResult } from '@utils/branchSearch';
import { buildPathToLeaf } from '@utils/branchUtils';

export interface SearchSlice {
  searchQuery: string;
  searchHistory: string[];
  searchScope: 'all' | 'activePath';
  searchResults: SearchResult[];
  currentResultIndex: number;
  isSearchOpen: boolean;
  matchedNodeIds: Set<string>;
  currentResultNodeId: string | null;
  starredOnly: boolean;

  setSearchQuery: (q: string) => void;
  saveSearchQueryToHistory: (query?: string) => void;
  clearSearchHistory: () => void;
  setSearchResults: (results: SearchResult[]) => void;
  toggleSearchScope: () => void;
  toggleStarredOnly: () => void;
  nextResult: () => void;
  prevResult: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

export const createSearchSlice: StoreSlice<SearchSlice> = (set, get) => ({
  searchQuery: '',
  searchHistory: [],
  searchScope: 'all',
  searchResults: [],
  currentResultIndex: -1,
  isSearchOpen: true,
  matchedNodeIds: new Set(),
  currentResultNodeId: null,
  starredOnly: false,

  setSearchQuery: (q) => {
    set({ searchQuery: q });
  },

  saveSearchQueryToHistory: (query) => {
    const normalized = (query ?? get().searchQuery).trim();
    if (!normalized) return;

    const nextHistory = [
      normalized,
      ...get().searchHistory.filter((entry) => entry !== normalized),
    ].slice(0, 20);

    set({ searchHistory: nextHistory });
  },

  clearSearchHistory: () => {
    set({ searchHistory: [] });
  },

  setSearchResults: (results) => {
    const previousResultNodeId = get().currentResultNodeId;
    const matchedNodeIds = new Set(results.map((r) => r.nodeId));
    const preservedIndex = previousResultNodeId
      ? results.findIndex((result) => result.nodeId === previousResultNodeId)
      : -1;
    const currentResultIndex =
      results.length === 0
        ? -1
        : preservedIndex >= 0
          ? preservedIndex
          : 0;
    const currentResultNodeId =
      currentResultIndex >= 0 ? results[currentResultIndex].nodeId : null;
    const shouldNavigateToCurrentResult =
      currentResultNodeId !== null && currentResultNodeId !== previousResultNodeId;

    set({ searchResults: results, matchedNodeIds, currentResultIndex, currentResultNodeId });

    if (shouldNavigateToCurrentResult) {
      get().setBranchEditorFocusNodeId(currentResultNodeId);
      navigateToResult(get, results[currentResultIndex]);
    }
  },

  toggleSearchScope: () => {
    set({ searchScope: get().searchScope === 'all' ? 'activePath' : 'all' });
  },

  toggleStarredOnly: () => {
    set({ starredOnly: !get().starredOnly });
  },

  nextResult: () => {
    const { searchResults, currentResultIndex } = get();
    if (searchResults.length === 0) return;
    get().saveSearchQueryToHistory();
    const next = (currentResultIndex + 1) % searchResults.length;
    const result = searchResults[next];
    set({ currentResultIndex: next, currentResultNodeId: result.nodeId });
    get().setBranchEditorFocusNodeId(result.nodeId);
    pushSearchNavEntry(get, result);
    navigateToResult(get, result);
  },

  prevResult: () => {
    const { searchResults, currentResultIndex } = get();
    if (searchResults.length === 0) return;
    get().saveSearchQueryToHistory();
    const prev = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    const result = searchResults[prev];
    set({ currentResultIndex: prev, currentResultNodeId: result.nodeId });
    get().setBranchEditorFocusNodeId(result.nodeId);
    pushSearchNavEntry(get, result);
    navigateToResult(get, result);
  },

  openSearch: () => {
    set({ isSearchOpen: true });
  },

  closeSearch: () => {
    get().saveSearchQueryToHistory();
    set({
      isSearchOpen: false,
      searchQuery: '',
      searchResults: [],
      currentResultIndex: -1,
      matchedNodeIds: new Set(),
      currentResultNodeId: null,
      starredOnly: false,
    });
  },

  toggleSearch: () => {
    if (get().isSearchOpen) {
      get().closeSearch();
    } else {
      get().openSearch();
    }
  },
});

function pushSearchNavEntry(
  get: () => any,
  result: SearchResult
) {
  const state = get();
  if (!state.pushNavigationEntry) return;
  const chat = state.chats?.[result.chatIndex];
  if (!chat) return;

  const newPath = chat.branchTree
    ? buildPathToLeaf(chat.branchTree, result.nodeId)
    : [];

  state.pushNavigationEntry({
    chatId: chat.id,
    activePath: newPath,
    focusedNodeId: result.nodeId,
    source: 'search' as const,
  });
}

function navigateToResult(
  get: () => ReturnType<StoreSlice<SearchSlice>>,
  result: SearchResult
) {
  if (result.isOnActivePath) return;

  const state = get() as unknown as {
    chats: Array<{ branchTree?: Parameters<typeof buildPathToLeaf>[0] }> | null;
    switchActivePathSilent: (chatIndex: number, newPath: string[]) => void;
  };

  const chat = state.chats?.[result.chatIndex];
  if (!chat?.branchTree) return;

  const newPath = buildPathToLeaf(chat.branchTree, result.nodeId);
  state.switchActivePathSilent(result.chatIndex, newPath);
}
