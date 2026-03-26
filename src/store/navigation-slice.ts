import { v4 as uuidv4 } from 'uuid';
import { StoreSlice } from './store';
import { ChatView } from '@type/chat';
import { buildPathToLeaf } from '@utils/branchUtils';

export interface NavEntry {
  key: string;
  chatId: string;
  activePath: string[];
  focusedNodeId?: string;
  viewContext?: ChatView;
  source: 'init' | 'branch-switch' | 'search' | 'grep' | 'branch-editor';
}

export interface NavigationSlice {
  navHistoryPast: NavEntry[];
  navHistoryCurrent: NavEntry | null;
  navHistoryFuture: NavEntry[];
  navEntryMap: Map<string, NavEntry>;

  pushNavigationEntry: (entry: Omit<NavEntry, 'key'>) => void;
  restoreNavigationEntry: (entry: NavEntry) => void;
  navBack: () => void;
  navForward: () => void;
  canNavBack: () => boolean;
  canNavForward: () => boolean;
  initNavigationEntry: () => void;
}

const MAX_HISTORY = 100;

function resolveChatIndex(
  chats: Array<{ id: string }> | null | undefined,
  chatId: string
): number {
  if (!chats) return -1;
  return chats.findIndex((c) => c.id === chatId);
}

export const createNavigationSlice: StoreSlice<NavigationSlice> = (
  set,
  get
) => ({
  navHistoryPast: [],
  navHistoryCurrent: null,
  navHistoryFuture: [],
  navEntryMap: new Map(),

  initNavigationEntry: () => {
    if (get().navHistoryCurrent) return;

    const chats = get().chats;
    const chatIndex = get().currentChatIndex;
    if (!chats || chatIndex < 0 || chatIndex >= chats.length) return;

    const chat = chats[chatIndex];
    const entry: NavEntry = {
      key: uuidv4(),
      chatId: chat.id,
      activePath: chat.branchTree
        ? [...(chats[chatIndex] as any).branchTree?.activePath ?? []]
        : [],
      viewContext: get().chatActiveView,
      source: 'init',
    };

    // Get the actual activePath from the materialized state
    if (chat.branchTree?.activePath) {
      entry.activePath = [...chat.branchTree.activePath];
    }

    const map = new Map(get().navEntryMap);
    map.set(entry.key, entry);
    set({ navHistoryCurrent: entry, navEntryMap: map });
  },

  pushNavigationEntry: (partial) => {
    const key = uuidv4();
    const entry: NavEntry = { ...partial, key };
    const current = get().navHistoryCurrent;
    const past = [...get().navHistoryPast];

    if (current) {
      past.push(current);
      if (past.length > MAX_HISTORY) past.shift();
    }

    const map = new Map(get().navEntryMap);
    map.set(key, entry);

    set({
      navHistoryPast: past,
      navHistoryCurrent: entry,
      navHistoryFuture: [],
      navEntryMap: map,
    });
  },

  restoreNavigationEntry: (entry) => {
    const chats = get().chats;
    const idx = resolveChatIndex(chats, entry.chatId);
    if (idx < 0) return false as any; // chatId not found

    // Switch chat if needed
    if (get().currentChatIndex !== idx) {
      get().setCurrentChatIndex(idx);
    }

    // Restore activePath
    if (entry.activePath.length > 0) {
      const chat = chats![idx];
      if (chat.branchTree) {
        // Verify the path is still valid by checking first node exists
        const firstNode = entry.activePath[0];
        if (chat.branchTree.nodes[firstNode]) {
          get().switchActivePathSilent(idx, entry.activePath);
        }
        // else: path invalid, keep current activePath
      }
    }

    // Restore view context
    if (entry.viewContext && get().chatActiveView !== entry.viewContext) {
      get().setChatActiveView(entry.viewContext);
    }

    // Restore focus node (transient)
    if (entry.focusedNodeId) {
      get().setBranchEditorFocusNodeId(entry.focusedNodeId);
    }
  },

  navBack: () => {
    const past = get().navHistoryPast;
    const current = get().navHistoryCurrent;
    if (past.length === 0 || !current) return;

    const newPast = [...past];
    let target = newPast.pop()!;

    // Skip entries whose chat no longer exists
    while (
      target &&
      resolveChatIndex(get().chats, target.chatId) < 0 &&
      newPast.length > 0
    ) {
      target = newPast.pop()!;
    }
    if (resolveChatIndex(get().chats, target.chatId) < 0) return;

    const future = [current, ...get().navHistoryFuture];

    set({
      navHistoryPast: newPast,
      navHistoryCurrent: target,
      navHistoryFuture: future,
    });

    get().restoreNavigationEntry(target);
  },

  navForward: () => {
    const future = get().navHistoryFuture;
    const current = get().navHistoryCurrent;
    if (future.length === 0 || !current) return;

    const newFuture = [...future];
    let target = newFuture.shift()!;

    while (
      target &&
      resolveChatIndex(get().chats, target.chatId) < 0 &&
      newFuture.length > 0
    ) {
      target = newFuture.shift()!;
    }
    if (resolveChatIndex(get().chats, target.chatId) < 0) return;

    const past = [...get().navHistoryPast, current];

    set({
      navHistoryPast: past,
      navHistoryCurrent: target,
      navHistoryFuture: newFuture,
    });

    get().restoreNavigationEntry(target);
  },

  canNavBack: () => get().navHistoryPast.length > 0,
  canNavForward: () => get().navHistoryFuture.length > 0,
});
