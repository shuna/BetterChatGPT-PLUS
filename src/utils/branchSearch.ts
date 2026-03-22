import { BranchTree } from '@type/chat';
import { ContentStoreData, resolveContentText } from './contentStore';

export interface SearchResult {
  nodeId: string;
  chatIndex: number;
  snippet: string;
  isOnActivePath: boolean;
  matchType: 'content' | 'label';
  label?: string;
  starred?: boolean;
  pinned?: boolean;
}

export interface SearchOptions {
  starredOnly?: boolean;
}

/**
 * Search branch nodes for a query string across one or more trees.
 * Returns results in DFS order with snippet context.
 * Searches both content and labels. Supports starredOnly filter.
 */
export function searchBranchNodes(
  query: string,
  entries: ReadonlyArray<{ tree: BranchTree; chatIndex: number }>,
  contentStore: ContentStoreData,
  scope: 'all' | 'activePath',
  options?: SearchOptions
): SearchResult[] {
  const hasQuery = query.trim().length > 0;
  const starredOnly = options?.starredOnly ?? false;

  // If no query and no filter, return empty
  if (!hasQuery && !starredOnly) return [];

  const lowerQuery = hasQuery ? query.toLowerCase() : '';
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

      // Apply starred filter
      if (starredOnly && !node.starred) continue;

      let text = textCache.get(node.contentHash);
      if (text === undefined) {
        text = resolveContentText(contentStore, node.contentHash);
        textCache.set(node.contentHash, text);
      }

      // Check label match
      const labelMatch = hasQuery && node.label
        ? node.label.toLowerCase().includes(lowerQuery)
        : false;

      // Check content match
      const lowerText = text.toLowerCase();
      const contentMatchIdx = hasQuery ? lowerText.indexOf(lowerQuery) : -1;
      const contentMatch = contentMatchIdx >= 0;

      // If we have a query, at least one must match
      if (hasQuery && !contentMatch && !labelMatch) continue;

      // Build snippet
      let snippet: string;
      let matchType: 'content' | 'label';

      if (contentMatch) {
        // Content match snippet
        const start = Math.max(0, contentMatchIdx - 40);
        const end = Math.min(text.length, contentMatchIdx + query.length + 40);
        snippet = '';
        if (start > 0) snippet += '...';
        snippet += text.slice(start, end);
        if (end < text.length) snippet += '...';
        matchType = 'content';
      } else if (labelMatch) {
        // Label matched but content didn't - use content preview
        snippet = text.length > 80 ? `${text.slice(0, 80)}...` : text;
        matchType = 'label';
      } else {
        // No query (starredOnly mode) - use content preview
        snippet = text.length > 80 ? `${text.slice(0, 80)}...` : text;
        matchType = 'content';
      }

      results.push({
        nodeId,
        chatIndex,
        snippet,
        isOnActivePath: activePathSet.has(nodeId),
        matchType,
        label: node.label,
        starred: node.starred,
        pinned: node.pinned,
      });
    }
  }

  return results;
}

/**
 * Return all node IDs in DFS order, starting from all roots.
 * After prune, pinned subtrees may become orphans (parentId=null, not rootId).
 * We find all root nodes to ensure orphan subtrees are included.
 */
function dfsOrder(tree: BranchTree): string[] {
  const result: string[] = [];
  const childrenMap = new Map<string, string[]>();
  const hasParentInTree = new Set<string>();

  for (const node of Object.values(tree.nodes)) {
    if (node.parentId && tree.nodes[node.parentId]) {
      hasParentInTree.add(node.id);
      const siblings = childrenMap.get(node.parentId);
      if (siblings) siblings.push(node.id);
      else childrenMap.set(node.parentId, [node.id]);
    }
  }

  // Find all roots: nodes whose parent is null or not in the tree
  const roots: string[] = [];
  for (const node of Object.values(tree.nodes)) {
    if (!hasParentInTree.has(node.id)) {
      roots.push(node.id);
    }
  }
  // Ensure the primary root comes first
  roots.sort((a, b) => (a === tree.rootId ? -1 : b === tree.rootId ? 1 : 0));

  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const children = childrenMap.get(id);
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }

  return result;
}
