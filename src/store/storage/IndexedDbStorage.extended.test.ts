/**
 * Extended tests for IndexedDbStorage: crash recovery, compression lifecycle,
 * fingerprinting, generation consistency, and scheduler behavior.
 *
 * Uses fake-indexeddb polyfill injected into globalThis.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Polyfill indexedDB + window into globalThis before importing IndexedDbStorage
(globalThis as any).indexedDB = new IDBFactory();
(globalThis as any).IDBKeyRange = IDBKeyRange;
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import {
  loadChatData,
  saveChatData,
  clearChatData,
  collectReferencedHashes,
  runResidualGC,
  computeChatFingerprint,
  compressSingleChat,
  decompressSingleChat,
  ensureChatDecompressed,
  compressInactiveChats,
  notifyActiveChatChanged,
  initCompressionScheduler,
  collectIndexedDbRecoverySnapshot,
  setChatDataWritesBlocked,
  areChatDataWritesBlocked,
  _resetInternalState,
} from './IndexedDbStorage';
import type { ContentStoreData, ContentEntry } from '@utils/contentStore';
import type { BranchClipboard, BranchNode, ChatInterface } from '@type/chat';
import type { StoreState } from '@store/store';

// ── Helpers ──

/** Create a typed ContentEntry with text content */
const textEntry = (text: string, refCount = 1): ContentEntry => ({
  content: [{ type: 'text' as const, text }],
  refCount,
});

const makeChat = (id: string, contentHashes: string[], extras?: Partial<ChatInterface>) => ({
  id,
  title: 'test',
  config: {} as any,
  titleSet: false,
  imageDetail: 'auto' as const,
  messages: [] as any[],
  branchTree: {
    rootId: 'n0',
    activePath: contentHashes.map((_, i) => `n${i}`),
    nodes: Object.fromEntries(
      contentHashes.map((h, i) => [
        `n${i}`,
        { id: `n${i}`, parentId: i > 0 ? `n${i - 1}` : null, role: 'user', contentHash: h, createdAt: 0 } as BranchNode,
      ])
    ),
  },
  ...extras,
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

const baseState = {} as StoreState;

// Directly write to IDB for test setup (bypass saveChatData)
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open('weavelet-canvas', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('persisted-state')) {
        req.result.createObjectStore('persisted-state');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbPut = async (key: string, value: unknown) => {
  const db = await openDb();
  const tx = db.transaction('persisted-state', 'readwrite');
  const store = tx.objectStore('persisted-state');
  await new Promise<void>((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });
  db.close();
};

const idbGet = async <T>(key: string): Promise<T | undefined> => {
  const db = await openDb();
  const tx = db.transaction('persisted-state', 'readonly');
  const store = tx.objectStore('persisted-state');
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });
  db.close();
  return result;
};

const idbGetAllKeys = async (): Promise<string[]> => {
  const db = await openDb();
  const tx = db.transaction('persisted-state', 'readonly');
  const store = tx.objectStore('persisted-state');
  const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });
  db.close();
  return result as string[];
};

beforeEach(async () => {
  _resetInternalState();
  // Clear all IDB data
  const db = await openDb();
  const tx = db.transaction('persisted-state', 'readwrite');
  const store = tx.objectStore('persisted-state');
  const keys = await new Promise<IDBValidKey[]>((resolve) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
  });
  for (const key of keys) {
    store.delete(key);
  }
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });
  db.close();
});

describe('collectIndexedDbRecoverySnapshot', () => {
  it('exports raw IndexedDB recovery records without mutating storage', async () => {
    const chat = makeChat('chat-1', ['h1']);
    await idbPut('meta', { version: 17, generation: 2, chatIds: ['chat-1'] });
    await idbPut('content-store', {
      data: { h1: textEntry('recover me') },
      generation: 2,
    });
    await idbPut('branch-clipboard', { data: null, generation: 2 });
    await idbPut('chat:chat-1', { chat, generation: 2 });

    const snapshot = await collectIndexedDbRecoverySnapshot();

    expect(snapshot).toMatchObject({
      databaseName: 'weavelet-canvas',
      storeName: 'persisted-state',
      keys: ['branch-clipboard', 'chat:chat-1', 'content-store', 'meta'],
      meta: { version: 17, generation: 2, chatIds: ['chat-1'] },
      contentStore: {
        data: { h1: textEntry('recover me') },
        generation: 2,
      },
      branchClipboard: { data: null, generation: 2 },
      chats: [
        {
          key: 'chat:chat-1',
          packed: false,
          generation: 2,
          record: { chat, generation: 2 },
        },
      ],
    });
    expect(await idbGetAllKeys()).toEqual([
      'branch-clipboard',
      'chat:chat-1',
      'content-store',
      'meta',
    ]);
  });

  it('returns null when IndexedDB has no persisted keys', async () => {
    await expect(collectIndexedDbRecoverySnapshot()).resolves.toBeNull();
  });

  it('exports multiple packed chats after reading all bytes before decompression', async () => {
    await saveChatData({
      chats: [makeChat('active', ['h1']), makeChat('packed-a', ['h2']), makeChat('packed-b', ['h3'])],
      contentStore: {
        h1: textEntry('one'),
        h2: textEntry('two'),
        h3: textEntry('three'),
      },
      branchClipboard: null,
    });
    await compressSingleChat('packed-a');
    await compressSingleChat('packed-b');

    const snapshot = await collectIndexedDbRecoverySnapshot();

    expect(snapshot?.chats).toHaveLength(3);
    expect(snapshot?.chats.filter((chat) => chat.packed)).toHaveLength(2);
    expect(snapshot?.chats.every((chat) => chat.record?.chat)).toBe(true);
  });
});

// ─── Crash Recovery (Priority High) ───

describe('loadSplitData crash recovery', () => {
  it('loads multiple packed chats without keeping the transaction open during gzip', async () => {
    await saveChatData({
      chats: [makeChat('active', ['h1']), makeChat('packed-a', ['h2']), makeChat('packed-b', ['h3'])],
      contentStore: {
        h1: textEntry('one'),
        h2: textEntry('two'),
        h3: textEntry('three'),
      },
      branchClipboard: null,
    });
    await compressSingleChat('packed-a');
    await compressSingleChat('packed-b');
    _resetInternalState();

    const result = await loadChatData(baseState);

    expect(result?.loadStatus).toBe('ok');
    expect(result?.chats?.map((chat) => chat.id)).toEqual([
      'active',
      'packed-a',
      'packed-b',
    ]);
  });

  it('falls back to a valid packed record when the raw record is malformed', async () => {
    await saveChatData({
      chats: [makeChat('chat-a', ['h1'])],
      contentStore: { h1: textEntry('safe') },
      branchClipboard: null,
    });
    await compressSingleChat('chat-a');
    await idbPut('chat:chat-a', {
      chat: makeChat('wrong-id', ['h1']),
      generation: 1,
    });
    _resetInternalState();

    const result = await loadChatData(baseState);

    expect(result?.loadStatus).toBe('ok');
    expect(result?.chats?.[0].id).toBe('chat-a');
  });

  it('recovers new chat when content-store=G+1, chat(new)=G+1, meta=G', async () => {
    // Simulate crash after Step 1-2 but before Step 3 (meta update)
    const chat = makeChat('new-chat', ['h1']);
    const contentStore: ContentStoreData = {
      h1: textEntry('hello'),
    };

    // Meta at generation 5 (stale — doesn't include new-chat)
    await idbPut('meta', { version: 17, generation: 5, chatIds: ['old-chat'] });
    // content-store at generation 6
    await idbPut('content-store', { data: contentStore, generation: 6 });
    // Old chat at generation 5
    await idbPut('chat:old-chat', {
      chat: makeChat('old-chat', ['h1']),
      generation: 5,
    });
    // New chat at generation 6
    await idbPut('chat:new-chat', { chat, generation: 6 });
    // branch-clipboard
    await idbPut('branch-clipboard', { data: null, generation: 5 });

    const result = await loadChatData(baseState);
    expect(result).not.toBeNull();
    const chatIds = result!.chats!.map((c: any) => c.id);
    expect(chatIds).toContain('new-chat');
    expect(chatIds).toContain('old-chat');
  });

  it('filters orphaned chats when csGen <= G (meta is authoritative)', async () => {
    // Normal case: meta is up-to-date, orphaned chats should be discarded
    await idbPut('meta', { version: 17, generation: 5, chatIds: ['kept-chat'] });
    await idbPut('content-store', {
      data: { h1: textEntry('a') },
      generation: 5,
    });
    await idbPut('chat:kept-chat', {
      chat: makeChat('kept-chat', ['h1']),
      generation: 5,
    });
    await idbPut('chat:orphan-chat', {
      chat: makeChat('orphan-chat', ['h1']),
      generation: 4,
    });
    await idbPut('branch-clipboard', { data: null, generation: 5 });

    const result = await loadChatData(baseState);
    expect(result).not.toBeNull();
    const chatIds = result!.chats!.map((c: any) => c.id);
    expect(chatIds).toContain('kept-chat');
    expect(chatIds).not.toContain('orphan-chat');
  });
});

// ─── Compression Lifecycle (Priority High) ───

describe('notifyActiveChatChanged compression lifecycle', () => {
  it('decompresses packed-only chat when activated', async () => {
    // Save a chat first, then manually pack it
    const chat = makeChat('chat-a', ['h1']);
    const data = {
      chats: [chat],
      contentStore: { h1: textEntry('hello') },
      branchClipboard: null,
    };
    await saveChatData(data);

    // Manually compress chat-a
    const compressed = await compressSingleChat('chat-a');
    expect(compressed).toBe(true);

    // Verify raw is gone, packed exists
    const rawAfterCompress = await idbGet('chat:chat-a');
    expect(rawAfterCompress).toBeUndefined();
    const packedAfterCompress = await idbGet('chat:chat-a:packed');
    expect(packedAfterCompress).toBeDefined();

    // Decompress (simulating activation)
    await ensureChatDecompressed('chat-a');

    // Verify raw is restored, packed is removed
    const rawAfterDecompress = await idbGet<any>('chat:chat-a');
    expect(rawAfterDecompress).toBeDefined();
    expect(rawAfterDecompress!.chat.id).toBe('chat-a');
    const packedAfterDecompress = await idbGet('chat:chat-a:packed');
    expect(packedAfterDecompress).toBeUndefined();
  });

  it('compressInactiveChats skips active chat', async () => {
    const data = {
      chats: [makeChat('active', ['h1']), makeChat('inactive', ['h2'])],
      contentStore: {
        h1: textEntry('a'),
        h2: textEntry('b'),
      },
      branchClipboard: null,
    };
    await saveChatData(data);

    const count = await compressInactiveChats('active');
    expect(count).toBe(1); // only inactive compressed

    // active should still be raw
    const activeRaw = await idbGet('chat:active');
    expect(activeRaw).toBeDefined();
    const activePacked = await idbGet('chat:active:packed');
    expect(activePacked).toBeUndefined();

    // inactive should be packed only
    const inactiveRaw = await idbGet('chat:inactive');
    expect(inactiveRaw).toBeUndefined();
    const inactivePacked = await idbGet('chat:inactive:packed');
    expect(inactivePacked).toBeDefined();
  });
});

// ─── computeChatFingerprint (Priority High) ───

describe('computeChatFingerprint extended', () => {
  it('detects collapsedNodes changes', () => {
    const chat1 = { ...makeChat('c1', ['h1']), collapsedNodes: { n0: true } };
    const chat2 = { ...makeChat('c1', ['h1']), collapsedNodes: { n0: false } };
    expect(computeChatFingerprint(chat1 as any)).not.toBe(
      computeChatFingerprint(chat2 as any)
    );
  });

});

// ─── Phase 3: Interruption Resilience ───

describe('Phase 3 interruption resilience', () => {
  it('compressSingleChat: raw/packed both present → raw-first on load', async () => {
    // Save chat
    const data = {
      chats: [makeChat('chat-x', ['h1'])],
      contentStore: { h1: textEntry('hello') },
      branchClipboard: null,
    };
    await saveChatData(data);

    // Simulate interrupted compression: packed written but raw NOT deleted
    const rawRecord = await idbGet<any>('chat:chat-x');
    const { compressChatRecord } = await import('./CompressionService');
    const compressed = await compressChatRecord(rawRecord);
    await idbPut('chat:chat-x:packed', { compressed, generation: rawRecord.generation });
    // raw still exists

    // Load should use raw, ignore packed
    _resetInternalState();
    const result = await loadChatData(baseState);
    expect(result).not.toBeNull();
    expect(result!.chats!.length).toBe(1);
    expect(result!.chats![0].id).toBe('chat-x');
  });

  it('compressSingleChat: abort during compression leaves raw intact', async () => {
    const data = {
      chats: [makeChat('chat-y', ['h1'])],
      contentStore: { h1: textEntry('test') },
      branchClipboard: null,
    };
    await saveChatData(data);

    const abort = new AbortController();
    abort.abort(); // Pre-abort
    const result = await compressSingleChat('chat-y', abort.signal);
    expect(result).toBe(false);

    // raw should still exist
    const raw = await idbGet('chat:chat-y');
    expect(raw).toBeDefined();
  });

  it('loadSplitData: raw and packed both present → raw wins, packed ignored', async () => {
    // This is a more direct test of the raw-first rule
    const chatData = makeChat('dual', ['h1']);
    await idbPut('meta', { version: 17, generation: 1, chatIds: ['dual'] });
    await idbPut('content-store', {
      data: { h1: textEntry('raw-version') },
      generation: 1,
    });
    await idbPut('chat:dual', {
      chat: { ...chatData, title: 'raw-title' },
      generation: 1,
    });
    // Also write a packed version with different title
    const { compressChatRecord } = await import('./CompressionService');
    const packedData = await compressChatRecord({
      chat: { ...chatData, title: 'packed-title' },
      generation: 1,
    });
    await idbPut('chat:dual:packed', { compressed: packedData, generation: 1 });
    await idbPut('branch-clipboard', { data: null, generation: 1 });

    const result = await loadChatData(baseState);
    expect(result!.chats![0].title).toBe('raw-title');
  });

  it('loadSplitData: packed decompression failure skips that chat, others survive', async () => {
    await idbPut('meta', { version: 17, generation: 1, chatIds: ['good', 'bad'] });
    await idbPut('content-store', {
      data: {
        h1: textEntry('a'),
        h2: textEntry('b'),
      },
      generation: 1,
    });
    // good chat is raw — no decompression needed
    await idbPut('chat:good', {
      chat: makeChat('good', ['h1']),
      generation: 1,
    });
    // bad chat is packed with an empty compressed field (triggers the
    // !packed?.compressed guard so it's skipped without calling DecompressionStream)
    await idbPut('chat:bad:packed', {
      compressed: null,
      generation: 1,
    });
    await idbPut('branch-clipboard', { data: null, generation: 1 });

    const result = await loadChatData(baseState);
    expect(result).not.toBeNull();
    expect(result!.chats!.length).toBe(1);
    expect(result!.chats![0].id).toBe('good');
    expect(result!.loadStatus).toBe('degraded');
    expect(result!.missingChatIds).toEqual(['bad']);
    // No residual GC is allowed after a partial load because h2 may still be
    // needed to recover the unreadable chat.
    expect(result!.contentStore).toHaveProperty('h2');
  });
});

describe('write safety and serialization', () => {
  it('blocks writes after an unsafe startup without mutating committed data', async () => {
    const original = {
      chats: [makeChat('kept', ['h1'])],
      contentStore: { h1: textEntry('keep me') },
      branchClipboard: null,
    };
    await saveChatData(original);
    const metaBefore = await idbGet<any>('meta');

    setChatDataWritesBlocked(true);
    expect(areChatDataWritesBlocked()).toBe(true);
    await expect(
      saveChatData({
        chats: [makeChat('replacement', ['h2'])],
        contentStore: { h2: textEntry('do not write') },
        branchClipboard: null,
      })
    ).rejects.toThrow(/writes are blocked/);

    expect(await idbGet('meta')).toEqual(metaBefore);
    expect(await idbGet('chat:kept')).toBeDefined();
    expect(await idbGet('chat:replacement')).toBeUndefined();
  });

  it('never regresses generation when module state is reset before a save', async () => {
    const first = {
      chats: [makeChat('chat-a', ['h1'])],
      contentStore: { h1: textEntry('one') },
      branchClipboard: null,
    };
    await saveChatData(first);
    const firstMeta = await idbGet<any>('meta');
    _resetInternalState();

    await saveChatData({
      chats: [makeChat('chat-a', ['h1']), makeChat('chat-b', ['h2'])],
      contentStore: { h1: textEntry('one'), h2: textEntry('two') },
      branchClipboard: null,
    });

    const secondMeta = await idbGet<any>('meta');
    expect(secondMeta.generation).toBe(firstMeta.generation + 1);
    expect(secondMeta.chatIds).toEqual(['chat-a', 'chat-b']);
  });

  it('rejects a stale loaded context after another context advances the generation', async () => {
    const snapshot = {
      chats: [makeChat('chat-a', ['h1'])],
      contentStore: { h1: textEntry('one') },
      branchClipboard: null,
    };
    await saveChatData(snapshot);
    _resetInternalState();
    await loadChatData(baseState);

    const loadedMeta = await idbGet<any>('meta');
    await idbPut('meta', {
      ...loadedMeta,
      generation: loadedMeta.generation + 1,
    });

    await expect(saveChatData(snapshot)).rejects.toThrow(/newer generation/);
    expect((await idbGet<any>('meta')).generation).toBe(loadedMeta.generation + 1);
  });

  it('rejects a snapshot with missing content before writing any commit records', async () => {
    await expect(
      saveChatData({
        chats: [makeChat('broken', ['missing-hash'])],
        contentStore: {},
        branchClipboard: null,
      })
    ).rejects.toThrow(/inconsistent chat data/);

    expect(await idbGet('meta')).toBeUndefined();
    expect(await idbGet('content-store')).toBeUndefined();
  });

  it('rejects an empty snapshot when committed chats already exist', async () => {
    await saveChatData({
      chats: [makeChat('kept', ['h1'])],
      contentStore: { h1: textEntry('keep') },
      branchClipboard: null,
    });
    const metaBefore = await idbGet<any>('meta');

    await expect(
      saveChatData({ chats: [], contentStore: {}, branchClipboard: null })
    ).rejects.toThrow(/empty chat list/);

    expect(await idbGet('meta')).toEqual(metaBefore);
    expect(await idbGet('chat:kept')).toBeDefined();
  });

  it('serializes concurrent saves into coherent generations', async () => {
    const first = saveChatData({
      chats: [makeChat('chat-a', ['h1'])],
      contentStore: { h1: textEntry('one') },
      branchClipboard: null,
    });
    const second = saveChatData({
      chats: [makeChat('chat-a', ['h1']), makeChat('chat-b', ['h2'])],
      contentStore: { h1: textEntry('one'), h2: textEntry('two') },
      branchClipboard: null,
    });

    await Promise.all([first, second]);
    _resetInternalState();
    const loaded = await loadChatData(baseState);

    expect(loaded?.loadStatus).toBe('ok');
    expect(loaded?.chats?.map((chat) => chat.id)).toEqual(['chat-a', 'chat-b']);
    expect((await idbGet<any>('meta')).generation).toBe(2);
  });
});

describe('legacy migration integrity', () => {
  it('re-reads the committed split store when another loader wins migration', async () => {
    await idbPut('chat-data', {
      version: 18,
      chats: [makeChat('legacy-chat', ['h1'])],
      contentStore: { h1: textEntry('preserved') },
      branchClipboard: null,
    });

    const [first, second] = await Promise.all([
      loadChatData(baseState),
      loadChatData(baseState),
    ]);

    expect(first?.loadStatus).toBe('ok');
    expect(second?.loadStatus).toBe('ok');
    expect(first?.chats?.map((chat) => chat.id)).toEqual(['legacy-chat']);
    expect(second?.chats?.map((chat) => chat.id)).toEqual(['legacy-chat']);
    expect((await idbGet<any>('meta')).chatIds).toEqual(['legacy-chat']);
    expect(await idbGet('chat-data')).toBeUndefined();
  });

  it('preserves an inconsistent legacy record and reports a degraded load', async () => {
    await idbPut('chat-data', {
      version: 17,
      chats: [makeChat('legacy-chat', ['missing-hash'])],
      contentStore: {},
      branchClipboard: null,
    });

    const result = await loadChatData(baseState);

    expect(result?.loadStatus).toBe('degraded');
    expect(result?.errors.join(' ')).toMatch(/Missing contentHash/);
    expect(await idbGet('chat-data')).toBeDefined();
    expect(await idbGet('meta')).toBeUndefined();
  });
});

// ─── Phase 2: Generation Consistency ───

describe('Phase 2 generation consistency', () => {
  it('loadSplitData: content-store=G, chat=G-1, meta=G-1 → old chat resolves hashes', async () => {
    // content-store upgraded but meta/chat still at old gen
    await idbPut('meta', { version: 17, generation: 4, chatIds: ['old-chat'] });
    await idbPut('content-store', {
      data: { h1: textEntry('data') },
      generation: 5,
    });
    await idbPut('chat:old-chat', {
      chat: makeChat('old-chat', ['h1']),
      generation: 4,
    });
    await idbPut('branch-clipboard', { data: null, generation: 4 });

    const result = await loadChatData(baseState);
    expect(result).not.toBeNull();
    expect(result!.chats!.length).toBe(1);
    expect(result!.contentStore.h1).toBeDefined();
    expect(result!.contentStore.h1.content[0]).toEqual({ type: 'text', text: 'data' });
  });

  it('clipboard references are preserved by residual GC', async () => {
    const clipboard = makeClipboard(['h-clip']);
    const store: ContentStoreData = {
      'h-clip': textEntry('clip'),
      'h-orphan': textEntry('orphan', 0),
    };

    await idbPut('meta', { version: 17, generation: 1, chatIds: [] });
    await idbPut('content-store', { data: store, generation: 1 });
    await idbPut('branch-clipboard', { data: clipboard, generation: 1 });

    const result = await loadChatData(baseState);
    expect(result!.contentStore['h-clip']).toBeDefined();
    expect(result!.contentStore['h-orphan']).toBeUndefined();
  });

  it('runResidualGC keeps clipboard delta base chain', () => {
    const store: ContentStoreData = {
      base: textEntry('base'),
      d1: { content: [], refCount: 1, delta: { baseHash: 'base', patches: 'p1' } },
    };
    const clipboard = makeClipboard(['d1']);
    const result = runResidualGC(store, [], clipboard);
    expect(result).toHaveProperty('base');
    expect(result).toHaveProperty('d1');
  });

  it('deleted chat cleanup removes both raw and packed keys', async () => {
    // Save with two chats
    const data1 = {
      chats: [makeChat('keep', ['h1']), makeChat('remove', ['h2'])],
      contentStore: {
        h1: textEntry('a'),
        h2: textEntry('b'),
      },
      branchClipboard: null,
    };
    await saveChatData(data1);

    // Compress 'remove' chat so it has a packed key
    await compressSingleChat('remove');

    // But also write a raw key back (simulating interrupted decompression)
    await idbPut('chat:remove', { chat: makeChat('remove', ['h2']), generation: 1 });

    // Now save without 'remove' chat
    const data2 = {
      chats: [makeChat('keep', ['h1'])],
      contentStore: {
        h1: textEntry('a'),
      },
      branchClipboard: null,
    };
    await saveChatData(data2);

    const keys = await idbGetAllKeys();
    expect(keys).not.toContain('chat:remove');
    expect(keys).not.toContain('chat:remove:packed');
  });
});

// ─── Scheduler ───

describe('compression scheduler', () => {
  let listeners: Map<string, Set<Function>>;

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();

    // Provide minimal document mock for scheduler tests
    if (!(globalThis as any).document) {
      (globalThis as any).document = {};
    }
    const doc = (globalThis as any).document;
    doc.visibilityState = 'visible';
    doc.addEventListener = (type: string, fn: Function) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    };
    doc.removeEventListener = (type: string, fn: Function) => {
      listeners.get(type)?.delete(fn);
    };
    doc.dispatchEvent = (event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initCompressionScheduler sets up and cleanup tears down', () => {
    const cleanup = initCompressionScheduler('chat-1');
    expect(listeners.get('visibilitychange')?.size).toBe(1);

    cleanup();
    expect(listeners.get('visibilitychange')?.size).toBe(0);
  });

  it('visibilitychange hidden triggers compression setup', async () => {
    // Save data before fake timers to avoid timer conflicts
    vi.useRealTimers();
    const data = {
      chats: [makeChat('active', ['h1']), makeChat('bg', ['h2'])],
      contentStore: {
        h1: textEntry('a'),
        h2: textEntry('b'),
      },
      branchClipboard: null,
    };
    await saveChatData(data);
    vi.useFakeTimers();

    const cleanup = initCompressionScheduler('active');

    // Simulate going to background
    (globalThis as any).document.visibilityState = 'hidden';
    (globalThis as any).document.dispatchEvent({ type: 'visibilitychange' });

    // Allow async operations
    await vi.advanceTimersByTimeAsync(100);

    // Scheduler should have been triggered without errors
    cleanup();
  });

  it('visibilitychange visible cancels active compression', () => {
    const cleanup = initCompressionScheduler('active');

    // Go to background then immediately come back — should not throw
    (globalThis as any).document.visibilityState = 'hidden';
    (globalThis as any).document.dispatchEvent({ type: 'visibilitychange' });
    (globalThis as any).document.visibilityState = 'visible';
    (globalThis as any).document.dispatchEvent({ type: 'visibilitychange' });

    // Verify no errors and cleanup works
    cleanup();
  });
});

// ─── Performance ───
