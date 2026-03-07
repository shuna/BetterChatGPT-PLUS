import { StoreSlice } from './store';
import {
  BranchClipboard,
  BranchNode,
  BranchTree,
  ChatInterface,
  ContentInterface,
  Role,
} from '@type/chat';
import {
  flatMessagesToBranchTree,
  materializeActivePath,
  getChildrenOf,
  buildPathToLeaf,
  collectDescendants,
} from '@utils/branchUtils';
import {
  ContentStoreData,
  addContent,
  retainContent,
  releaseContent,
  resolveContent,
} from '@utils/contentStore';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shallow-clone the chats array, replacing only chats[chatIndex]
 * with a shallow copy (and its branchTree/nodes if present).
 * All other chats keep their original references → structural sharing.
 */
const cloneChatAt = (
  chats: ChatInterface[],
  chatIndex: number
): ChatInterface[] => {
  const result = chats.slice(); // shallow copy of array
  const chat = result[chatIndex];
  result[chatIndex] = {
    ...chat,
    messages: chat.messages.slice(), // shallow copy messages array
    branchTree: chat.branchTree
      ? {
          ...chat.branchTree,
          nodes: { ...chat.branchTree.nodes },
          activePath: chat.branchTree.activePath.slice(),
        }
      : undefined,
    collapsedNodes: chat.collapsedNodes
      ? { ...chat.collapsedNodes }
      : undefined,
  };
  return result;
};

/** Shallow-clone a single BranchNode (since nodes are small value objects). */
const cloneNode = (node: BranchNode): BranchNode => ({ ...node });

export interface BranchSlice {
  contentStore: ContentStoreData;
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
  contentStore: {},
  branchClipboard: null,
  branchEditorFocusNodeId: null,
  setBranchEditorFocusNodeId: (nodeId) => {
    if (get().branchEditorFocusNodeId === nodeId) return;
    set({ branchEditorFocusNodeId: nodeId } as any);
  },
  chatActiveView: 'chat' as 'chat' | 'branch-editor',
  setChatActiveView: (view) => {
    if (get().chatActiveView === view) return;
    set({ chatActiveView: view } as any);
  },

  isMultiView: false,
  setIsMultiView: (enabled) => {
    if (get().isMultiView === enabled && (enabled || (
      get().multiViewChatIndices.length === 0 &&
      get().multiViewPrimaryChatIndex === null
    ))) return;
    set({ isMultiView: enabled } as any);
    if (!enabled) {
      set({ multiViewChatIndices: [], multiViewPrimaryChatIndex: null } as any);
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
    set({ multiViewChatIndices: indices } as any);
  },
  multiViewPrimaryChatIndex: null,
  setMultiViewPrimaryChatIndex: (index) => {
    if (get().multiViewPrimaryChatIndex === index) return;
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
    const contentStore = { ...get().contentStore };
    const updated = cloneChatAt(chats, chatIndex);
    updated[chatIndex].branchTree = flatMessagesToBranchTree(
      updated[chatIndex].messages,
      contentStore
    );
    get().setChats(updated);
    set({ contentStore } as any);
  },

  createBranch: (chatIndex, fromNodeId, newContent) => {
    const contentStore = { ...get().contentStore };
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const fromNode = tree.nodes[fromNodeId];

    const newId = uuidv4();
    let contentHash: string;
    if (newContent) {
      contentHash = addContent(contentStore, newContent);
    } else {
      contentHash = fromNode.contentHash;
      retainContent(contentStore, contentHash);
    }

    tree.nodes[newId] = {
      id: newId,
      parentId: fromNode.parentId,
      role: fromNode.role,
      contentHash,
      createdAt: Date.now(),
    };

    const fromIdx = tree.activePath.indexOf(fromNodeId);
    tree.activePath = [...tree.activePath.slice(0, fromIdx), newId];
    chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    get().setChats(chats);
    set({ contentStore } as any);
    return newId;
  },

  switchBranchAtNode: (chatIndex, nodeId) => {
    const contentStore = get().contentStore;
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const newPath = buildPathToLeaf(tree, nodeId);
    tree.activePath = newPath;
    chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    get().setChats(chats);
  },

  switchActivePath: (chatIndex, newPath) => {
    const contentStore = get().contentStore;
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    tree.activePath = newPath;
    chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    get().setChats(chats);
  },

  deleteBranch: (chatIndex, nodeId) => {
    const contentStore = { ...get().contentStore };
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const toDelete = collectDescendants(tree, nodeId);
    const parentId = tree.nodes[nodeId]?.parentId;

    toDelete.forEach((id) => {
      releaseContent(contentStore, tree.nodes[id].contentHash);
      delete tree.nodes[id];
    });

    if (tree.activePath.some((id) => toDelete.has(id))) {
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
      chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    }
    get().setChats(chats);
    set({ contentStore } as any);
  },

  renameBranchNode: (chatIndex, nodeId, label) => {
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    tree.nodes[nodeId] = cloneNode(tree.nodes[nodeId]);
    tree.nodes[nodeId].label = label;
    get().setChats(chats);
  },

  appendNodeToActivePath: (chatIndex, role, content) => {
    const contentStore = { ...get().contentStore };
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const parentId =
      tree.activePath[tree.activePath.length - 1] ?? null;
    const newId = uuidv4();
    const contentHash = addContent(contentStore, content);
    tree.nodes[newId] = {
      id: newId,
      parentId,
      role,
      contentHash,
      createdAt: Date.now(),
    };
    tree.activePath.push(newId);
    chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    get().setChats(chats);
    set({ contentStore } as any);
    return newId;
  },

  updateLastNodeContent: (chatIndex, content) => {
    const contentStore = { ...get().contentStore };
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const lastId = tree.activePath[tree.activePath.length - 1];
    if (lastId) {
      releaseContent(contentStore, tree.nodes[lastId].contentHash);
      tree.nodes[lastId] = cloneNode(tree.nodes[lastId]);
      tree.nodes[lastId].contentHash = addContent(contentStore, content);
      chats[chatIndex].messages = materializeActivePath(tree, contentStore);
    }
    get().setChats(chats);
    set({ contentStore } as any);
  },

  truncateActivePathAt: (chatIndex, nodeId) => {
    const contentStore = get().contentStore;
    const chats = cloneChatAt(get().chats!, chatIndex);
    const tree = chats[chatIndex].branchTree!;
    const idx = tree.activePath.indexOf(nodeId);
    if (idx >= 0) {
      tree.activePath = tree.activePath.slice(0, idx + 1);
      chats[chatIndex].messages = materializeActivePath(tree, contentStore);
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

    const contentStore = { ...get().contentStore };
    const chats = cloneChatAt(get().chats!, targetChatIndex);
    const tree = chats[targetChatIndex].branchTree!;

    const idMap: Record<string, string> = {};
    clipboard.nodeIds.forEach((id) => {
      idMap[id] = uuidv4();
    });

    let prevId = afterNodeId;
    for (const origId of clipboard.nodeIds) {
      const newId = idMap[origId];
      const srcNode = clipboard.nodes[origId];
      retainContent(contentStore, srcNode.contentHash);
      tree.nodes[newId] = {
        ...srcNode,
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
    chats[targetChatIndex].messages = materializeActivePath(tree, contentStore);
    get().setChats(chats);
    set({ contentStore } as any);
  },

  setBranchClipboard: (clipboard) => {
    set({ branchClipboard: clipboard } as any);
  },
});
