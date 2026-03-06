import { v4 as uuidv4 } from 'uuid';
import {
  BranchNode,
  BranchTree,
  MessageInterface,
} from '@type/chat';

export function materializeActivePath(tree: BranchTree): MessageInterface[] {
  return tree.activePath.map((id) => {
    const node = tree.nodes[id];
    return { role: node.role, content: node.content };
  });
}

export function flatMessagesToBranchTree(
  messages: MessageInterface[]
): BranchTree {
  const nodes: Record<string, BranchNode> = {};
  const ids: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const id = uuidv4();
    ids.push(id);
    nodes[id] = {
      id,
      parentId: i === 0 ? null : ids[i - 1],
      role: messages[i].role,
      content: messages[i].content,
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
