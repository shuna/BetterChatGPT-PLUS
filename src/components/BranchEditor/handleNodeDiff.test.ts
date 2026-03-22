import { describe, expect, it } from 'vitest';

import type { BranchTree } from '@type/chat';

/**
 * Tests for the cross-chat compare target guard logic used in
 * BranchEditorCanvas.handleNodeDiff.
 *
 * The actual handler is a useCallback inside a React component, so we
 * replicate and test the guard conditions here as pure functions.
 */

interface CompareTarget {
  chatIndex: number;
  nodeId: string;
}

interface ContextMenu {
  chatIndex: number;
}

/**
 * Replicates the chat-index resolution and guard logic from handleNodeDiff.
 * Returns the resolved chatIndex if both nodes are in the same chat,
 * or null if cross-chat comparison should be rejected.
 */
function resolveCompareChat(
  compareTarget: CompareTarget | null,
  contextMenu: ContextMenu | null,
  primaryChatIndex: number
): number | null {
  const chatIndexA =
    compareTarget?.chatIndex ?? contextMenu?.chatIndex ?? primaryChatIndex;
  const chatIndexB = contextMenu?.chatIndex ?? primaryChatIndex;

  if (chatIndexA !== chatIndexB) return null;
  return chatIndexA;
}

/**
 * Checks that both node IDs exist in the given tree.
 */
function bothNodesExist(
  tree: BranchTree,
  nodeIdA: string,
  nodeIdB: string
): boolean {
  return !!tree.nodes[nodeIdA] && !!tree.nodes[nodeIdB];
}

describe('handleNodeDiff – cross-chat compare target guard', () => {
  const treeA: BranchTree = {
    rootId: 'a-root',
    activePath: ['a-root', 'a-child'],
    nodes: {
      'a-root': {
        id: 'a-root',
        parentId: null,
        role: 'user',
        contentHash: 'h1',
        createdAt: 1,
      },
      'a-child': {
        id: 'a-child',
        parentId: 'a-root',
        role: 'assistant',
        contentHash: 'h2',
        createdAt: 2,
      },
    },
  };

  const treeB: BranchTree = {
    rootId: 'b-root',
    activePath: ['b-root', 'b-child'],
    nodes: {
      'b-root': {
        id: 'b-root',
        parentId: null,
        role: 'user',
        contentHash: 'h3',
        createdAt: 1,
      },
      'b-child': {
        id: 'b-child',
        parentId: 'b-root',
        role: 'assistant',
        contentHash: 'h4',
        createdAt: 2,
      },
    },
  };

  it('rejects comparison when compareTarget is from a different chat', () => {
    // User selected compare target in chat 0, then right-clicked in chat 1
    const compareTarget: CompareTarget = { chatIndex: 0, nodeId: 'a-child' };
    const contextMenu: ContextMenu = { chatIndex: 1 };

    const result = resolveCompareChat(compareTarget, contextMenu, 0);
    expect(result).toBeNull();
  });

  it('allows comparison when compareTarget is from the same chat', () => {
    const compareTarget: CompareTarget = { chatIndex: 0, nodeId: 'a-child' };
    const contextMenu: ContextMenu = { chatIndex: 0 };

    const result = resolveCompareChat(compareTarget, contextMenu, 0);
    expect(result).toBe(0);
  });

  it('allows comparison when no compareTarget, using contextMenu chat', () => {
    const contextMenu: ContextMenu = { chatIndex: 1 };

    const result = resolveCompareChat(null, contextMenu, 0);
    expect(result).toBe(1);
  });

  it('falls back to primaryChatIndex when no compareTarget and no contextMenu', () => {
    const result = resolveCompareChat(null, null, 2);
    expect(result).toBe(2);
  });

  it('rejects when node IDs do not exist in the resolved tree', () => {
    // Trying to compare a-child (exists in treeA) against b-child (exists only in treeB)
    expect(bothNodesExist(treeA, 'a-child', 'b-child')).toBe(false);
    expect(bothNodesExist(treeA, 'a-root', 'a-child')).toBe(true);
  });

  it('cross-chat scenario: compareTarget chat 0, contextMenu chat 1, produces null', () => {
    // Full scenario: user selects node in split-view chat A,
    // then right-clicks "Compare with selected" in chat B
    const compareTarget: CompareTarget = { chatIndex: 0, nodeId: 'a-child' };
    const contextMenu: ContextMenu = { chatIndex: 1 };

    const chatIndex = resolveCompareChat(compareTarget, contextMenu, 0);
    expect(chatIndex).toBeNull();

    // Even if we tried to force chatIndex 0, node b-child doesn't exist in treeA
    expect(bothNodesExist(treeA, 'a-child', 'b-child')).toBe(false);
  });
});
