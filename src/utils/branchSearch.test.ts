import { describe, expect, it, vi } from 'vitest';

import type { BranchTree } from '@type/chat';
import type { ContentStoreData } from './contentStore';
import { searchBranchNodes } from './branchSearch';

/** Helper: build a minimal ContentStoreData from a hash→text map */
function buildContentStore(entries: Record<string, string>): ContentStoreData {
  const store: ContentStoreData = {};
  for (const [hash, text] of Object.entries(entries)) {
    store[hash] = {
      content: [{ type: 'text', text }],
    };
  }
  return store;
}

describe('searchBranchNodes – orphaned pinned subtrees after prune', () => {
  /**
   * Scenario: prune removed the parent of a pinned node, so the pinned node
   * now has parentId pointing to a node that no longer exists in the tree.
   * The search should still find the orphaned pinned subtree.
   */
  it('includes pinned orphan subtrees (parentId=null) in scope=all search', () => {
    const tree: BranchTree = {
      rootId: 'root',
      activePath: ['root', 'child-a'],
      nodes: {
        root: {
          id: 'root',
          parentId: null,
          role: 'user',
          contentHash: 'h-root',
          createdAt: 1,
        },
        'child-a': {
          id: 'child-a',
          parentId: 'root',
          role: 'assistant',
          contentHash: 'h-child-a',
          createdAt: 2,
        },
        // Orphaned pinned node – parent was pruned, so parentId is null
        'orphan-pinned': {
          id: 'orphan-pinned',
          parentId: null,
          role: 'user',
          contentHash: 'h-orphan',
          createdAt: 3,
          pinned: true,
          starred: true,
        },
        // Child of the orphan – should also be found
        'orphan-child': {
          id: 'orphan-child',
          parentId: 'orphan-pinned',
          role: 'assistant',
          contentHash: 'h-orphan-child',
          createdAt: 4,
        },
      },
    };

    const contentStore = buildContentStore({
      'h-root': 'Hello world',
      'h-child-a': 'Response A',
      'h-orphan': 'Orphan pinned content',
      'h-orphan-child': 'Orphan child content',
    });

    // Search for "orphan" – should find both orphan nodes
    const results = searchBranchNodes(
      'orphan',
      [{ tree, chatIndex: 0 }],
      contentStore,
      'all'
    );

    const foundIds = results.map((r) => r.nodeId);
    expect(foundIds).toContain('orphan-pinned');
    expect(foundIds).toContain('orphan-child');
  });

  it('includes pinned subtrees whose parentId references a deleted node in scope=all', () => {
    const tree: BranchTree = {
      rootId: 'root',
      activePath: ['root'],
      nodes: {
        root: {
          id: 'root',
          parentId: null,
          role: 'user',
          contentHash: 'h-root',
          createdAt: 1,
        },
        // parentId references 'deleted-parent' which is NOT in tree.nodes
        'orphan-pinned': {
          id: 'orphan-pinned',
          parentId: 'deleted-parent',
          role: 'assistant',
          contentHash: 'h-orphan',
          createdAt: 2,
          pinned: true,
        },
      },
    };

    const contentStore = buildContentStore({
      'h-root': 'Root message',
      'h-orphan': 'Dangling ref pinned node',
    });

    const results = searchBranchNodes(
      'dangling',
      [{ tree, chatIndex: 0 }],
      contentStore,
      'all'
    );

    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe('orphan-pinned');
  });

  it('starredOnly filter finds starred nodes in orphan subtrees', () => {
    const tree: BranchTree = {
      rootId: 'root',
      activePath: ['root'],
      nodes: {
        root: {
          id: 'root',
          parentId: null,
          role: 'user',
          contentHash: 'h-root',
          createdAt: 1,
        },
        'orphan-starred': {
          id: 'orphan-starred',
          parentId: null,
          role: 'assistant',
          contentHash: 'h-orphan',
          createdAt: 2,
          pinned: true,
          starred: true,
        },
      },
    };

    const contentStore = buildContentStore({
      'h-root': 'Root',
      'h-orphan': 'Starred orphan',
    });

    // Empty query + starredOnly should return only starred nodes
    const results = searchBranchNodes(
      '',
      [{ tree, chatIndex: 0 }],
      contentStore,
      'all',
      { starredOnly: true }
    );

    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe('orphan-starred');
    expect(results[0].starred).toBe(true);
  });
});
