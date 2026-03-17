import { describe, expect, it } from 'vitest';
import {
  collectReferencedHashes,
  buildSupersetForCommit,
  runResidualGC,
} from './IndexedDbStorage';
import type { ContentStoreData } from '@utils/contentStore';
import type { BranchClipboard, BranchNode } from '@type/chat';

// Minimal chat-like objects for testing
const makeChat = (id: string, contentHashes: string[]) => ({
  id,
  title: 'test',
  config: {} as any,
  titleSet: false,
  imageDetail: 'auto' as const,
  branchTree: {
    rootId: 'n0',
    activePath: ['n0'],
    nodes: Object.fromEntries(
      contentHashes.map((h, i) => [
        `n${i}`,
        { id: `n${i}`, parentId: i > 0 ? `n${i - 1}` : null, role: 'user', contentHash: h, createdAt: 0 } as BranchNode,
      ])
    ),
  },
});

const makeClipboard = (contentHashes: string[]): BranchClipboard => ({
  nodeIds: contentHashes.map((_, i) => `cn${i}`),
  sourceChat: 'src',
  nodes: Object.fromEntries(
    contentHashes.map((h, i) => [
      `cn${i}`,
      { id: `cn${i}`, parentId: null, role: 'user', contentHash: h, createdAt: 0 } as BranchNode,
    ])
  ),
});

describe('collectReferencedHashes', () => {
  it('collects hashes from chats and clipboard', () => {
    const chats = [makeChat('c1', ['h1', 'h2']), makeChat('c2', ['h3'])];
    const clipboard = makeClipboard(['h2', 'h4']);
    const refs = collectReferencedHashes(chats, clipboard);
    expect(refs).toEqual(new Set(['h1', 'h2', 'h3', 'h4']));
  });

  it('handles null clipboard', () => {
    const chats = [makeChat('c1', ['h1'])];
    const refs = collectReferencedHashes(chats, null);
    expect(refs).toEqual(new Set(['h1']));
  });

  it('handles empty chats', () => {
    const refs = collectReferencedHashes([], null);
    expect(refs).toEqual(new Set());
  });
});

describe('buildSupersetForCommit', () => {
  it('returns a shallow copy of the current store', () => {
    const currentStore: ContentStoreData = {
      h1: { content: [{ type: 'text', text: 'a' }], refCount: 1 },
      h2: { content: [{ type: 'text', text: 'b' }], refCount: 0 },
    };
    const result = buildSupersetForCommit(currentStore);
    expect(Object.keys(result).sort()).toEqual(['h1', 'h2']);
    // Entries with refCount=0 are retained (deferred GC)
    expect(result.h2.refCount).toBe(0);
    // Should be a different object
    expect(result).not.toBe(currentStore);
  });

  it('preserves entries with refCount <= 0 for crash safety', () => {
    const currentStore: ContentStoreData = {
      h1: { content: [{ type: 'text', text: 'a' }], refCount: 1 },
      h2: { content: [{ type: 'text', text: 'b' }], refCount: 0 },
      h3: { content: [{ type: 'text', text: 'c' }], refCount: -1 },
    };
    const result = buildSupersetForCommit(currentStore);
    // All entries retained — GC is deferred to after commit
    expect(Object.keys(result).sort()).toEqual(['h1', 'h2', 'h3']);
  });
});

describe('runResidualGC', () => {
  it('removes unreferenced entries', () => {
    const store: ContentStoreData = {
      h1: { content: [{ type: 'text', text: 'a' }], refCount: 1 },
      h2: { content: [{ type: 'text', text: 'b' }], refCount: 0 },
      h3: { content: [{ type: 'text', text: 'c' }], refCount: 1 },
    };
    const chats = [makeChat('c1', ['h1'])];
    const result = runResidualGC(store, chats, null);
    expect(Object.keys(result)).toEqual(['h1']);
  });

  it('keeps delta base entries even if not directly referenced', () => {
    const store: ContentStoreData = {
      base: { content: [{ type: 'text', text: 'base' }], refCount: 1 },
      delta1: {
        content: [],
        refCount: 1,
        delta: { baseHash: 'base', patches: 'some-patch' },
      },
    };
    // Only delta1 is directly referenced
    const chats = [makeChat('c1', ['delta1'])];
    const result = runResidualGC(store, chats, null);
    expect(result).toHaveProperty('base');
    expect(result).toHaveProperty('delta1');
  });

  it('keeps entries referenced by clipboard', () => {
    const store: ContentStoreData = {
      h1: { content: [{ type: 'text', text: 'a' }], refCount: 1 },
      h2: { content: [{ type: 'text', text: 'b' }], refCount: 1 },
    };
    const clipboard = makeClipboard(['h2']);
    const result = runResidualGC(store, [], clipboard);
    expect(Object.keys(result)).toEqual(['h2']);
  });

  it('handles deep delta chains', () => {
    const store: ContentStoreData = {
      base: { content: [{ type: 'text', text: 'base' }], refCount: 1 },
      d1: { content: [], refCount: 1, delta: { baseHash: 'base', patches: 'p1' } },
      d2: { content: [], refCount: 1, delta: { baseHash: 'd1', patches: 'p2' } },
      d3: { content: [], refCount: 1, delta: { baseHash: 'd2', patches: 'p3' } },
    };
    const chats = [makeChat('c1', ['d3'])];
    const result = runResidualGC(store, chats, null);
    expect(Object.keys(result).sort()).toEqual(['base', 'd1', 'd2', 'd3']);
  });
});
