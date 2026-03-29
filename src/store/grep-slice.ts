import { StoreSlice } from './store';
import { SearchResult, searchBranchNodes } from '@utils/branchSearch';
import { buildPathToLeaf } from '@utils/branchUtils';
import { ContentStoreData } from '@utils/contentStore';
import { ChatInterface, isTextContent } from '@type/chat';

export interface GrepResult {
  chatIndex: number;
  chatTitle: string;
  matches: SearchResult[];
}

export interface GrepSlice {
  grepQuery: string;
  grepResults: GrepResult[];
  isGrepMode: boolean;
  isGrepSearching: boolean;
  sidebarSearchHistory: string[];
  chatFindHistory: string[];

  setGrepQuery: (q: string) => void;
  executeGrep: () => void;
  setGrepMode: (on: boolean) => void;
  navigateToGrepResult: (chatIndex: number, nodeId?: string) => void;
  saveSidebarSearchHistory: (query?: string) => void;
  clearSidebarSearchHistory: () => void;
  saveChatFindHistory: (query: string) => void;
  clearChatFindHistory: () => void;
}

/**
 * Fallback search for legacy chats without branchTree.
 * Searches message text content directly.
 */
function searchLegacyChat(
  chat: ChatInterface,
  chatIndex: number,
  query: string
): SearchResult[] {
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (let i = 0; i < chat.messages.length; i++) {
    const msg = chat.messages[i];
    const textParts = msg.content
      .filter(isTextContent)
      .map((c) => c.text);
    const fullText = textParts.join(' ');
    const lowerText = fullText.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx < 0) continue;

    const start = Math.max(0, idx - 40);
    const end = Math.min(fullText.length, idx + query.length + 40);
    let snippet = '';
    if (start > 0) snippet += '...';
    snippet += fullText.slice(start, end);
    if (end < fullText.length) snippet += '...';

    results.push({
      nodeId: `legacy-${i}`,
      chatIndex,
      snippet,
      isOnActivePath: true,
      matchType: 'content',
    });
  }

  return results;
}

export const createGrepSlice: StoreSlice<GrepSlice> = (set, get) => ({
  grepQuery: '',
  grepResults: [],
  isGrepMode: false,
  isGrepSearching: false,
  sidebarSearchHistory: [],
  chatFindHistory: [],

  setGrepQuery: (q) => {
    set({ grepQuery: q });
  },

  executeGrep: () => {
    const query = get().grepQuery.trim();
    if (!query) {
      set({ grepResults: [], isGrepSearching: false });
      return;
    }

    set({ isGrepSearching: true });

    const chats = get().chats;
    if (!chats) {
      set({ grepResults: [], isGrepSearching: false });
      return;
    }

    const contentStore = get().contentStore as ContentStoreData;
    const results: GrepResult[] = [];

    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];

      let matches: SearchResult[];

      if (chat.branchTree) {
        matches = searchBranchNodes(
          query,
          [{ tree: chat.branchTree, chatIndex: i }],
          contentStore,
          'all'
        );
      } else {
        matches = searchLegacyChat(chat, i, query);
      }

      if (matches.length > 0) {
        results.push({
          chatIndex: i,
          chatTitle: chat.title,
          matches,
        });
      }
    }

    set({ grepResults: results, isGrepSearching: false });
  },

  setGrepMode: (on) => {
    if (!on) {
      set({ isGrepMode: false, grepQuery: '', grepResults: [], isGrepSearching: false });
    } else {
      set({ isGrepMode: true });
    }
  },

  saveSidebarSearchHistory: (query) => {
    const normalized = (query ?? get().grepQuery).trim();
    if (!normalized) return;
    const nextHistory = [
      normalized,
      ...get().sidebarSearchHistory.filter((entry) => entry !== normalized),
    ].slice(0, 20);
    set({ sidebarSearchHistory: nextHistory });
  },

  clearSidebarSearchHistory: () => {
    set({ sidebarSearchHistory: [] });
  },

  saveChatFindHistory: (query) => {
    const normalized = query.trim();
    if (!normalized) return;
    const nextHistory = [
      normalized,
      ...get().chatFindHistory.filter((entry) => entry !== normalized),
    ].slice(0, 20);
    set({ chatFindHistory: nextHistory });
  },

  clearChatFindHistory: () => {
    set({ chatFindHistory: [] });
  },

  navigateToGrepResult: (chatIndex, nodeId) => {
    const query = get().grepQuery;

    // Switch to the target chat
    get().setCurrentChatIndex(chatIndex);

    if (nodeId && !nodeId.startsWith('legacy-')) {
      // Navigate branch tree to show the matched node
      const chats = get().chats;
      const chat = chats?.[chatIndex];
      if (chat?.branchTree) {
        const newPath = buildPathToLeaf(chat.branchTree, nodeId);
        const switchPath = get().switchActivePathSilent;
        if (switchPath) {
          switchPath(chatIndex, newPath);
        }
        get().setBranchEditorFocusNodeId(nodeId);
      }
    }

    // Highlight is triggered by GrepResults component after calling this
  },

});
