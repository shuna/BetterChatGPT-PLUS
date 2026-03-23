import { StoreSlice } from './store';
import {
  BranchClipboard,
  ChatInterface,
  ChatView,
  ContentInterface,
  Role,
  isSplitView,
} from '@type/chat';
import { ContentStoreData, addContent } from '@utils/contentStore';
import {
  finalizeStreamingBuffer,
  isStreamingContentHash,
} from '@utils/streamingBuffer';
import {
  appendNodeToActivePathState,
  copyBranchSequenceState,
  createBranchState,
  deleteBranchState,
  pruneHiddenNodesState,
  ensureBranchTreeState,
  insertMessageAtIndexState,
  moveMessageState,
  pasteBranchSequenceState,
  removeMessageAtIndexState,
  renameBranchNodeState,
  replaceMessageAndPruneFollowingState,
  switchActivePathState,
  switchBranchAtNodeState,
  toggleNodeStarState,
  toggleNodePinState,
  truncateActivePathState,
  updateNodeRoleState,
  upsertMessageAtIndexState,
  upsertWithAutoBranchState,
  updateLastNodeContentState,
} from './branch-domain';
import { cloneChatAt } from './branch-domain';

/**
 * Finalize any streaming nodes in the given chat, mutating contentStore in place.
 * Returns updated chats array if any streaming nodes were found, otherwise the original.
 */
function finalizeStreamingNodesInChat(
  chats: ChatInterface[],
  chatIndex: number,
  contentStore: ContentStoreData
): ChatInterface[] {
  const chat = chats[chatIndex];
  const tree = chat.branchTree;
  if (!tree) return chats;

  const streamingNodes = Object.values(tree.nodes).filter((n) =>
    isStreamingContentHash(n.contentHash)
  );
  if (streamingNodes.length === 0) return chats;

  const updatedChats = cloneChatAt(chats, chatIndex);
  const updatedTree = updatedChats[chatIndex].branchTree!;
  for (const node of streamingNodes) {
    const content = finalizeStreamingBuffer(node.id);
    updatedTree.nodes[node.id] = {
      ...updatedTree.nodes[node.id],
      contentHash: addContent(contentStore, content),
    };
  }
  return updatedChats;
}

export interface PendingChatFocus {
  chatIndex: number;
  nodeId: string;
}

export interface ScrollAnchor {
  firstVisibleItemIndex: number;
  offsetWithinItem: number;
  wasAtBottom: boolean;
}

interface BranchSnapshot {
  chats: ChatInterface[];
  contentStore: ContentStoreData;
}

const HISTORY_LIMIT = 50;

export interface BranchSlice {
  contentStore: ContentStoreData;
  setContentStore: (contentStore: ContentStoreData) => void;
  applyBranchState: (chats: ChatInterface[], contentStore: ContentStoreData) => void;
  branchHistoryPast: BranchSnapshot[];
  branchHistoryFuture: BranchSnapshot[];
  undoBranch: () => void;
  redoBranch: () => void;
  canUndoBranch: () => boolean;
  canRedoBranch: () => boolean;
  branchClipboard: BranchClipboard | null;
  branchEditorFocusNodeId: string | null;
  setBranchEditorFocusNodeId: (nodeId: string | null) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (nodeId: string | null) => void;
  visibleNodeId: string | null;
  setVisibleNodeId: (nodeId: string | null) => void;
  branchEditorSyncEnabled: boolean;
  setBranchEditorSyncEnabled: (enabled: boolean) => void;
  chatActiveView: ChatView;
  setChatActiveView: (view: ChatView) => void;
  navigateToBranchEditor: () => void;
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

  compareTarget: { chatIndex: number; nodeId: string } | null;
  setCompareTarget: (target: { chatIndex: number; nodeId: string } | null) => void;

  updateNodeRole: (chatIndex: number, nodeId: string, role: Role) => void;

  ensureBranchTree: (chatIndex: number) => void;
  createBranch: (
    chatIndex: number,
    fromNodeId: string,
    newContent?: ContentInterface[]
  ) => string;
  switchBranchAtNode: (chatIndex: number, nodeId: string) => void;
  switchActivePath: (chatIndex: number, newPath: string[]) => void;
  switchActivePathSilent: (chatIndex: number, newPath: string[]) => void;
  deleteBranch: (chatIndex: number, nodeId: string) => void;
  pruneHiddenNodes: (chatIndex: number) => void;
  renameBranchNode: (
    chatIndex: number,
    nodeId: string,
    label: string
  ) => void;
  toggleNodeStar: (chatIndex: number, nodeId: string) => void;
  toggleNodePin: (chatIndex: number, nodeId: string) => void;

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
  upsertWithAutoBranch: (
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
    // Save snapshot for undo before applying
    const prevChats = get().chats;
    const prevContentStore = get().contentStore;
    if (prevChats) {
      const past = [...get().branchHistoryPast, { chats: prevChats, contentStore: prevContentStore }];
      if (past.length > HISTORY_LIMIT) past.shift();
      set({ branchHistoryPast: past, branchHistoryFuture: [] });
    }
    get().setChats(chats);
    set({ contentStore });
  },
  branchHistoryPast: [],
  branchHistoryFuture: [],
  undoBranch: () => {
    const past = get().branchHistoryPast;
    if (past.length === 0) return;
    const snapshot = past[past.length - 1];
    const currentChats = get().chats;
    const currentContentStore = get().contentStore;
    set({
      branchHistoryPast: past.slice(0, -1),
      branchHistoryFuture: currentChats
        ? [...get().branchHistoryFuture, { chats: currentChats, contentStore: currentContentStore }]
        : get().branchHistoryFuture,
    });
    get().setChats(snapshot.chats);
    set({ contentStore: snapshot.contentStore });
  },
  redoBranch: () => {
    const future = get().branchHistoryFuture;
    if (future.length === 0) return;
    const snapshot = future[future.length - 1];
    const currentChats = get().chats;
    const currentContentStore = get().contentStore;
    set({
      branchHistoryFuture: future.slice(0, -1),
      branchHistoryPast: currentChats
        ? [...get().branchHistoryPast, { chats: currentChats, contentStore: currentContentStore }]
        : get().branchHistoryPast,
    });
    get().setChats(snapshot.chats);
    set({ contentStore: snapshot.contentStore });
  },
  canUndoBranch: () => get().branchHistoryPast.length > 0,
  canRedoBranch: () => get().branchHistoryFuture.length > 0,
  branchClipboard: null,
  branchEditorFocusNodeId: null,
  setBranchEditorFocusNodeId: (nodeId) => {
    if (get().branchEditorFocusNodeId === nodeId) return;
    set({ branchEditorFocusNodeId: nodeId });
  },
  hoveredNodeId: null,
  setHoveredNodeId: (nodeId) => {
    if (get().hoveredNodeId === nodeId) return;
    set({ hoveredNodeId: nodeId });
  },
  visibleNodeId: null,
  setVisibleNodeId: (nodeId) => {
    if (get().visibleNodeId === nodeId) return;
    set({ visibleNodeId: nodeId });
  },
  branchEditorSyncEnabled: true,
  setBranchEditorSyncEnabled: (enabled) => {
    if (get().branchEditorSyncEnabled === enabled) return;
    set({ branchEditorSyncEnabled: enabled });
  },
  chatActiveView: 'chat' as ChatView,
  setChatActiveView: (view) => {
    if (get().chatActiveView === view) return;
    set({ chatActiveView: view });
  },
  navigateToBranchEditor: () => {
    const current = get().chatActiveView;
    if (current === 'branch-editor') return;
    if (isSplitView(current)) {
      // On desktop, branch editor is already visible in split — just focus
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) return;
    }
    set({ chatActiveView: 'branch-editor' });
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

  compareTarget: null,
  setCompareTarget: (target) => {
    set({ compareTarget: target });
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

  updateNodeRole: (chatIndex, nodeId, role) => {
    const chats = get().chats;
    if (!chats) return;
    const { chats: ensured, contentStore } = ensureBranchTreeState(
      chats, chatIndex, get().contentStore
    );
    // Resolve fallback nodeId (e.g. "0") to real UUID from activePath
    const tree = ensured[chatIndex].branchTree!;
    let resolvedId = nodeId;
    if (!tree.nodes[nodeId]) {
      const idx = parseInt(nodeId, 10);
      if (!isNaN(idx) && tree.activePath[idx]) {
        resolvedId = tree.activePath[idx];
      }
    }
    if (!tree.nodes[resolvedId]) return;
    const updated = updateNodeRoleState(ensured, chatIndex, resolvedId, role, contentStore);
    get().applyBranchState(updated, contentStore);
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
    const contentStore = { ...get().contentStore };
    const chats = finalizeStreamingNodesInChat(get().chats!, chatIndex, contentStore);
    get().applyBranchState(
      switchBranchAtNodeState(chats, chatIndex, nodeId, contentStore),
      contentStore
    );
  },

  switchActivePath: (chatIndex, newPath) => {
    const contentStore = { ...get().contentStore };
    const chats = finalizeStreamingNodesInChat(get().chats!, chatIndex, contentStore);
    get().applyBranchState(
      switchActivePathState(chats, chatIndex, newPath, contentStore),
      contentStore
    );
  },

  switchActivePathSilent: (chatIndex, newPath) => {
    const contentStore = { ...get().contentStore };
    const chats = finalizeStreamingNodesInChat(get().chats!, chatIndex, contentStore);
    const updated = switchActivePathState(chats, chatIndex, newPath, contentStore);
    get().setChats(updated);
    set({ contentStore });
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

  pruneHiddenNodes: (chatIndex) => {
    const contentStore = { ...get().contentStore };
    const chats = finalizeStreamingNodesInChat(get().chats!, chatIndex, contentStore);
    const result = pruneHiddenNodesState(
      chats,
      chatIndex,
      contentStore
    );
    get().applyBranchState(result.chats, result.contentStore);
  },

  renameBranchNode: (chatIndex, nodeId, label) => {
    const chats = renameBranchNodeState(get().chats!, chatIndex, nodeId, label);
    get().applyBranchState(chats, get().contentStore);
  },

  toggleNodeStar: (chatIndex, nodeId) => {
    const chats = toggleNodeStarState(get().chats!, chatIndex, nodeId);
    get().applyBranchState(chats, get().contentStore);
  },

  toggleNodePin: (chatIndex, nodeId) => {
    const chats = toggleNodePinState(get().chats!, chatIndex, nodeId);
    get().applyBranchState(chats, get().contentStore);
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

  upsertWithAutoBranch: (chatIndex, messageIndex, role, content) => {
    const result = upsertWithAutoBranchState(
      get().chats!, chatIndex, messageIndex, { role, content }, get().contentStore
    );
    if (result.noOp) return;
    get().applyBranchState(result.chats, result.contentStore);
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
    if (!chat) return;
    const resolvedNodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);

    // Block deletion of protected nodes
    const mapKey = String(chatIndex);
    const protectedNodes = get().protectedNodeMaps[mapKey] ?? chat.protectedNodes ?? {};
    if (protectedNodes[resolvedNodeId]) return;

    const nodeId = chat.branchTree?.activePath?.[messageIndex];
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
