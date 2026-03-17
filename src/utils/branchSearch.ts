import { BranchTree } from '@type/chat';
import { ContentStoreData, resolveContentText } from './contentStore';

export interface SearchResult {
  nodeId: string;
  chatIndex: number;
  snippet: string;
  isOnActivePath: boolean;
}

/**
 * Search branch nodes for a query string across one or more trees.
 * Returns results in DFS order with snippet context.
 */
export function searchBranchNodes(
  query: string,
  entries: ReadonlyArray<{ tree: BranchTree; chatIndex: number }>,
  contentStore: ContentStoreData,
  scope: 'all' | 'activePath'
): SearchResult[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];
  const textCache = new Map<string, string>();

  for (const { tree, chatIndex } of entries) {
    const activePathSet = new Set(tree.activePath);

    // Determine which nodes to search
    const nodeIds =
      scope === 'activePath'
        ? tree.activePath
        : dfsOrder(tree);

    for (const nodeId of nodeIds) {
      const node = tree.nodes[nodeId];
      if (!node) continue;

      let text = textCache.get(node.contentHash);
      if (text === undefined) {
        text = resolveContentText(contentStore, node.contentHash);
        textCache.set(node.contentHash, text);
      }

      const lowerText = text.toLowerCase();
      const matchIdx = lowerText.indexOf(lowerQuery);
      if (matchIdx < 0) continue;

      // Build snippet: up to 40 chars before and after match
      const start = Math.max(0, matchIdx - 40);
      const end = Math.min(text.length, matchIdx + query.length + 40);
      let snippet = '';
      if (start > 0) snippet += '...';
      snippet += text.slice(start, end);
      if (end < text.length) snippet += '...';

      results.push({
        nodeId,
        chatIndex,
        snippet,
        isOnActivePath: activePathSet.has(nodeId),
      });
    }
  }

  return results;
}

/** Return all node IDs in DFS order from root */
function dfsOrder(tree: BranchTree): string[] {
  const result: string[] = [];
  const childrenMap = new Map<string, string[]>();

  for (const node of Object.values(tree.nodes)) {
    if (node.parentId) {
      const siblings = childrenMap.get(node.parentId);
      if (siblings) siblings.push(node.id);
      else childrenMap.set(node.parentId, [node.id]);
    }
  }

  const stack = [tree.rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const children = childrenMap.get(id);
    if (children) {
      // Reverse so first child is processed first (stack is LIFO)
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }

  return result;
}
