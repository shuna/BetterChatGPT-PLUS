import { StoreSlice } from './store';
import {
  BranchClipboard,
  BranchNode,
  ChatInterface,
  ContentInterface,
  Role,
} from '@type/chat';
import {
  flatMessagesToBranchTree,
  materializeActivePath,
  getChildrenOf,
  getSiblingsOf,
  buildPathToLeaf,
  collectDescendants,
} from '@utils/branchUtils';
import { v4 as uuidv4 } from 'uuid';

export interface BranchSlice {
  branchClipboard: BranchClipboard | null;
  branchEditorFocusNodeId: string | null;
  setBranchEditorFocusNodeId: (nodeId: string | null) => void;
  chatActiveView: 'chat' | 'branch-editor';
  setChatActiveView: (view: 'chat' | 'branch-editor') => void;

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
  branchClipboard: null,
  branchEditorFocusNodeId: null,
  setBranchEditorFocusNodeId: (nodeId) => {
    set({ branchEditorFocusNodeId: nodeId } as any);
  },
  chatActiveView: 'chat' as 'chat' | 'branch-editor',
  setChatActiveView: (view) => {
    set({ chatActiveView: view } as any);
  },

  isMultiView: false,
  setIsMultiView: (enabled) => {
    set({ isMultiView: enabled } as any);
    if (!enabled) {
      set({ multiViewChatIndices: [], multiViewPrimaryChatIndex: null } as any);
    }
  },
  multiViewChatIndices: [],
  setMultiViewChatIndices: (indices) => {
    set({ multiViewChatIndices: indices } as any);
  },
  multiViewPrimaryChatIndex: null,
  setMultiViewPrimaryChatIndex: (index) => {
    set({ multiViewPrimaryChatIndex: index } as any);
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
    } as any);
  },

  ensureBranchTree: (chatIndex) => {
    const chats = get().chats;
    if (!chats || chats[chatIndex]?.branchTree) return;
    const updated = JSON.parse(JSON.stringify(chats)) as ChatInterface[];
    updated[chatIndex].branchTree = flatMessagesToBranchTree(
      updated[chatIndex].messages
    );
    get().setChats(updated);
  },

  createBranch: (chatIndex, fromNodeId, newContent) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const fromNode = tree.nodes[fromNodeId];

    const newId = uuidv4();
    tree.nodes[newId] = {
      id: newId,
      parentId: fromNode.parentId,
      role: fromNode.role,
      content: newContent ?? fromNode.content,
      createdAt: Date.now(),
    };

    // Rebuild activePath: path up to parent of fromNode, then newId
    const fromIdx = tree.activePath.indexOf(fromNodeId);
    tree.activePath = [...tree.activePath.slice(0, fromIdx), newId];
    chats[chatIndex].messages = materializeActivePath(tree);
    get().setChats(chats);
    return newId;
  },

  switchBranchAtNode: (chatIndex, nodeId) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const newPath = buildPathToLeaf(tree, nodeId);
    tree.activePath = newPath;
    chats[chatIndex].messages = materializeActivePath(tree);
    get().setChats(chats);
  },

  switchActivePath: (chatIndex, newPath) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    tree.activePath = newPath;
    chats[chatIndex].messages = materializeActivePath(tree);
    get().setChats(chats);
  },

  deleteBranch: (chatIndex, nodeId) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const toDelete = collectDescendants(tree, nodeId);
    const parentId = tree.nodes[nodeId]?.parentId;

    toDelete.forEach((id) => delete tree.nodes[id]);

    if (tree.activePath.some((id) => toDelete.has(id))) {
      // Switch to a sibling or rewind to parent
      if (parentId) {
        const siblings = getChildrenOf(tree, parentId);
        if (siblings.length > 0) {
          tree.activePath = buildPathToLeaf(tree, siblings[0].id);
        } else {
          const parentIdx = tree.activePath.indexOf(parentId);
          tree.activePath = tree.activePath.slice(0, parentIdx + 1);
        }
      } else {
        tree.activePath = [];
      }
      chats[chatIndex].messages = materializeActivePath(tree);
    }
    get().setChats(chats);
  },

  renameBranchNode: (chatIndex, nodeId, label) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    chats[chatIndex].branchTree!.nodes[nodeId].label = label;
    get().setChats(chats);
  },

  appendNodeToActivePath: (chatIndex, role, content) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const parentId =
      tree.activePath[tree.activePath.length - 1] ?? null;
    const newId = uuidv4();
    tree.nodes[newId] = {
      id: newId,
      parentId,
      role,
      content,
      createdAt: Date.now(),
    };
    tree.activePath.push(newId);
    chats[chatIndex].messages = materializeActivePath(tree);
    get().setChats(chats);
    return newId;
  },

  updateLastNodeContent: (chatIndex, content) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const lastId = tree.activePath[tree.activePath.length - 1];
    if (lastId) {
      tree.nodes[lastId].content = content;
      chats[chatIndex].messages = materializeActivePath(tree);
    }
    get().setChats(chats);
  },

  truncateActivePathAt: (chatIndex, nodeId) => {
    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[chatIndex].branchTree!;
    const idx = tree.activePath.indexOf(nodeId);
    if (idx >= 0) {
      tree.activePath = tree.activePath.slice(0, idx + 1);
      chats[chatIndex].messages = materializeActivePath(tree);
    }
    get().setChats(chats);
  },

  copyBranchSequence: (chatIndex, fromNodeId, toNodeId) => {
    const chats = get().chats;
    if (!chats) return;
    const tree = chats[chatIndex].branchTree!;
    const path = tree.activePath;
    const fromIdx = path.indexOf(fromNodeId);
    const toIdx = path.indexOf(toNodeId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx > toIdx) return;

    const nodeIds = path.slice(fromIdx, toIdx + 1);
    const nodes: Record<string, BranchNode> = {};
    nodeIds.forEach((id) => {
      nodes[id] = { ...tree.nodes[id] };
    });

    set({
      branchClipboard: {
        nodeIds,
        sourceChat: chats[chatIndex].id,
        nodes,
      },
    } as any);
  },

  pasteBranchSequence: (targetChatIndex, afterNodeId) => {
    const clipboard = get().branchClipboard;
    if (!clipboard) return;

    const chats = JSON.parse(
      JSON.stringify(get().chats!)
    ) as ChatInterface[];
    const tree = chats[targetChatIndex].branchTree!;

    const idMap: Record<string, string> = {};
    clipboard.nodeIds.forEach((id) => {
      idMap[id] = uuidv4();
    });

    let prevId = afterNodeId;
    for (const origId of clipboard.nodeIds) {
      const newId = idMap[origId];
      tree.nodes[newId] = {
        ...clipboard.nodes[origId],
        id: newId,
        parentId: prevId,
        createdAt: Date.now(),
      };
      prevId = newId;
    }

    const insertIdx = tree.activePath.indexOf(afterNodeId);
    tree.activePath = [
      ...tree.activePath.slice(0, insertIdx + 1),
      ...clipboard.nodeIds.map((id) => idMap[id]),
    ];
    chats[targetChatIndex].messages = materializeActivePath(tree);
    get().setChats(chats);
  },

  setBranchClipboard: (clipboard) => {
    set({ branchClipboard: clipboard } as any);
  },
});
