import { STORE_VERSION } from '@store/version';
import {
  migratePersistedChatDataState,
  type PersistedChatData,
} from '@store/persistence';
import type { StoreState } from '@store/store';
import type { ContentStoreData } from '@utils/contentStore';
import { flushPendingGC, getPendingGCHashes } from '@utils/contentStore';
import type { BranchClipboard, ChatInterface } from '@type/chat';

const DB_NAME = 'weavelet-canvas';
const DB_VERSION = 1;
const STORE_NAME = 'persisted-state';

// Legacy key (pre-Phase 2)
const LEGACY_KEY = 'chat-data';

// New key structure
const META_KEY = 'meta';
const CONTENT_STORE_KEY = 'content-store';
const BRANCH_CLIPBOARD_KEY = 'branch-clipboard';
const chatKey = (id: string) => `chat:${id}`;

type PersistedChat = Omit<ChatInterface, 'messages'> & {
  messages?: ChatInterface['messages'];
};

interface MetaRecord {
  version: number;
  generation: number;
  activeChatId?: string;
}

interface ChatRecord {
  chat: PersistedChat;
  generation: number;
}

interface ContentStoreRecord {
  data: ContentStoreData;
  generation: number;
}

interface BranchClipboardRecord {
  data: BranchClipboard | null;
  generation: number;
}

// Legacy format
type LegacyChatDataRecord = PersistedChatData & {
  version: number;
};

let currentGeneration = 0;
let previousContentStoreSnapshot: ContentStoreData = {};

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

const openDatabase = async (): Promise<IDBDatabase> => {
  if (!hasIndexedDb()) {
    throw new Error('IndexedDB is not available in this environment');
  }

  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
};

/** Low-level IDB helpers */
const idbGet = <T>(store: IDBObjectStore, key: string): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`IDB get failed: ${key}`));
  });

const idbPut = (store: IDBObjectStore, key: string, value: unknown): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IDB put failed: ${key}`));
  });

const idbDelete = (store: IDBObjectStore, key: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IDB delete failed: ${key}`));
  });

const idbGetAllKeys = (store: IDBObjectStore): Promise<IDBValidKey[]> =>
  new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB getAllKeys failed'));
  });

const withTransaction = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await run(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
    });
    return result;
  } finally {
    database.close();
  }
};

/**
 * Collect all contentHashes referenced by chats and branchClipboard.
 */
function collectReferencedHashes(
  chats: PersistedChat[],
  clipboard: BranchClipboard | null
): Set<string> {
  const refs = new Set<string>();
  for (const chat of chats) {
    if (chat.branchTree) {
      for (const node of Object.values(chat.branchTree.nodes)) {
        refs.add(node.contentHash);
      }
    }
  }
  if (clipboard) {
    for (const node of Object.values(clipboard.nodes)) {
      refs.add(node.contentHash);
    }
  }
  return refs;
}

/**
 * Build content store for commit. Since releaseContent now defers GC
 * (entries with refCount<=0 stay in store), the store itself is already
 * a superset containing both active and pending-GC entries.
 * We just shallow-copy to avoid mutating the original during the commit.
 */
function buildSupersetForCommit(
  currentStore: ContentStoreData
): ContentStoreData {
  return { ...currentStore };
}

/**
 * Run residual GC: remove content-store entries not referenced by any chat or clipboard.
 * Also accounts for delta chain dependencies.
 */
function runResidualGC(
  contentStore: ContentStoreData,
  chats: PersistedChat[],
  clipboard: BranchClipboard | null
): ContentStoreData {
  const refs = collectReferencedHashes(chats, clipboard);

  // Also keep entries that are delta bases for referenced entries
  const needed = new Set<string>(refs);
  for (const hash of refs) {
    let cur = hash;
    while (contentStore[cur]?.delta) {
      cur = contentStore[cur].delta!.baseHash;
      needed.add(cur);
    }
  }

  const cleaned: ContentStoreData = {};
  for (const [hash, entry] of Object.entries(contentStore)) {
    if (needed.has(hash)) {
      cleaned[hash] = entry;
    }
  }
  return cleaned;
}

// ─── Migration from legacy single-key format ───

async function migrateLegacyData(
  baseState: StoreState
): Promise<PersistedChatData | null> {
  const database = await openDatabase();
  try {
    // Read legacy key
    const tx1 = database.transaction(STORE_NAME, 'readonly');
    const store1 = tx1.objectStore(STORE_NAME);
    const legacy = await idbGet<LegacyChatDataRecord>(store1, LEGACY_KEY);
    await new Promise<void>((r) => { tx1.oncomplete = () => r(); });

    if (!legacy) return null;

    let chatData: PersistedChatData = {
      chats: legacy.chats,
      contentStore: legacy.contentStore,
      branchClipboard: legacy.branchClipboard ?? null,
    };
    const version = typeof legacy.version === 'number' ? legacy.version : 0;

    if (version < STORE_VERSION) {
      chatData = migratePersistedChatDataState(baseState, chatData, version);
    }

    // Write to new format
    const chats = (chatData.chats ?? []) as PersistedChat[];
    const gen = 1;

    const tx2 = database.transaction(STORE_NAME, 'readwrite');
    const store2 = tx2.objectStore(STORE_NAME);

    // content-store first
    await idbPut(store2, CONTENT_STORE_KEY, {
      data: chatData.contentStore ?? {},
      generation: gen,
    });

    // individual chats
    for (const chat of chats) {
      await idbPut(store2, chatKey(chat.id), {
        chat,
        generation: gen,
      });
    }

    // branch-clipboard
    await idbPut(store2, BRANCH_CLIPBOARD_KEY, {
      data: chatData.branchClipboard ?? null,
      generation: gen,
    });

    // meta last (commit marker)
    await idbPut(store2, META_KEY, {
      version: STORE_VERSION,
      generation: gen,
    } satisfies MetaRecord);

    // Delete legacy key
    await idbDelete(store2, LEGACY_KEY);

    await new Promise<void>((resolve, reject) => {
      tx2.oncomplete = () => resolve();
      tx2.onabort = () => reject(tx2.error ?? new Error('Migration transaction aborted'));
      tx2.onerror = () => reject(tx2.error ?? new Error('Migration transaction failed'));
    });

    currentGeneration = gen;
    previousContentStoreSnapshot = { ...(chatData.contentStore ?? {}) };

    return chatData;
  } finally {
    database.close();
  }
}

// ─── Public API ───

/**
 * Load chat data from IndexedDB. Handles:
 * 1. Migration from legacy single-key format
 * 2. New per-chat key format with generation-based recovery
 */
export const loadChatData = async (
  baseState: StoreState
): Promise<PersistedChatData | null> => {
  if (!hasIndexedDb()) return null;

  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // Check if legacy key exists
    const legacy = await idbGet<LegacyChatDataRecord>(store, LEGACY_KEY);
    const meta = await idbGet<MetaRecord>(store, META_KEY);

    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    database.close();

    // If legacy data exists and no meta, do migration
    if (legacy && !meta) {
      return migrateLegacyData(baseState);
    }

    if (!meta) return null;

    // Load from new format
    return loadSplitData(baseState, meta);
  } catch (e) {
    database.close();
    throw e;
  }
};

async function loadSplitData(
  baseState: StoreState,
  meta: MetaRecord
): Promise<PersistedChatData | null> {
  const G = meta.generation;

  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // Load content-store
    const csRecord = await idbGet<ContentStoreRecord>(store, CONTENT_STORE_KEY);
    const cbRecord = await idbGet<BranchClipboardRecord>(store, BRANCH_CLIPBOARD_KEY);

    // Enumerate all chat keys
    const allKeys = await idbGetAllKeys(store);
    const rawChatKeys = (allKeys as string[]).filter(
      (k) => typeof k === 'string' && k.startsWith('chat:') && !k.includes(':packed')
    );

    const chatRecords: Array<{ key: string; record: ChatRecord }> = [];
    for (const key of rawChatKeys) {
      const record = await idbGet<ChatRecord>(store, key);
      if (record?.chat) {
        chatRecords.push({ key, record });
      }
    }

    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    database.close();

    // ── Generation reconciliation ──

    // Determine the effective committed generation.
    // content-store is written first (step 1), so it may be ahead of meta.
    const csGen = csRecord?.generation ?? 0;
    const committedGen = Math.max(G, csGen);

    // Chat records: only accept chats at or below the committed generation.
    // Chats with generation > committedGen should not exist (meta is written
    // after chats), but guard against corruption.
    const chats: PersistedChat[] = [];
    for (const { record } of chatRecords) {
      if (record.generation <= committedGen) {
        chats.push(record.chat);
      } else {
        console.warn(
          `[IndexedDb] Discarding chat with generation ${record.generation} > committed ${committedGen}`
        );
      }
    }

    // Clipboard: accept if generation <= committedGen, otherwise discard
    // (clipboard is written alongside chats in step 2)
    let clipboard: BranchClipboard | null = null;
    if (cbRecord) {
      if (cbRecord.generation <= committedGen) {
        clipboard = cbRecord.data;
      } else {
        console.warn(
          `[IndexedDb] Discarding clipboard with generation ${cbRecord.generation} > committed ${committedGen}`
        );
      }
    }

    currentGeneration = committedGen;

    let contentStore = csRecord?.data ?? {};

    // Run residual GC to clean up any leftover superset entries
    // (entries that are not referenced by any chat or clipboard)
    contentStore = runResidualGC(contentStore, chats, clipboard);

    previousContentStoreSnapshot = { ...contentStore };

    // Initialize chat snapshot for differential writes
    previousChatSnapshot = new Map();
    for (const chat of chats) {
      previousChatSnapshot.set(chat.id, computeChatFingerprint(chat as PersistedChat));
    }

    // Version migration if needed
    if (meta.version < STORE_VERSION) {
      const chatData: PersistedChatData = {
        chats,
        contentStore,
        branchClipboard: clipboard,
      };
      const migrated = migratePersistedChatDataState(baseState, chatData, meta.version);
      await saveChatData(migrated);
      return migrated;
    }

    return {
      chats,
      contentStore,
      branchClipboard: clipboard,
    };
  } catch (e) {
    database.close();
    throw e;
  }
}

/**
 * Track chat IDs from the previous save for differential writes.
 */
let previousChatSnapshot: Map<string, string> = new Map(); // id → JSON hash of chat

function computeChatFingerprint(chat: PersistedChat): string {
  // Fast identity check: use branchTree activePath + node count as proxy
  const tree = chat.branchTree;
  if (tree) {
    return `${tree.activePath.join(',')}_${Object.keys(tree.nodes).length}_${chat.titleSet}`;
  }
  return `${chat.messages?.length ?? 0}_${chat.titleSet}`;
}

/**
 * Save chat data using the generation-based commit protocol:
 * 1. Write content-store (superset — entries with refCount<=0 retained)
 * 2. Write changed chats + branch-clipboard
 * 3. Write meta (commit marker)
 * 4. GC (deferred, safe to skip on crash)
 */
export const saveChatData = async (data: PersistedChatData): Promise<void> => {
  if (!hasIndexedDb()) return;

  const nextGen = currentGeneration + 1;
  const chats = (data.chats ?? []) as PersistedChat[];
  const contentStore = data.contentStore ?? {};
  const clipboard = data.branchClipboard ?? null;

  // Content store is already a superset: deferred GC entries (refCount<=0)
  // are still present in the store, so no separate superset build is needed.
  const supersetStore = buildSupersetForCommit(contentStore);

  // Step 1: Write content-store (superset) first
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, CONTENT_STORE_KEY, {
      data: supersetStore,
      generation: nextGen,
    } satisfies ContentStoreRecord);
  });

  // Step 2: Write changed chats + branch-clipboard
  // Only write chats whose fingerprint differs from last save
  const changedChatIds: string[] = [];
  const newSnapshot = new Map<string, string>();
  for (const chat of chats) {
    const fp = computeChatFingerprint(chat);
    newSnapshot.set(chat.id, fp);
    if (previousChatSnapshot.get(chat.id) !== fp) {
      changedChatIds.push(chat.id);
    }
  }

  await withTransaction('readwrite', async (store) => {
    for (const id of changedChatIds) {
      const chat = chats.find((c) => c.id === id);
      if (chat) {
        await idbPut(store, chatKey(id), {
          chat,
          generation: nextGen,
        } satisfies ChatRecord);
      }
    }
    await idbPut(store, BRANCH_CLIPBOARD_KEY, {
      data: clipboard,
      generation: nextGen,
    } satisfies BranchClipboardRecord);
  });

  // Step 3: Write meta (commit marker)
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, META_KEY, {
      version: STORE_VERSION,
      generation: nextGen,
    } satisfies MetaRecord);
  });

  currentGeneration = nextGen;

  // Step 4: Deferred GC
  const pendingGC = getPendingGCHashes();
  if (pendingGC.size > 0) {
    // Flush from in-memory store
    const flushed = flushPendingGC(contentStore);
    if (flushed.length > 0) {
      // Write GC'd content store (now without the flushed entries)
      await withTransaction('readwrite', async (store) => {
        await idbPut(store, CONTENT_STORE_KEY, {
          data: contentStore,
          generation: nextGen,
        } satisfies ContentStoreRecord);
      });
    }
  }

  // Remove chat keys that no longer exist
  const currentChatIds = new Set(chats.map((c) => c.id));
  const deletedIds = [...previousChatSnapshot.keys()].filter(
    (id) => !currentChatIds.has(id)
  );
  if (deletedIds.length > 0) {
    await withTransaction('readwrite', async (store) => {
      for (const id of deletedIds) {
        await idbDelete(store, chatKey(id));
      }
    });
  }

  previousChatSnapshot = newSnapshot;
  previousContentStoreSnapshot = { ...contentStore };
};

export const clearChatData = async (): Promise<void> => {
  if (!hasIndexedDb()) return;

  await withTransaction('readwrite', async (store) => {
    const allKeys = await idbGetAllKeys(store);
    for (const key of allKeys) {
      await idbDelete(store, key as string);
    }
  });

  currentGeneration = 0;
  previousContentStoreSnapshot = {};
};

// Exported for testing
export {
  collectReferencedHashes,
  buildSupersetForCommit,
  runResidualGC,
  computeChatFingerprint,
  currentGeneration as _currentGeneration,
  previousContentStoreSnapshot as _previousContentStoreSnapshot,
};

export const _resetInternalState = () => {
  currentGeneration = 0;
  previousContentStoreSnapshot = {};
  previousChatSnapshot = new Map();
};
