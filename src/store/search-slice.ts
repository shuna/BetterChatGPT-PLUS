import { StoreSlice } from './store';
import { SearchResult } from '@utils/branchSearch';
import { buildPathToLeaf } from '@utils/branchUtils';

export interface SearchSlice {
  searchQuery: string;
  searchScope: 'all' | 'activePath';
  searchResults: SearchResult[];
  currentResultIndex: number;
  isSearchOpen: boolean;
  matchedNodeIds: Set<string>;
  currentResultNodeId: string | null;

  setSearchQuery: (q: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  toggleSearchScope: () => void;
  nextResult: () => void;
  prevResult: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export const createSearchSlice: StoreSlice<SearchSlice> = (set, get) => ({
  searchQuery: '',
  searchScope: 'all',
  searchResults: [],
  currentResultIndex: -1,
  isSearchOpen: false,
  matchedNodeIds: new Set(),
  currentResultNodeId: null,

  setSearchQuery: (q) => {
    set({ searchQuery: q });
  },

  setSearchResults: (results) => {
    const matchedNodeIds = new Set(results.map((r) => r.nodeId));
    const currentResultIndex = results.length > 0 ? 0 : -1;
    const currentResultNodeId =
      currentResultIndex >= 0 ? results[currentResultIndex].nodeId : null;

    set({ searchResults: results, matchedNodeIds, currentResultIndex, currentResultNodeId });

    if (currentResultNodeId) {
      get().setBranchEditorFocusNodeId(currentResultNodeId);
      navigateToResult(get, results[0]);
    }
  },

  toggleSearchScope: () => {
    set({ searchScope: get().searchScope === 'all' ? 'activePath' : 'all' });
  },

  nextResult: () => {
    const { searchResults, currentResultIndex } = get();
    if (searchResults.length === 0) return;
    const next = (currentResultIndex + 1) % searchResults.length;
    const result = searchResults[next];
    set({ currentResultIndex: next, currentResultNodeId: result.nodeId });
    get().setBranchEditorFocusNodeId(result.nodeId);
    navigateToResult(get, result);
  },

  prevResult: () => {
    const { searchResults, currentResultIndex } = get();
    if (searchResults.length === 0) return;
    const prev = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    const result = searchResults[prev];
    set({ currentResultIndex: prev, currentResultNodeId: result.nodeId });
    get().setBranchEditorFocusNodeId(result.nodeId);
    navigateToResult(get, result);
  },

  openSearch: () => {
    set({ isSearchOpen: true });
  },

  closeSearch: () => {
    set({
      isSearchOpen: false,
      searchQuery: '',
      searchResults: [],
      currentResultIndex: -1,
      matchedNodeIds: new Set(),
      currentResultNodeId: null,
    });
  },
});

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
