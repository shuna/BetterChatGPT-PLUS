/**
 * Tests for startup sequence and recovery paths assuming local data exists.
 *
 * Covers:
 * - IndexedDB load success / failure with existing data
 * - Invalid currentChatIndex recovery
 * - Rehydration of corrupt / streaming-marker branch trees
 * - Stream recovery with stale / interrupted / proxy scenarios
 * - Persistence round-trip
 * - Rendering failure scenarios
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@utils/showToast', () => ({ showToast: vi.fn() }));

// --- persistence helpers ---
import {
  applyPersistedChatDataState,
  rehydrateStoreState,
  createPersistedChatDataState,
} from '@store/persistence';
import {
  clearStreamingBuffersForTest,
  createStreamingContentHash,
  initializeStreamingBuffer,
} from '@utils/streamingBuffer';
import { addContent } from '@utils/contentStore';
import type { ChatInterface } from '@type/chat';
import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';

// --- stream recovery helpers ---
import {
  resolveRecoveryStatus,
  shouldApplyRecoveredText,
  buildRecoveredMessage,
  findRecoverableChat,
  hasRecoverableMessage,
  getCurrentMessageText,
} from './streamRecoveryHelpers';
import type { StreamRecord } from '@utils/streamDb';

// ─── Test Data Factories ───

const makeContentStore = () => {
  const contentStore = {};
  const userHash = addContent(contentStore, [{ type: 'text', text: 'こんにちは' }]);
  const assistantHash = addContent(contentStore, [{ type: 'text', text: '回答テキスト' }]);
  return { contentStore, userHash, assistantHash };
};

const makeChatWithBranchTree = (
  id: string,
  contentStore: Record<string, any>,
  userHash: string,
  assistantHash: string
): ChatInterface => ({
  id,
  title: `Chat ${id}`,
  titleSet: true,
  config: { ..._defaultChatConfig },
  imageDetail: _defaultImageDetail,
  messages: [],
  branchTree: {
    rootId: 'n1',
    activePath: ['n1', 'n2'],
    nodes: {
      n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
      n2: { id: 'n2', parentId: 'n1', role: 'assistant', contentHash: assistantHash, createdAt: 2 },
    },
  },
});

const makePlainChat = (id: string): ChatInterface => ({
  id,
  title: `Plain ${id}`,
  titleSet: false,
  config: { ..._defaultChatConfig },
  imageDetail: _defaultImageDetail,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
});

const makeStreamRecord = (overrides: Partial<StreamRecord> = {}): StreamRecord => ({
  requestId: 'req-1',
  chatIndex: 0,
  messageIndex: 1,
  bufferedText: '',
  status: 'streaming',
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now() - 60_000,
  acknowledged: false,
  ...overrides,
});

// ─── Startup: Rehydration & Data Loading ───

describe('Startup: rehydration with existing local data', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  it('materializes branch-tree messages from existing contentStore during rehydration', () => {
    const { contentStore, userHash, assistantHash } = makeContentStore();
    const chat = makeChatWithBranchTree('chat-1', contentStore, userHash, assistantHash);
    const state = {
      chats: [chat],
      contentStore,
      currentChatIndex: 0,
    } as any;

    localStorage.setItem('currentChatIndex', '0');
    rehydrateStoreState(state);

    expect(state.chats[0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'こんにちは' }] },
      { role: 'assistant', content: [{ type: 'text', text: '回答テキスト' }] },
    ]);
  });

  it('recovers from out-of-range currentChatIndex', () => {
    const chat = makePlainChat('c1');
    const state = { chats: [chat], contentStore: {}, currentChatIndex: 999 } as any;
    localStorage.setItem('currentChatIndex', '999');

    rehydrateStoreState(state);

    expect(state.currentChatIndex).toBe(0);
  });

  it('handles negative currentChatIndex', () => {
    const chat = makePlainChat('c1');
    const state = { chats: [chat], contentStore: {}, currentChatIndex: -1 } as any;
    localStorage.setItem('currentChatIndex', '-5');

    rehydrateStoreState(state);

    expect(state.currentChatIndex).toBe(0);
  });

  it('handles NaN currentChatIndex from corrupted localStorage', () => {
    const chat = makePlainChat('c1');
    const state = { chats: [chat], contentStore: {}, currentChatIndex: -1 } as any;
    localStorage.setItem('currentChatIndex', 'not-a-number');

    rehydrateStoreState(state);

    expect(state.currentChatIndex).toBe(0);
  });

  it('initializes empty messages array for chats missing messages', () => {
    const state = {
      chats: [{ id: 'c1', title: 'test', config: _defaultChatConfig } as any],
      contentStore: {},
      currentChatIndex: 0,
    } as any;
    localStorage.setItem('currentChatIndex', '0');

    rehydrateStoreState(state);

    expect(state.chats[0].messages).toEqual([]);
  });
});

// ─── Startup: Corrupt branch tree recovery ───

describe('Startup: corrupt branch tree recovery', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  it('repairs missing rootId by falling back to first available node', () => {
    const { contentStore, userHash, assistantHash } = makeContentStore();
    const chat: ChatInterface = {
      id: 'c1',
      title: 'Broken root',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'nonexistent',
        activePath: ['n1', 'n2'],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
          n2: { id: 'n2', parentId: 'n1', role: 'assistant', contentHash: assistantHash, createdAt: 2 },
        },
      },
    };
    const state = { chats: [chat], contentStore, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    const repaired = rehydrateStoreState(state);

    expect(repaired).toBe(true);
    expect(state.chats[0].branchTree.rootId).not.toBe('nonexistent');
  });

  it('repairs empty activePath by rebuilding from root', () => {
    const { contentStore, userHash, assistantHash } = makeContentStore();
    const chat: ChatInterface = {
      id: 'c1',
      title: 'Empty path',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'n1',
        activePath: [],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
          n2: { id: 'n2', parentId: 'n1', role: 'assistant', contentHash: assistantHash, createdAt: 2 },
        },
      },
    };
    const state = { chats: [chat], contentStore, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    const repaired = rehydrateStoreState(state);

    expect(repaired).toBe(true);
    expect(state.chats[0].branchTree.activePath.length).toBeGreaterThan(0);
    expect(state.chats[0].messages.length).toBeGreaterThan(0);
  });

  it('replaces orphaned streaming markers with empty content', () => {
    const { contentStore, userHash } = makeContentStore();
    const streamHash = createStreamingContentHash('n2');
    const chat: ChatInterface = {
      id: 'c1',
      title: 'Streaming marker',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'n1',
        activePath: ['n1', 'n2'],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
          n2: { id: 'n2', parentId: 'n1', role: 'assistant', contentHash: streamHash, createdAt: 2 },
        },
      },
    };
    const state = { chats: [chat], contentStore, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    rehydrateStoreState(state);

    const node2Hash = state.chats[0].branchTree.nodes.n2.contentHash;
    expect(node2Hash.startsWith('__streaming:')).toBe(false);
    expect(contentStore[node2Hash]?.content).toEqual([]);
  });

  it('does not crash when branchTree nodes is null/undefined', () => {
    const chat: ChatInterface = {
      id: 'c1',
      title: 'Null nodes',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'n1',
        activePath: ['n1'],
        nodes: null as any,
      },
    };
    const state = { chats: [chat], contentStore: {}, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    expect(() => rehydrateStoreState(state)).not.toThrow();
    expect(state.chats[0].branchTree.nodes).toEqual({});
  });

  it('handles completely empty branchTree (no nodes, empty root)', () => {
    const chat: ChatInterface = {
      id: 'c1',
      title: 'Empty tree',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: '',
        activePath: [],
        nodes: {},
      },
    };
    const state = { chats: [chat], contentStore: {}, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    expect(() => rehydrateStoreState(state)).not.toThrow();
  });
});

// ─── Startup: applyPersistedChatDataState ───

describe('Startup: applyPersistedChatDataState', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  it('applies chat data from IndexedDB to store state', () => {
    const { contentStore, userHash, assistantHash } = makeContentStore();
    const chat = makeChatWithBranchTree('c1', contentStore, userHash, assistantHash);

    const targetState = {
      chats: undefined,
      contentStore: {},
      branchClipboard: null,
      currentChatIndex: -1,
    } as any;
    localStorage.setItem('currentChatIndex', '0');

    applyPersistedChatDataState(targetState, {
      chats: [chat],
      contentStore,
      branchClipboard: null,
    });

    expect(targetState.chats).toHaveLength(1);
    expect(targetState.chats[0].messages.length).toBe(2);
    expect(targetState.currentChatIndex).toBe(0);
  });

  it('handles empty persisted chat data gracefully', () => {
    const targetState = {
      chats: undefined,
      contentStore: {},
      branchClipboard: null,
      currentChatIndex: -1,
    } as any;
    localStorage.setItem('currentChatIndex', '0');

    applyPersistedChatDataState(targetState, {
      chats: [],
      contentStore: {},
      branchClipboard: null,
    });

    expect(targetState.chats).toEqual([]);
  });

  it('applies persisted data even when contentStore is missing', () => {
    const chat = makePlainChat('c1');
    const targetState = {
      chats: undefined,
      contentStore: {},
      branchClipboard: null,
      currentChatIndex: -1,
    } as any;
    localStorage.setItem('currentChatIndex', '0');

    applyPersistedChatDataState(targetState, {
      chats: [chat],
      contentStore: undefined as any,
      branchClipboard: null,
    });

    expect(targetState.chats).toHaveLength(1);
    expect(targetState.contentStore).toEqual({});
  });
});

// ─── Stream Recovery: proxy scenarios (complements streamRecoveryHelpers.test.ts) ───

describe('Stream recovery: proxy-aware status resolution', () => {
  const base: StreamRecord = makeStreamRecord();

  it('returns streaming-with-proxy when proxy session exists and still streaming', () => {
    const now = Date.now();
    expect(
      resolveRecoveryStatus(
        { ...base, status: 'streaming', proxySessionId: 'proxy-abc', updatedAt: now - 5000 },
        now
      )
    ).toBe('streaming-with-proxy');
  });

  it('returns streaming-with-proxy even when stale if proxy session exists', () => {
    const now = Date.now();
    expect(
      resolveRecoveryStatus(
        { ...base, status: 'streaming', proxySessionId: 'proxy-abc', updatedAt: now - 60000 },
        now
      )
    ).toBe('streaming-with-proxy');
  });

  it('returns interrupted for stale stream without proxy', () => {
    const now = Date.now();
    expect(
      resolveRecoveryStatus(
        { ...base, status: 'streaming', updatedAt: now - 60000 },
        now
      )
    ).toBe('interrupted');
  });
});

// ─── Stream Recovery: additional edge cases ───

describe('Stream recovery: text application edge cases', () => {
  it('does not apply when buffered text is exactly same length', () => {
    expect(shouldApplyRecoveredText('abcd', 'efgh')).toBe(false);
  });

  it('does not apply empty buffered text over empty current', () => {
    expect(shouldApplyRecoveredText('', '')).toBe(false);
  });
});

describe('Stream recovery: buildRecoveredMessage edge cases', () => {
  it('handles message with empty content array by prepending text', () => {
    const msg = { role: 'assistant' as const, content: [] };
    const result = buildRecoveredMessage(msg, 'recovered');
    expect(result.content[0]).toEqual({ type: 'text', text: 'recovered' });
  });
});

describe('Stream recovery: findRecoverableChat edge cases', () => {
  it('returns null for empty chats array', () => {
    expect(findRecoverableChat([], 0)).toBeNull();
  });

  it('returns correct chat for last valid index', () => {
    const chats = [makePlainChat('c0'), makePlainChat('c1')];
    expect(findRecoverableChat(chats, 1)?.id).toBe('c1');
  });

  it('returns null for index exactly at array length', () => {
    const chats = [makePlainChat('c0')];
    expect(findRecoverableChat(chats, 1)).toBeNull();
  });
});

describe('Stream recovery: hasRecoverableMessage edge cases', () => {
  it('returns false for chat with empty messages array', () => {
    const chat = { id: 'c', messages: [] } as any;
    expect(hasRecoverableMessage(chat, 0)).toBe(false);
  });

  it('returns true for last message index', () => {
    const chat = {
      id: 'c',
      messages: [
        { role: 'user', content: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      ],
    } as any;
    expect(hasRecoverableMessage(chat, 1)).toBe(true);
  });
});

// ─── Rendering failure scenarios ───

describe('Rendering failure scenarios', () => {
  it('getCurrentMessageText throws for message with undefined content (corrupted data)', () => {
    const msg = { role: 'assistant', content: undefined } as any;
    expect(() => getCurrentMessageText(msg)).toThrow();
  });

  it('getCurrentMessageText returns empty for message with only image content', () => {
    const msg = {
      role: 'assistant',
      content: [{ type: 'image_url', image_url: { url: 'data:...' } }],
    } as any;
    expect(getCurrentMessageText(msg)).toBe('');
  });

  it('rehydration does not crash with multiple broken chats', () => {
    clearStreamingBuffersForTest();
    const { contentStore, userHash } = makeContentStore();

    const brokenChat1: ChatInterface = {
      id: 'broken1',
      title: 'Broken 1',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'ghost',
        activePath: ['ghost', 'phantom'],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
        },
      },
    };

    const brokenChat2: ChatInterface = {
      id: 'broken2',
      title: 'Broken 2',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: undefined as any,
    };

    const goodChat = makePlainChat('good');

    const state = {
      chats: [brokenChat1, brokenChat2, goodChat],
      contentStore,
      currentChatIndex: 0,
    } as any;
    localStorage.setItem('currentChatIndex', '0');

    expect(() => rehydrateStoreState(state)).not.toThrow();
    expect(state.chats[2].messages[0].content[0].text).toBe('hello');
  });

  it('rehydration handles chat with activePath referencing missing contentHash', () => {
    clearStreamingBuffersForTest();
    const contentStore = {};
    const validHash = addContent(contentStore, [{ type: 'text', text: 'ok' }]);

    const chat: ChatInterface = {
      id: 'c1',
      title: 'Missing hash',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'n1',
        activePath: ['n1', 'n2'],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: validHash, createdAt: 1 },
          n2: { id: 'n2', parentId: 'n1', role: 'assistant', contentHash: 'nonexistent-hash', createdAt: 2 },
        },
      },
    };

    const state = { chats: [chat], contentStore, currentChatIndex: 0 } as any;
    localStorage.setItem('currentChatIndex', '0');

    expect(() => rehydrateStoreState(state)).not.toThrow();
  });
});

// ─── Persistence round-trip with local data ───

describe('Persistence: round-trip with local data', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  it('creates persisted chat data that preserves branch tree structure', () => {
    const { contentStore, userHash, assistantHash } = makeContentStore();
    const chat = makeChatWithBranchTree('c1', contentStore, userHash, assistantHash);
    const state = {
      chats: [chat],
      contentStore,
      branchClipboard: null,
    } as any;

    const persisted = createPersistedChatDataState(state);

    expect(persisted.chats?.[0].messages).toBeUndefined();
    expect(persisted.chats?.[0].branchTree).toBeTruthy();
    expect(persisted.contentStore).toBeTruthy();
  });

  it('finalizes streaming buffers during persistence snapshot', () => {
    const { contentStore, userHash } = makeContentStore();
    const streamHash = createStreamingContentHash('sn1');
    initializeStreamingBuffer('sn1', [{ type: 'text', text: 'buffered data' }]);

    const chat: ChatInterface = {
      id: 'c1',
      title: 'Streaming',
      titleSet: false,
      config: { ..._defaultChatConfig },
      imageDetail: _defaultImageDetail,
      messages: [],
      branchTree: {
        rootId: 'n1',
        activePath: ['n1', 'sn1'],
        nodes: {
          n1: { id: 'n1', parentId: null, role: 'user', contentHash: userHash, createdAt: 1 },
          sn1: { id: 'sn1', parentId: 'n1', role: 'assistant', contentHash: streamHash, createdAt: 2 },
        },
      },
    };

    const state = { chats: [chat], contentStore, branchClipboard: null } as any;
    const persisted = createPersistedChatDataState(state);

    const persistedNode = persisted.chats?.[0].branchTree?.nodes['sn1'];
    expect(persistedNode?.contentHash.startsWith('__streaming:')).toBe(false);
  });
});
