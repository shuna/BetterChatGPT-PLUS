import { StoreSlice } from './store';
import {
  BranchClipboard,
  ChatInterface,
  ContentInterface,
  Role,
} from '@type/chat';
import { ContentStoreData } from '@utils/contentStore';
import {
  appendNodeToActivePathState,
  copyBranchSequenceState,
  createBranchState,
  deleteBranchState,
  ensureBranchTreeState,
  insertMessageAtIndexState,
  moveMessageState,
  pasteBranchSequenceState,
  removeMessageAtIndexState,
  renameBranchNodeState,
  replaceMessageAndPruneFollowingState,
  switchActivePathState,
  switchBranchAtNodeState,
  truncateActivePathState,
  upsertMessageAtIndexState,
  updateLastNodeContentState,
} from './branch-domain';

export interface PendingChatFocus {
  chatIndex: number;
  nodeId: string;
}

export interface ScrollAnchor {
  firstVisibleItemIndex: number;
  offsetWithinItem: number;
  wasAtBottom: boolean;
}

export interface BranchSlice {
  contentStore: ContentStoreData;
  setContentStore: (contentStore: ContentStoreData) => void;
  applyBranchState: (chats: ChatInterface[], contentStore: ContentStoreData) => void;
  branchClipboard: BranchClipboard | null;
  branchEditorFocusNodeId: string | null;
  setBranchEditorFocusNodeId: (nodeId: string | null) => void;
  chatActiveView: 'chat' | 'branch-editor';
  setChatActiveView: (view: 'chat' | 'branch-editor') => void;
  pendingChatFocus: PendingChatFocus | null;
  setPendingChatFocus: (focus: PendingChatFocus | null) => void;
  clearPendingChatFocus: () => void;

  chatScrollAnchors: Record<string, ScrollAnchor>;
  saveChatScrollAnchor: (chatId: string, anchor: ScrollAnchor) => void;
  getChatScrollAnchor: (chatId: string) => ScrollAnchor | null;
  clearChatScrollAnchor: (chatId: string) => void;

  // Multi-view state
  isMultiView: boolean;
  setIsMultiView: (enabled: boolean) => void;
  multiViewChatIndices: number[];
  setMultiViewChatIndices: (indices: number[]) => void;
  multiViewPrimaryChatIndex: number | null;
  setMultiViewPrimaryChatIndex: (index: number | null) => void;
  moveBranchSequence: (
    sourceChatIndex: number,
    fromNodeId: string,
    toNodeId: string,
    targetChatIndex: number,
    afterNodeId: string
  ) => void;
  activateFolderOverview: (folderId: string) => void;

  ensureBranchTree: (chatIndex: number) => void;
  createBranch: (
    chatIndex: number,
    fromNodeId: string,
    newContent?: ContentInterface[]
  ) => string;
  switchBranchAtNode: (chatIndex: number, nodeId: string) => void;
  switchActivePath: (chatIndex: number, newPath: string[]) => void;
  deleteBranch: (chatIndex: number, nodeId: string) => void;
  renameBranchNode: (
    chatIndex: number,
    nodeId: string,
    label: string
  ) => void;

  appendNodeToActivePath: (
    chatIndex: number,
    role: Role,
    content: ContentInterface[]
  ) => string;
  updateLastNodeContent: (
    chatIndex: number,
    content: ContentInterface[]
  ) => void;
  truncateActivePathAt: (chatIndex: number, nodeId: string) => void;
  upsertMessageAtIndex: (
    chatIndex: number,
    messageIndex: number,
    role: Role,
    content: ContentInterface[]
  ) => void;
  insertMessageAtIndex: (
    chatIndex: number,
    messageIndex: number,
    role: Role,
    content: ContentInterface[]
  ) => string;
  removeMessageAtIndex: (chatIndex: number, messageIndex: number) => void;
  moveMessage: (
    chatIndex: number,
    messageIndex: number,
    direction: 'up' | 'down'
  ) => void;
  replaceMessageAndPruneFollowing: (
    chatIndex: number,
    messageIndex: number,
    role: Role,
    content: ContentInterface[],
    removeCount?: number
  ) => void;

  copyBranchSequence: (
    chatIndex: number,
    fromNodeId: string,
    toNodeId: string
  ) => void;
  pasteBranchSequence: (
    targetChatIndex: number,
    afterNodeId: string
  ) => void;
  setBranchClipboard: (clipboard: BranchClipboard | null) => void;
}

export const createBranchSlice: StoreSlice<BranchSlice> = (set, get) => ({
  contentStore: {},
  setContentStore: (contentStore) => {
    set({ contentStore });
  },
  applyBranchState: (chats, contentStore) => {
    get().setChats(chats);
    set({ contentStore });
  },
  branchClipboard: null,
  branchEditorFocusNodeId: null,
  setBranchEditorFocusNodeId: (nodeId) => {
    if (get().branchEditorFocusNodeId === nodeId) return;
    set({ branchEditorFocusNodeId: nodeId });
  },
  chatActiveView: 'chat' as 'chat' | 'branch-editor',
  setChatActiveView: (view) => {
    if (get().chatActiveView === view) return;
    set({ chatActiveView: view });
  },
  pendingChatFocus: null,
  setPendingChatFocus: (focus) => {
    set({ pendingChatFocus: focus });
  },
  clearPendingChatFocus: () => {
    if (get().pendingChatFocus === null) return;
    set({ pendingChatFocus: null });
  },

  chatScrollAnchors: {},
  saveChatScrollAnchor: (chatId, anchor) => {
    set((prev) => ({
      chatScrollAnchors: { ...prev.chatScrollAnchors, [chatId]: anchor },
    }));
  },
  getChatScrollAnchor: (chatId) => {
    return get().chatScrollAnchors[chatId] ?? null;
  },
  clearChatScrollAnchor: (chatId) => {
    const { [chatId]: _, ...rest } = get().chatScrollAnchors;
    set({ chatScrollAnchors: rest });
  },

  isMultiView: false,
  setIsMultiView: (enabled) => {
    if (get().isMultiView === enabled && (enabled || (
      get().multiViewChatIndices.length === 0 &&
      get().multiViewPrimaryChatIndex === null
    ))) return;
    set({ isMultiView: enabled });
    if (!enabled) {
      set({ multiViewChatIndices: [], multiViewPrimaryChatIndex: null });
    }
  },
  multiViewChatIndices: [],
  setMultiViewChatIndices: (indices) => {
    const current = get().multiViewChatIndices;
    if (
      current.length === indices.length &&
      current.every((value, index) => value === indices[index])
    ) {
      return;
    }
    set({ multiViewChatIndices: indices });
  },
  multiViewPrimaryChatIndex: null,
  setMultiViewPrimaryChatIndex: (index) => {
    if (get().multiViewPrimaryChatIndex === index) return;
    set({ multiViewPrimaryChatIndex: index });
  },
  moveBranchSequence: (sourceChatIndex, fromNodeId, toNodeId, targetChatIndex, afterNodeId) => {
    get().copyBranchSequence(sourceChatIndex, fromNodeId, toNodeId);
    get().pasteBranchSequence(targetChatIndex, afterNodeId);
    get().deleteBranch(sourceChatIndex, fromNodeId);
  },
  activateFolderOverview: (folderId) => {
    const chats = get().chats;
    if (!chats) return;
    const indices = chats
      .map((c, i) => ({ chat: c, index: i }))
      .filter((item) => item.chat.folder === folderId)
      .map((item) => item.index);
    set({
      isMultiView: true,
      multiViewChatIndices: indices,
      multiViewPrimaryChatIndex: get().currentChatIndex,
    });
  },

  ensureBranchTree: (chatIndex) => {
    const chats = get().chats;
    if (!chats || chats[chatIndex]?.branchTree) return;
    const { chats: updatedChats, contentStore } = ensureBranchTreeState(
      chats,
      chatIndex,
      get().contentStore
    );
    get().applyBranchState(updatedChats, contentStore);
  },

  createBranch: (chatIndex, fromNodeId, newContent) => {
    const { chats, contentStore, newId } = createBranchState(
      get().chats!,
      chatIndex,
      fromNodeId,
      newContent,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
    return newId;
  },

  switchBranchAtNode: (chatIndex, nodeId) => {
    get().setChats(
      switchBranchAtNodeState(get().chats!, chatIndex, nodeId, get().contentStore)
    );
  },

  switchActivePath: (chatIndex, newPath) => {
    get().setChats(
      switchActivePathState(get().chats!, chatIndex, newPath, get().contentStore)
    );
  },

  deleteBranch: (chatIndex, nodeId) => {
    const { chats, contentStore } = deleteBranchState(
      get().chats!,
      chatIndex,
      nodeId,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
  },

  renameBranchNode: (chatIndex, nodeId, label) => {
    get().setChats(renameBranchNodeState(get().chats!, chatIndex, nodeId, label));
  },

  appendNodeToActivePath: (chatIndex, role, content) => {
    const { chats, contentStore, newId } = appendNodeToActivePathState(
      get().chats!,
      chatIndex,
      role,
      content,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
    return newId;
  },

  updateLastNodeContent: (chatIndex, content) => {
    const { chats, contentStore } = updateLastNodeContentState(
      get().chats!,
      chatIndex,
      content,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
  },

  truncateActivePathAt: (chatIndex, nodeId) => {
    get().setChats(
      truncateActivePathState(get().chats!, chatIndex, nodeId, get().contentStore)
    );
  },

  upsertMessageAtIndex: (chatIndex, messageIndex, role, content) => {
    const { chats, contentStore } = upsertMessageAtIndexState(
      get().chats!,
      chatIndex,
      messageIndex,
      { role, content },
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
  },

  insertMessageAtIndex: (chatIndex, messageIndex, role, content) => {
    const { chats, contentStore, newId } = insertMessageAtIndexState(
      get().chats!,
      chatIndex,
      messageIndex,
      { role, content },
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
    return newId;
  },

  removeMessageAtIndex: (chatIndex, messageIndex) => {
    const chat = get().chats?.[chatIndex];
    const nodeId = chat?.branchTree?.activePath?.[messageIndex];
    const preserveNode = !!nodeId && Object.values(get().generatingSessions).some(
      (session) => session.chatId === chat?.id && session.targetNodeId === nodeId
    );
    const { chats, contentStore } = removeMessageAtIndexState(
      get().chats!,
      chatIndex,
      messageIndex,
      get().contentStore,
      { preserveNode }
    );
    get().applyBranchState(chats, contentStore);
  },

  moveMessage: (chatIndex, messageIndex, direction) => {
    const { chats, contentStore } = moveMessageState(
      get().chats!,
      chatIndex,
      messageIndex,
      direction,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
  },

  replaceMessageAndPruneFollowing: (
    chatIndex,
    messageIndex,
    role,
    content,
    removeCount = 0
  ) => {
    const { chats, contentStore } = replaceMessageAndPruneFollowingState(
      get().chats!,
      chatIndex,
      messageIndex,
      { role, content },
      get().contentStore,
      removeCount
    );
    get().applyBranchState(chats, contentStore);
  },

  copyBranchSequence: (chatIndex, fromNodeId, toNodeId) => {
    const chats = get().chats;
    if (!chats) return;
    const clipboard = copyBranchSequenceState(chats, chatIndex, fromNodeId, toNodeId);
    if (!clipboard) return;
    set({
      branchClipboard: clipboard,
    });
  },

  pasteBranchSequence: (targetChatIndex, afterNodeId) => {
    const clipboard = get().branchClipboard;
    if (!clipboard) return;
    const { chats, contentStore } = pasteBranchSequenceState(
      get().chats!,
      targetChatIndex,
      afterNodeId,
      clipboard,
      get().contentStore
    );
    get().applyBranchState(chats, contentStore);
  },

  setBranchClipboard: (clipboard) => {
    set({ branchClipboard: clipboard });
  },
});
