import { v4 as uuidv4 } from 'uuid';
import {
  BranchNode,
  BranchTree,
  ChatInterface,
  ContentInterface,
  MessageInterface,
  Role,
} from '@type/chat';
import {
  ContentStoreData,
  addContent,
  resolveContent,
  releaseContent,
} from './contentStore';

export function materializeActivePath(
  tree: BranchTree,
  contentStore: ContentStoreData
): MessageInterface[] {
  return tree.activePath.map((id) => {
    const node = tree.nodes[id];
    return { role: node.role, content: resolveContent(contentStore, node.contentHash) };
  });
}

export function upsertActivePathMessage(
  chat: ChatInterface,
  index: number,
  message: MessageInterface,
  contentStore: ContentStoreData
) {
  if (!chat.branchTree || index < 0) return;

  const tree = chat.branchTree;
  const existingId = tree.activePath[index];

  if (existingId) {
    const oldHash = tree.nodes[existingId].contentHash;
    const newHash = addContent(contentStore, message.content);
    releaseContent(contentStore, oldHash);
    tree.nodes[existingId] = {
      ...tree.nodes[existingId],
      role: message.role,
      contentHash: newHash,
    };
    return;
  }

  if (index !== tree.activePath.length) return;

  const parentId =
    index === 0 ? null : tree.activePath[tree.activePath.length - 1] ?? null;
  const newId = uuidv4();
  const contentHash = addContent(contentStore, message.content);

  tree.nodes[newId] = {
    id: newId,
    parentId,
    role: message.role,
    contentHash,
    createdAt: Date.now(),
  };
  tree.activePath.push(newId);
}

export function truncateActivePathAfterIndex(
  chat: ChatInterface,
  lastIndexInclusive: number
) {
  if (!chat.branchTree) return;
  chat.branchTree.activePath = chat.branchTree.activePath.slice(
    0,
    lastIndexInclusive + 1
  );
}

export function deleteActivePathMessage(
  chat: ChatInterface,
  index: number,
  contentStore: ContentStoreData
) {
  if (!chat.branchTree || index < 0) return;

  const tree = chat.branchTree;
  const nodeId = tree.activePath[index];
  if (!nodeId) return;

  const parentId = tree.nodes[nodeId]?.parentId ?? null;
  Object.values(tree.nodes).forEach((node) => {
    if (node.parentId === nodeId) {
      node.parentId = parentId;
    }
  });

  releaseContent(contentStore, tree.nodes[nodeId].contentHash);
  delete tree.nodes[nodeId];
  tree.activePath.splice(index, 1);
}

export function flatMessagesToBranchTree(
  messages: MessageInterface[],
  contentStore: ContentStoreData
): BranchTree {
  const nodes: Record<string, BranchNode> = {};
  const ids: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const id = uuidv4();
    ids.push(id);
    const contentHash = addContent(contentStore, messages[i].content);
    nodes[id] = {
      id,
      parentId: i === 0 ? null : ids[i - 1],
      role: messages[i].role,
      contentHash,
      createdAt: Date.now() - (messages.length - i) * 1000,
    };
  }

  return {
    nodes,
    rootId: ids[0] ?? '',
    activePath: ids,
  };
}

export function getChildrenOf(
  tree: BranchTree,
  nodeId: string
): BranchNode[] {
  return Object.values(tree.nodes).filter((n) => n.parentId === nodeId);
}

export function getSiblingsOf(
  tree: BranchTree,
  nodeId: string
): BranchNode[] {
  const node = tree.nodes[nodeId];
  if (!node?.parentId) return [node];
  return getChildrenOf(tree, node.parentId);
}

export function buildPathToLeaf(
  tree: BranchTree,
  nodeId: string
): string[] {
  // Walk from root to nodeId
  const ancestors: string[] = [];
  let cur: string | null = nodeId;
  while (cur) {
    ancestors.unshift(cur);
    cur = tree.nodes[cur]?.parentId ?? null;
  }

  // Extend from nodeId to deepest child (prefer most recent)
  let tip = nodeId;
  while (true) {
    const children = getChildrenOf(tree, tip);
    if (children.length === 0) break;
    children.sort((a, b) => b.createdAt - a.createdAt);
    ancestors.push(children[0].id);
    tip = children[0].id;
  }

  return ancestors;
}

export function findLCA(
  tree: BranchTree,
  nodeIdA: string,
  nodeIdB: string
): string | null {
  const ancestorsA = new Set<string>();
  let cur: string | null = nodeIdA;
  while (cur) {
    ancestorsA.add(cur);
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  cur = nodeIdB;
  while (cur) {
    if (ancestorsA.has(cur)) return cur;
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  return null;
}

export function collectDescendants(
  tree: BranchTree,
  nodeId: string
): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    result.add(id);
    for (const child of getChildrenOf(tree, id)) {
      queue.push(child.id);
    }
  }
  return result;
}

export function removeMessageWithBranchSync(
  chat: ChatInterface,
  index: number,
  contentStore: ContentStoreData
): void {
  chat.messages.splice(index, 1);
  if (chat.branchTree) {
    deleteActivePathMessage(chat, index, contentStore);
    chat.messages = materializeActivePath(chat.branchTree, contentStore);
  }
}

export interface RegenerateTarget {
  removeIndex: number;
  submitMode: 'append' | 'insert';
  insertIndex: number;
}

export function resolveRegenerateTarget(
  role: Role,
  messageIndex: number,
  messagesLength: number
): RegenerateTarget | null {
  if (role === 'system') return null;

  if (role === 'assistant') {
    const afterRemoval = messagesLength - 1;
    return {
      removeIndex: messageIndex,
      submitMode: messageIndex >= afterRemoval ? 'append' : 'insert',
      insertIndex: messageIndex,
    };
  }

  // user: target the next assistant message
  const nextIndex = messageIndex + 1;
  const hasNext = nextIndex < messagesLength;
  const lengthAfterRemoval = hasNext ? messagesLength - 1 : messagesLength;
  return {
    removeIndex: hasNext ? nextIndex : -1,
    submitMode: nextIndex >= lengthAfterRemoval ? 'append' : 'insert',
    insertIndex: nextIndex,
  };
}
