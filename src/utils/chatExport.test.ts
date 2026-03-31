import { describe, expect, it } from 'vitest';

import type { ChatInterface, BranchNode, ContentInterface } from '@type/chat';
import type { ContentStoreData } from './contentStore';
import {
  addContent,
  addContentDelta,
  buildExportContentStore,
  resolveContent,
} from './contentStore';
import { prepareChatForExport } from './chatExport';

const text = (t: string): ContentInterface[] => [{ type: 'text', text: t }];
const L = 'This is a fairly long text that simulates a real chat message with enough content to make delta compression worthwhile. It contains multiple sentences.';
const lt = (suffix: string): ContentInterface[] => [{ type: 'text', text: L + suffix }];

describe('prepareChatForExport', () => {
  it('keeps only the currently visible branch when requested', () => {
    const chat: ChatInterface = {
      id: 'chat-1',
      title: 'Branchy',
      messages: [],
      config: {
        model: 'test-model',
        max_tokens: 1000,
        temperature: 1,
        presence_penalty: 0,
        top_p: 1,
        frequency_penalty: 0,
        stream: true,
      },
      titleSet: false,
      imageDetail: 'auto',
      collapsedNodes: {
        root: true,
        hidden: true,
      },
      omittedNodes: {
        shown: true,
        hidden: true,
      },
      protectedNodes: {
        root: true,
        hidden: true,
      },
      branchTree: {
        rootId: 'root',
        activePath: ['root', 'shown'],
        nodes: {
          root: {
            id: 'root',
            parentId: null,
            role: 'user',
            contentHash: 'hash-root',
            createdAt: 1,
          },
          shown: {
            id: 'shown',
            parentId: 'root',
            role: 'assistant',
            contentHash: 'hash-shared',
            createdAt: 2,
          },
          hidden: {
            id: 'hidden',
            parentId: 'root',
            role: 'assistant',
            contentHash: 'hash-shared',
            createdAt: 3,
          },
        },
      },
    };

    const contentStore: ContentStoreData = {
      'hash-root': {
        content: [{ type: 'text', text: 'hello' }],
        refCount: 1,
      },
      'hash-shared': {
        content: [{ type: 'text', text: 'visible reply' }],
        refCount: 2,
      },
    };

    const prepared = prepareChatForExport(chat, contentStore, {
      visibleBranchOnly: true,
    });

    expect(prepared.chat.branchTree?.activePath).toEqual(['root', 'shown']);
    expect(Object.keys(prepared.chat.branchTree?.nodes ?? {})).toEqual(['root', 'shown']);
    expect(prepared.chat.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'visible reply' }] },
    ]);
    expect(prepared.chat.collapsedNodes).toEqual({ root: true });
    expect(prepared.chat.omittedNodes).toEqual({ shown: true });
    expect(prepared.chat.protectedNodes).toEqual({ root: true });
    expect(prepared.contentStore).toEqual({
      'hash-root': {
        content: [{ type: 'text', text: 'hello' }],
        refCount: 1,
      },
      'hash-shared': {
        content: [{ type: 'text', text: 'visible reply' }],
        refCount: 1,
      },
    });
  });
});

// ─── Delta Export Tests ───

describe('buildExportContentStore delta resolution', () => {
  it('resolves delta entries to full content, no delta in output', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const deltaHash = addContentDelta(store, lt(' exported'), baseHash);
    expect(store[deltaHash].delta).toBeDefined();

    const exported = buildExportContentStore(store);
    expect(exported[deltaHash].delta).toBeUndefined();
    expect(exported[deltaHash].content).toEqual(lt(' exported'));
    expect(exported[baseHash].delta).toBeUndefined();
  });
});

describe('prepareChatForExport with deltas', () => {
  it('includes only referenced hashes in exported contentStore', () => {
    const store: ContentStoreData = {};
    const h1 = addContent(store, text('used'));
    const h2 = addContent(store, text('unused'));

    const chat: ChatInterface = {
      id: 'c1',
      title: 'Test',
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      titleSet: false,
      imageDetail: 'auto',
      messages: [{ role: 'user', content: text('used') }],
      branchTree: {
        rootId: 'n0',
        activePath: ['n0'],
        nodes: {
          n0: { id: 'n0', parentId: null, role: 'user', contentHash: h1, createdAt: 0 },
        },
      },
    };

    const result = prepareChatForExport(chat, store);
    expect(result.contentStore[h1]).toBeDefined();
    expect(result.contentStore[h2]).toBeUndefined();
  });

  it('resolves deltas in exported content', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const deltaHash = addContentDelta(store, lt(' for-export'), baseHash);

    const chat: ChatInterface = {
      id: 'c1',
      title: 'Test',
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      titleSet: false,
      imageDetail: 'auto',
      messages: [{ role: 'user', content: lt(' for-export') }],
      branchTree: {
        rootId: 'n0',
        activePath: ['n0'],
        nodes: {
          n0: { id: 'n0', parentId: null, role: 'user', contentHash: deltaHash, createdAt: 0 },
        },
      },
    };

    const result = prepareChatForExport(chat, store);
    expect(result.contentStore[deltaHash].delta).toBeUndefined();
    expect(result.contentStore[deltaHash].content).toEqual(lt(' for-export'));
  });
});

describe('V3 export → import round-trip with branching', () => {
  it('branching chat survives export and re-import with full content', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(' msg1'));
    const deltaHash = addContentDelta(store, lt(' msg2'), baseHash);
    const altHash = addContent(store, lt(' alt'));

    const nodes: Record<string, BranchNode> = {
      n0: { id: 'n0', parentId: null, role: 'user', contentHash: baseHash, createdAt: 0 },
      n1: { id: 'n1', parentId: 'n0', role: 'assistant', contentHash: deltaHash, createdAt: 1 },
      n2: { id: 'n2', parentId: 'n0', role: 'assistant', contentHash: altHash, createdAt: 2 },
    };

    const chat: ChatInterface = {
      id: 'branching',
      title: 'Branch Test',
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      titleSet: false,
      imageDetail: 'auto',
      messages: [
        { role: 'user', content: lt(' msg1') },
        { role: 'assistant', content: lt(' msg2') },
      ],
      branchTree: { rootId: 'n0', activePath: ['n0', 'n1'], nodes },
    };

    // Export
    const exported = prepareChatForExport(chat, store);
    const v3 = {
      chats: [exported.chat],
      contentStore: exported.contentStore,
      folders: {},
      version: 3,
    };

    // All content fully resolved
    for (const entry of Object.values(v3.contentStore)) {
      expect(entry.delta).toBeUndefined();
    }

    // All nodes resolvable
    const tree = v3.chats[0].branchTree!;
    for (const node of Object.values(tree.nodes)) {
      expect(v3.contentStore[node.contentHash]).toBeDefined();
      expect(v3.contentStore[node.contentHash].content.length).toBeGreaterThan(0);
    }

    // Branch structure preserved
    expect(Object.keys(tree.nodes)).toHaveLength(3);
    expect(tree.nodes['n1'].parentId).toBe('n0');
    expect(tree.nodes['n2'].parentId).toBe('n0');
  });
});
