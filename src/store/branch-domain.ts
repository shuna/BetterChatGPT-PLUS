import {
  BranchClipboard,
  BranchNode,
  ChatInterface,
  ContentInterface,
  MessageInterface,
  Role,
} from '@type/chat';
import {
  buildPathToLeaf,
  collectDescendants,
  flatMessagesToBranchTree,
  getChildrenOf,
  materializeActivePath,
} from '@utils/branchUtils';
import {
  ContentStoreData,
  addContent,
  addContentDelta,
  isContentEqual,
  releaseContent,
  retainContent,
} from '@utils/contentStore';
import { v4 as uuidv4 } from 'uuid';

export const cloneChatAt = (
  chats: ChatInterface[],
  chatIndex: number
): ChatInterface[] => {
  const result = chats.slice();
  const chat = result[chatIndex];
  result[chatIndex] = {
    ...chat,
    messages: chat.messages.slice(),
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

const cloneNode = (node: BranchNode): BranchNode => ({ ...node });

const ensureBranchReadyState = (
  chats: ChatInterface[],
  chatIndex: number,
  currentContentStore: ContentStoreData
) => {
  const ensured = ensureBranchTreeState(chats, chatIndex, currentContentStore);
  return {
    chats: cloneChatAt(ensured.chats, chatIndex),
    contentStore: { ...ensured.contentStore },
  };
};

const cloneNodeIfPresent = (
  tree: NonNullable<ChatInterface['branchTree']>,
  nodeId: string | null | undefined
) => {
  if (!nodeId) return;
  const node = tree.nodes[nodeId];
  if (!node) return;
  tree.nodes[nodeId] = cloneNode(node);
};

type PreparedBranchMutationState = {
  chats: ChatInterface[];
  chat: ChatInterface;
  tree: NonNullable<ChatInterface['branchTree']>;
  contentStore: ContentStoreData;
};

const prepareBranchMutationState = (
  chats: ChatInterface[],
  chatIndex: number,
  currentContentStore: ContentStoreData
): PreparedBranchMutationState => {
  const { chats: updatedChats, contentStore } = ensureBranchReadyState(
    chats,
    chatIndex,
    currentContentStore
  );
  const chat = updatedChats[chatIndex];
  return {
    chats: updatedChats,
    chat,
    tree: chat.branchTree!,
    contentStore,
  };
};

const finalizePreparedBranchMutationState = ({
  chats,
  chat,
  tree,
  contentStore,
}: PreparedBranchMutationState) => {
  tree.rootId = tree.activePath[0] ?? '';
  chat.messages = materializeActivePath(tree, contentStore);
  return { chats, contentStore };
};

const removeMessageAtIndexFromPreparedState = (
  state: PreparedBranchMutationState,
  messageIndex: number,
  options?: { preserveNode?: boolean }
) => {
  const { tree, contentStore } = state;
  const nodeId = tree.activePath[messageIndex];

  if (!nodeId) return;

  const parentId = tree.nodes[nodeId]?.parentId ?? null;
  const nextId = tree.activePath[messageIndex + 1] ?? null;

  Object.values(tree.nodes).forEach((node) => {
    if (node.parentId !== nodeId) return;
    tree.nodes[node.id] = {
      ...node,
      parentId,
    };
  });

  if (nextId) {
    cloneNodeIfPresent(tree, nextId);
    tree.nodes[nextId].parentId = parentId;
  }

  if (!options?.preserveNode) {
    releaseContent(contentStore, tree.nodes[nodeId].contentHash);
    delete tree.nodes[nodeId];
  }
  tree.activePath.splice(messageIndex, 1);
};

export const ensureBranchTreeState = (
  chats: ChatInterface[],
  chatIndex: number,
  currentContentStore: ContentStoreData
) => {
  if (chats[chatIndex]?.branchTree) {
    return { chats, contentStore: currentContentStore };
  }

  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, chatIndex);
  updatedChats[chatIndex].branchTree = flatMessagesToBranchTree(
    updatedChats[chatIndex].messages,
    contentStore
  );

  return { chats: updatedChats, contentStore };
};

export const createBranchState = (
  chats: ChatInterface[],
  chatIndex: number,
  fromNodeId: string,
  newContent: ContentInterface[] | undefined,
  currentContentStore: ContentStoreData
) => {
  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  const fromNode = tree.nodes[fromNodeId];

  const newId = uuidv4();
  const contentHash = newContent
    ? addContentDelta(contentStore, newContent, fromNode.contentHash)
    : (() => {
        retainContent(contentStore, fromNode.contentHash);
        return fromNode.contentHash;
      })();

  tree.nodes[newId] = {
    id: newId,
    parentId: fromNode.parentId,
    role: fromNode.role,
    contentHash,
    createdAt: Date.now(),
  };

  const fromIdx = tree.activePath.indexOf(fromNodeId);
  tree.activePath = [...tree.activePath.slice(0, fromIdx), newId];
  updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);

  return { chats: updatedChats, contentStore, newId };
};

export const switchActivePathState = (
  chats: ChatInterface[],
  chatIndex: number,
  newPath: string[],
  contentStore: ContentStoreData
) => {
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  tree.activePath = newPath;
  updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);
  return updatedChats;
};

export const switchBranchAtNodeState = (
  chats: ChatInterface[],
  chatIndex: number,
  nodeId: string,
  contentStore: ContentStoreData
) => {
  const tree = chats[chatIndex].branchTree!;
  return switchActivePathState(
    chats,
    chatIndex,
    buildPathToLeaf(tree, nodeId),
    contentStore
  );
};

export const deleteBranchState = (
  chats: ChatInterface[],
  chatIndex: number,
  nodeId: string,
  currentContentStore: ContentStoreData
) => {
  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
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
    updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);
  }

  return { chats: updatedChats, contentStore };
};

export const pruneHiddenNodesState = (
  chats: ChatInterface[],
  chatIndex: number,
  currentContentStore: ContentStoreData
) => {
  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  const activeSet = new Set(tree.activePath);

  const toDelete = Object.keys(tree.nodes).filter((id) => !activeSet.has(id));
  toDelete.forEach((id) => {
    releaseContent(contentStore, tree.nodes[id].contentHash);
    delete tree.nodes[id];
  });

  // Fix parent pointers: first node in activePath has no parent outside the path
  for (const id of tree.activePath) {
    const node = tree.nodes[id];
    if (node.parentId && !activeSet.has(node.parentId)) {
      node.parentId = null;
    }
  }

  if (tree.activePath.length > 0) {
    tree.rootId = tree.activePath[0];
  }

  return { chats: updatedChats, contentStore };
};

export const renameBranchNodeState = (
  chats: ChatInterface[],
  chatIndex: number,
  nodeId: string,
  label: string
) => {
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  tree.nodes[nodeId] = cloneNode(tree.nodes[nodeId]);
  tree.nodes[nodeId].label = label;
  return updatedChats;
};

export const appendNodeToActivePathState = (
  chats: ChatInterface[],
  chatIndex: number,
  role: Role,
  content: ContentInterface[],
  currentContentStore: ContentStoreData
) => {
  const { chats: updatedChats, chat, tree, contentStore } =
    prepareBranchMutationState(chats, chatIndex, currentContentStore);
  const parentId = tree.activePath[tree.activePath.length - 1] ?? null;
  const newId = uuidv4();

  tree.nodes[newId] = {
    id: newId,
    parentId,
    role,
    contentHash: addContent(contentStore, content),
    createdAt: Date.now(),
  };
  tree.activePath.push(newId);

  const finalized = finalizePreparedBranchMutationState({
    chats: updatedChats,
    chat,
    tree,
    contentStore,
  });

  return { ...finalized, newId };
};

export const upsertMessageAtIndexState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  message: MessageInterface,
  currentContentStore: ContentStoreData
) => {
  const { chats: updatedChats, chat, tree, contentStore } =
    prepareBranchMutationState(chats, chatIndex, currentContentStore);
  const existingId = tree.activePath[messageIndex];

  chat.messages[messageIndex] = message;

  if (existingId) {
    const oldHash = tree.nodes[existingId].contentHash;
    // Delta vs full: addContentDelta attempts delta compression against oldHash.
    // If oldHash refCount drops to 0 on release, promoteDependents will promote
    // the delta back to full — this is intentional. Delta only persists when the
    // base is shared (e.g., another branch references it). The diff computation
    // overhead for the single-ref case is negligible.
    const newHash = addContentDelta(contentStore, message.content, oldHash);
    releaseContent(contentStore, oldHash);
    tree.nodes[existingId] = {
      ...tree.nodes[existingId],
      role: message.role,
      contentHash: newHash,
    };
  } else if (messageIndex === tree.activePath.length) {
    const parentId =
      messageIndex === 0 ? null : tree.activePath[messageIndex - 1] ?? null;
    const newId = uuidv4();
    tree.nodes[newId] = {
      id: newId,
      parentId,
      role: message.role,
      contentHash: addContent(contentStore, message.content),
      createdAt: Date.now(),
    };
    tree.activePath.push(newId);
    if (messageIndex === 0) {
      tree.rootId = newId;
    }
  }

  return finalizePreparedBranchMutationState({
    chats: updatedChats,
    chat,
    tree,
    contentStore,
  });
};

export const insertMessageAtIndexState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  message: MessageInterface,
  currentContentStore: ContentStoreData
) => {
  const { chats: updatedChats, chat, tree, contentStore } =
    prepareBranchMutationState(chats, chatIndex, currentContentStore);
  const prevId = messageIndex > 0 ? tree.activePath[messageIndex - 1] ?? null : null;
  const nextId = tree.activePath[messageIndex];
  const newId = uuidv4();

  tree.nodes[newId] = {
    id: newId,
    parentId: prevId,
    role: message.role,
    contentHash: addContent(contentStore, message.content),
    createdAt: Date.now(),
  };

  if (nextId) {
    cloneNodeIfPresent(tree, nextId);
    tree.nodes[nextId].parentId = newId;
  }

  tree.activePath.splice(messageIndex, 0, newId);
  if (messageIndex === 0) {
    tree.rootId = newId;
  }

  const finalized = finalizePreparedBranchMutationState({
    chats: updatedChats,
    chat,
    tree,
    contentStore,
  });
  return { ...finalized, newId };
};

export const updateLastNodeContentState = (
  chats: ChatInterface[],
  chatIndex: number,
  content: ContentInterface[],
  currentContentStore: ContentStoreData
) => {
  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  const lastId = tree.activePath[tree.activePath.length - 1];

  if (lastId) {
    const oldHash = tree.nodes[lastId].contentHash;
    // See upsertMessageAtIndexState for delta-on-edit rationale
    const newHash = addContentDelta(contentStore, content, oldHash);
    releaseContent(contentStore, oldHash);
    tree.nodes[lastId] = cloneNode(tree.nodes[lastId]);
    tree.nodes[lastId].contentHash = newHash;
    updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);
  }

  return { chats: updatedChats, contentStore };
};

export const removeMessageAtIndexState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  currentContentStore: ContentStoreData,
  options?: { preserveNode?: boolean }
) => {
  const state = prepareBranchMutationState(chats, chatIndex, currentContentStore);
  removeMessageAtIndexFromPreparedState(state, messageIndex, options);
  return finalizePreparedBranchMutationState(state);
};

export const moveMessageState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  direction: 'up' | 'down',
  currentContentStore: ContentStoreData
) => {
  const { chats: updatedChats, chat, tree, contentStore } =
    prepareBranchMutationState(chats, chatIndex, currentContentStore);
  const targetIndex = direction === 'up' ? messageIndex - 1 : messageIndex + 1;

  if (
    targetIndex < 0 ||
    targetIndex >= tree.activePath.length ||
    messageIndex < 0 ||
    messageIndex >= tree.activePath.length
  ) {
    return finalizePreparedBranchMutationState({
      chats: updatedChats,
      chat,
      tree,
      contentStore,
    });
  }

  const start = Math.min(messageIndex, targetIndex);
  const end = Math.max(messageIndex, targetIndex);
  const reorderedPath = tree.activePath.slice();
  const [movedId] = reorderedPath.splice(messageIndex, 1);
  reorderedPath.splice(targetIndex, 0, movedId);
  tree.activePath = reorderedPath;

  for (let index = start; index <= end + 1; index += 1) {
    const nodeId = tree.activePath[index];
    if (!nodeId) continue;
    cloneNodeIfPresent(tree, nodeId);
    tree.nodes[nodeId].parentId = index === 0 ? null : tree.activePath[index - 1] ?? null;
  }

  return finalizePreparedBranchMutationState({
    chats: updatedChats,
    chat,
    tree,
    contentStore,
  });
};

export const replaceMessageAndPruneFollowingState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  message: MessageInterface,
  currentContentStore: ContentStoreData,
  removeCount = 0
) => {
  const state = prepareBranchMutationState(chats, chatIndex, currentContentStore);
  const { tree, contentStore } = state;
  const existingId = tree.activePath[messageIndex];

  state.chat.messages[messageIndex] = message;

  if (existingId) {
    const oldHash = tree.nodes[existingId].contentHash;
    // See upsertMessageAtIndexState for delta-on-edit rationale
    const newHash = addContentDelta(contentStore, message.content, oldHash);
    releaseContent(contentStore, oldHash);
    tree.nodes[existingId] = {
      ...tree.nodes[existingId],
      role: message.role,
      contentHash: newHash,
    };
  } else if (messageIndex === tree.activePath.length) {
    const parentId =
      messageIndex === 0 ? null : tree.activePath[messageIndex - 1] ?? null;
    const newId = uuidv4();
    tree.nodes[newId] = {
      id: newId,
      parentId,
      role: message.role,
      contentHash: addContent(contentStore, message.content),
      createdAt: Date.now(),
    };
    tree.activePath.push(newId);
  }

  for (let removed = 0; removed < removeCount; removed += 1) {
    removeMessageAtIndexFromPreparedState(state, messageIndex + 1);
  }

  return finalizePreparedBranchMutationState(state);
};

export const truncateActivePathState = (
  chats: ChatInterface[],
  chatIndex: number,
  nodeId: string,
  contentStore: ContentStoreData
) => {
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  const idx = tree.activePath.indexOf(nodeId);
  if (idx >= 0) {
    tree.activePath = tree.activePath.slice(0, idx + 1);
    updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);
  }
  return updatedChats;
};

export const copyBranchSequenceState = (
  chats: ChatInterface[],
  chatIndex: number,
  fromNodeId: string,
  toNodeId: string
): BranchClipboard | null => {
  const tree = chats[chatIndex].branchTree!;

  // Walk from toNodeId up to fromNodeId to build the path
  const nodeIds: string[] = [];
  let cur: string | null = toNodeId;
  while (cur) {
    nodeIds.unshift(cur);
    if (cur === fromNodeId) break;
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  // Verify we actually reached fromNodeId
  if (nodeIds[0] !== fromNodeId) return null;
  const nodes: Record<string, BranchNode> = {};
  nodeIds.forEach((id) => {
    nodes[id] = { ...tree.nodes[id] };
  });

  return {
    nodeIds,
    sourceChat: chats[chatIndex].id,
    nodes,
  };
};

export const pasteBranchSequenceState = (
  chats: ChatInterface[],
  targetChatIndex: number,
  afterNodeId: string,
  clipboard: BranchClipboard,
  currentContentStore: ContentStoreData
) => {
  const contentStore = { ...currentContentStore };
  const updatedChats = cloneChatAt(chats, targetChatIndex);
  const tree = updatedChats[targetChatIndex].branchTree!;

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
  updatedChats[targetChatIndex].messages = materializeActivePath(tree, contentStore);

  return { chats: updatedChats, contentStore };
};

/**
 * Update a branch node's role in place.
 * Precondition: chats[chatIndex].branchTree must already exist
 * (caller must run ensureBranchTreeState first).
 */
export const updateNodeRoleState = (
  chats: ChatInterface[],
  chatIndex: number,
  nodeId: string,
  role: Role,
  contentStore: ContentStoreData
) => {
  const updatedChats = cloneChatAt(chats, chatIndex);
  const tree = updatedChats[chatIndex].branchTree!;
  tree.nodes[nodeId] = { ...tree.nodes[nodeId], role };
  updatedChats[chatIndex].messages = materializeActivePath(tree, contentStore);
  return updatedChats;
};

export type UpsertWithAutoBranchResult = {
  chats: ChatInterface[];
  contentStore: ContentStoreData;
  newId?: string;
  noOp?: boolean;
};

/**
 * Upsert a message with automatic branch preservation.
 *
 * - No content/role change → no-op (returns noOp: true)
 * - Role-only change → in-place role update
 * - Content change + last node → in-place update (no descendants to preserve)
 * - Content change + mid-chain node → create new sibling node, truncate activePath
 *   (old node and its descendants remain intact on the original branch)
 */
export const upsertWithAutoBranchState = (
  chats: ChatInterface[],
  chatIndex: number,
  messageIndex: number,
  message: MessageInterface,
  currentContentStore: ContentStoreData
): UpsertWithAutoBranchResult => {
  const { chats: ensuredChats, contentStore: ensuredStore } =
    ensureBranchReadyState(chats, chatIndex, currentContentStore);
  const tree = ensuredChats[chatIndex].branchTree!;
  const existingId = tree.activePath[messageIndex];

  if (!existingId) {
    return upsertMessageAtIndexState(
      ensuredChats, chatIndex, messageIndex, message, ensuredStore
    );
  }

  const node = tree.nodes[existingId];
  const contentChanged = !isContentEqual(ensuredStore, node.contentHash, message.content);
  const roleChanged = node.role !== message.role;

  // Complete no-op: no change to tree or contentStore, skip undo history
  if (!contentChanged && !roleChanged) {
    return { chats: ensuredChats, contentStore: ensuredStore, noOp: true };
  }

  // Role-only change: in-place update
  if (!contentChanged) {
    const state = prepareBranchMutationState(ensuredChats, chatIndex, ensuredStore);
    state.tree.nodes[existingId] = { ...state.tree.nodes[existingId], role: message.role };
    return finalizePreparedBranchMutationState(state);
  }

  // Content changed + last node: in-place update (no descendants)
  const isLastNode = messageIndex === tree.activePath.length - 1;
  if (isLastNode) {
    return upsertMessageAtIndexState(
      ensuredChats, chatIndex, messageIndex, message, ensuredStore
    );
  }

  // Content changed + mid-chain: create sibling, truncate activePath
  // Old node (existingId) stays with its descendants (D→E hang off it)
  const state = prepareBranchMutationState(ensuredChats, chatIndex, ensuredStore);
  const { tree: mutableTree, contentStore } = state;
  const newId = uuidv4();
  const parentId = mutableTree.nodes[existingId].parentId;

  mutableTree.nodes[newId] = {
    id: newId,
    parentId,
    role: message.role,
    contentHash: addContentDelta(contentStore, message.content, node.contentHash),
    createdAt: Date.now(),
  };

  mutableTree.activePath = [...mutableTree.activePath.slice(0, messageIndex), newId];
  return { ...finalizePreparedBranchMutationState(state), newId };
};
