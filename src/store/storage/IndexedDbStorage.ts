import { getStreamingChatIds } from '@utils/streamingBuffer';
import { debugReport } from '@store/debug-store';
import { STORE_VERSION } from '@store/version';
import {
  type PersistedChatData,
  migratePersistedState,
} from '@store/persistence';
import type { StoreState } from '@store/store';
import type { ContentStoreData } from '@utils/contentStore';
import { flushPendingGC, getPendingGCHashes } from '@utils/contentStore';
import type { BranchClipboard, ChatInterface } from '@type/chat';
import {
  packedKey,
  isPackedKey,
  isCompressionSupported,
  compressChatRecord,
  decompressChatRecord,
} from './CompressionService';

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
  /** Authoritative set of chat IDs at the time of commit.
   *  Used to filter out orphaned chat keys that survived a crash before Step 4 cleanup. */
  chatIds?: string[];
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

export interface IndexedDbRecoveryChatSnapshot {
  key: string;
  packed: boolean;
  generation?: number;
  compressedBytes?: number;
  record?: ChatRecord;
  error?: string;
}

export interface IndexedDbRecoverySnapshot {
  databaseName: typeof DB_NAME;
  storeName: typeof STORE_NAME;
  collectedAt: string;
  keys: string[];
  meta?: MetaRecord;
  legacy?: LegacyChatDataRecord;
  contentStore?: ContentStoreRecord;
  branchClipboard?: BranchClipboardRecord;
  chats: IndexedDbRecoveryChatSnapshot[];
}

let currentGeneration = 0;
let previousContentStoreSnapshot: ContentStoreData = {};
let migrationInProgress = false;

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

// ─── Migration control ───

export function setMigrationInProgress(v: boolean): void {
  migrationInProgress = v;
}

export function isMigrationInProgress(): boolean {
  return migrationInProgress;
}

// ─── Migration from legacy single-key format ───

/**
 * Migrate legacy single-key data to the split-key format.
 * No schema-level migration is performed — data is moved as-is.
 */
async function migrateLegacyData(
  _baseState: StoreState
): Promise<PersistedChatData | null> {
  const database = await openDatabase();
  try {
    const tx1 = database.transaction(STORE_NAME, 'readonly');
    const store1 = tx1.objectStore(STORE_NAME);
    const legacy = await idbGet<LegacyChatDataRecord>(store1, LEGACY_KEY);
    await new Promise<void>((r) => { tx1.oncomplete = () => r(); });

    if (!legacy) return null;

    const legacyVersion = typeof legacy.version === 'number' ? legacy.version : 0;

    // Raise the needs-migration flag if data predates current schema
    if (legacyVersion < STORE_VERSION) {
      migratePersistedState(legacy, legacyVersion);
    }

    const chatData: PersistedChatData = {
      chats: legacy.chats,
      contentStore: legacy.contentStore,
      branchClipboard: legacy.branchClipboard ?? null,
    };

    const chats = (chatData.chats ?? []) as PersistedChat[];
    const gen = 1;

    const tx2 = database.transaction(STORE_NAME, 'readwrite');
    const store2 = tx2.objectStore(STORE_NAME);

    await idbPut(store2, CONTENT_STORE_KEY, {
      data: chatData.contentStore ?? {},
      generation: gen,
    });

    for (const chat of chats) {
      await idbPut(store2, chatKey(chat.id), {
        chat,
        generation: gen,
      });
    }

    await idbPut(store2, BRANCH_CLIPBOARD_KEY, {
      data: chatData.branchClipboard ?? null,
      generation: gen,
    });

    // Preserve the original version so subsequent loads can detect
    // that the data has not been schema-migrated.
    await idbPut(store2, META_KEY, {
      version: legacyVersion,
      generation: gen,
      chatIds: chats.map((c) => c.id),
    } satisfies MetaRecord);

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

    const legacy = await idbGet<LegacyChatDataRecord>(store, LEGACY_KEY);
    const meta = await idbGet<MetaRecord>(store, META_KEY);

    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    database.close();

    // If legacy data exists and no meta, migrate storage format (not schema)
    if (legacy && !meta) {
      return migrateLegacyData(baseState);
    }

    if (!meta) return null;

    return loadSplitData(meta);
  } catch (e) {
    database.close();
    throw e;
  }
};

async function loadSplitData(
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

    // Enumerate all chat keys (both raw and packed)
    const allKeys = await idbGetAllKeys(store);
    const rawChatKeys = (allKeys as string[]).filter(
      (k) => typeof k === 'string' && k.startsWith('chat:') && !isPackedKey(k)
    );
    const packedChatKeys = (allKeys as string[]).filter(
      (k) => typeof k === 'string' && isPackedKey(k)
    );

    // Build set of raw chat keys for raw-first resolution
    const rawKeySet = new Set(rawChatKeys);

    const chatRecords: Array<{ key: string; record: ChatRecord }> = [];

    // Load raw chats
    for (const key of rawChatKeys) {
      const record = await idbGet<ChatRecord>(store, key);
      if (record?.chat) {
        chatRecords.push({ key, record });
      }
    }

    // Load packed chats (only if no raw version exists)
    for (const pk of packedChatKeys) {
      const rawKey = pk.slice(0, -':packed'.length);
      if (rawKeySet.has(rawKey)) continue; // raw-first rule: skip packed when raw exists

      const packed = await idbGet<{ compressed: Uint8Array; generation: number }>(store, pk);
      if (packed?.compressed) {
        try {
          const record = await decompressChatRecord<ChatRecord>(
            packed.compressed instanceof Uint8Array
              ? packed.compressed
              : new Uint8Array(packed.compressed as ArrayBufferLike)
          );
          chatRecords.push({
            key: rawKey,
            record: { ...record, generation: packed.generation },
          });
        } catch (e) {
          console.warn(`[IndexedDb] Failed to decompress ${pk}, skipping`, e);
        }
      }
    }

    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    database.close();

    // ── Generation reconciliation ──

    // Determine the effective committed generation.
    // content-store is written first (step 1), so it may be ahead of meta.
    const csGen = csRecord?.generation ?? 0;
    const committedGen = Math.max(G, csGen);

    // Chat records: filter by generation AND by the authoritative chat ID list
    // stored in meta. This prevents deleted chats from resurrecting when the
    // app crashes after Step 3 (meta written) but before Step 4 (stale key cleanup).
    //
    // However, if csGen > G (content-store was written but meta was not updated),
    // meta.chatIds is stale and may not include chats added in the newer generation.
    // In that case, skip chatIds filtering to avoid dropping valid new chats.
    const authoritativeChatIds =
      csGen <= G && meta.chatIds ? new Set(meta.chatIds) : null;
    const chats: PersistedChat[] = [];
    for (const { record } of chatRecords) {
      if (record.generation > committedGen) {
        console.warn(
          `[IndexedDb] Discarding chat with generation ${record.generation} > committed ${committedGen}`
        );
        continue;
      }
      // If meta has chatIds, only accept chats in that set
      if (authoritativeChatIds && !authoritativeChatIds.has(record.chat.id)) {
        console.warn(
          `[IndexedDb] Discarding orphaned chat ${record.chat.id} not in meta.chatIds`
        );
        continue;
      }
      chats.push(record.chat);
    }

    // Reorder chats to match the authoritative order stored in meta.chatIds
    if (meta.chatIds) {
      const orderMap = new Map(meta.chatIds.map((id, i) => [id, i]));
      chats.sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
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

    // Raise the needs-migration flag if stored data predates current schema
    if (meta.version < STORE_VERSION) {
      migratePersistedState({}, meta.version);
    }

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

export async function collectIndexedDbRecoverySnapshot(): Promise<IndexedDbRecoverySnapshot | null> {
  if (!hasIndexedDb()) return null;

  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const txDone = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
    });
    const store = tx.objectStore(STORE_NAME);

    const allKeys = await idbGetAllKeys(store);
    const keys = allKeys
      .filter((key): key is string => typeof key === 'string')
      .sort();

    if (keys.length === 0) {
      await txDone;
      return null;
    }

    const rawChatKeys = keys.filter(
      (key) => key.startsWith('chat:') && !isPackedKey(key)
    );
    const packedChatKeys = keys.filter(isPackedKey);
    const chats: IndexedDbRecoveryChatSnapshot[] = [];

    const [meta, legacy, contentStore, branchClipboard] = await Promise.all([
      idbGet<MetaRecord>(store, META_KEY),
      idbGet<LegacyChatDataRecord>(store, LEGACY_KEY),
      idbGet<ContentStoreRecord>(store, CONTENT_STORE_KEY),
      idbGet<BranchClipboardRecord>(store, BRANCH_CLIPBOARD_KEY),
    ]);

    for (const key of rawChatKeys) {
      const record = await idbGet<ChatRecord>(store, key);
      chats.push({
        key,
        packed: false,
        generation: record?.generation,
        record,
      });
    }

    for (const key of packedChatKeys) {
      const packed = await idbGet<{ compressed: Uint8Array; generation: number }>(store, key);
      const snapshot: IndexedDbRecoveryChatSnapshot = {
        key: key.slice(0, -':packed'.length),
        packed: true,
        generation: packed?.generation,
      };

      if (packed?.compressed) {
        try {
          const compressed = packed.compressed instanceof Uint8Array
            ? packed.compressed
            : new Uint8Array(packed.compressed as ArrayBufferLike);
          snapshot.compressedBytes = compressed.byteLength;
          snapshot.record = await decompressChatRecord<ChatRecord>(compressed);
        } catch (error) {
          snapshot.error = error instanceof Error ? error.message : String(error);
        }
      }

      chats.push(snapshot);
    }

    const snapshot: IndexedDbRecoverySnapshot = {
      databaseName: DB_NAME,
      storeName: STORE_NAME,
      collectedAt: new Date().toISOString(),
      keys,
      meta,
      legacy,
      contentStore,
      branchClipboard,
      chats,
    };

    await txDone;

    return snapshot;
  } finally {
    database.close();
  }
}

/**
 * Track chat IDs from the previous save for differential writes.
 */
let previousChatSnapshot: Map<string, string> = new Map(); // id → JSON hash of chat

function computeChatFingerprint(chat: PersistedChat): string {
  // Use JSON.stringify to capture ALL persisted fields (title, config, folder,
  // imageDetail, collapsedNodes, branchTree, messages, etc.).
  // This ensures any field change triggers a differential write.
  return JSON.stringify(chat);
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
  debugReport('idb-save', { label: 'IndexedDB Save', status: 'active' });
  if (migrationInProgress) {
    console.warn('[saveChatData] Skipped — migration in progress');
    return;
  }

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

  // Step 3: Write meta (commit marker) with authoritative chat ID list
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, META_KEY, {
      version: STORE_VERSION,
      generation: nextGen,
      chatIds: chats.map((c) => c.id),
    } satisfies MetaRecord);
  });

  currentGeneration = nextGen;

  // Step 4: Deferred GC — read-modify-write from IDB to avoid
  // overwriting content-store entries added by concurrent saves.
  const pendingGCSet = getPendingGCHashes();
  if (pendingGCSet.size > 0) {
    const hashesToGC = [...pendingGCSet];
    // Flush from in-memory snapshot (keeps Zustand contentStore clean for
    // future snapshots) and clear the global pending set.
    flushPendingGC(contentStore);

    await withTransaction('readwrite', async (store) => {
      const record = await idbGet<ContentStoreRecord>(store, CONTENT_STORE_KEY);
      if (!record?.data) return;

      const liveStore = record.data;
      let changed = false;
      for (const hash of hashesToGC) {
        if (liveStore[hash] && liveStore[hash].refCount <= 0) {
          delete liveStore[hash];
          changed = true;
        }
      }

      if (changed) {
        await idbPut(store, CONTENT_STORE_KEY, {
          data: liveStore,
          generation: nextGen,
        } satisfies ContentStoreRecord);
      }
    });
  }

  // Remove chat keys (both raw and packed) that no longer exist
  const currentChatIds = new Set(chats.map((c) => c.id));
  const deletedIds = [...previousChatSnapshot.keys()].filter(
    (id) => !currentChatIds.has(id)
  );
  if (deletedIds.length > 0) {
    await withTransaction('readwrite', async (store) => {
      for (const id of deletedIds) {
        await idbDelete(store, chatKey(id));
        await idbDelete(store, packedKey(chatKey(id)));
      }
    });
  }

  previousChatSnapshot = newSnapshot;
  previousContentStoreSnapshot = { ...contentStore };
  debugReport('idb-save', { status: 'done', detail: `${changedChatIds.length} chats` });
};

// ─── Copy-on-Write Compression ───

/** Active compression abort controller — only one compression cycle runs at a time */
let compressionAbort: AbortController | null = null;

/**
 * Compress a single chat: write packed, then delete raw (2-phase for safety).
 * Returns true if compression succeeded.
 */
async function compressSingleChat(chatId: string, signal?: AbortSignal): Promise<boolean> {
  if (!isCompressionSupported()) return false;

  const key = chatKey(chatId);
  const pk = packedKey(key);

  // Read raw record
  const rawRecord = await withTransaction('readonly', async (store) => {
    return idbGet<ChatRecord>(store, key);
  });

  if (!rawRecord?.chat) return false;
  if (signal?.aborted) return false;

  // Compress
  const compressed = await compressChatRecord(rawRecord);
  if (signal?.aborted) return false;

  // Phase 1: Write packed key
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, pk, {
      compressed,
      generation: rawRecord.generation,
    });
  });

  if (signal?.aborted) return false;

  // Phase 2: Delete raw key (packed is now durable)
  await withTransaction('readwrite', async (store) => {
    await idbDelete(store, key);
  });

  return true;
}

/**
 * Decompress a single chat: write raw, then delete packed (2-phase for safety).
 * Returns true if decompression occurred.
 */
async function decompressSingleChat(chatId: string): Promise<boolean> {
  const key = chatKey(chatId);
  const pk = packedKey(key);

  // Check if packed exists
  const packed = await withTransaction('readonly', async (store) => {
    return idbGet<{ compressed: Uint8Array; generation: number }>(store, pk);
  });

  if (!packed?.compressed) return false;

  const record = await decompressChatRecord<ChatRecord>(
    packed.compressed instanceof Uint8Array
      ? packed.compressed
      : new Uint8Array(packed.compressed as ArrayBufferLike)
  );

  // Phase 1: Write raw key
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, key, {
      chat: record.chat,
      generation: packed.generation,
    });
  });

  // Phase 2: Delete packed key
  await withTransaction('readwrite', async (store) => {
    await idbDelete(store, pk);
  });

  return true;
}

/**
 * Compress inactive chats. `activeChatId` is excluded.
 * Processes chats sequentially. Abortable via signal.
 */
export async function compressInactiveChats(
  activeChatId: string | undefined,
  signal?: AbortSignal
): Promise<number> {
  if (!isCompressionSupported()) return 0;

  // Find raw chat keys that are not the active chat
  const rawKeys = await withTransaction('readonly', async (store) => {
    const allKeys = await idbGetAllKeys(store);
    return (allKeys as string[]).filter(
      (k) => typeof k === 'string' && k.startsWith('chat:') && !isPackedKey(k)
    );
  });

  debugReport('compression', { label: 'Compression', status: 'active', detail: `${rawKeys.length} candidates` });
  const streamingChatIds = getStreamingChatIds();
  let compressed = 0;
  for (const key of rawKeys) {
    if (signal?.aborted) break;
    const id = key.slice('chat:'.length);
    if (id === activeChatId) continue;
    if (streamingChatIds.has(id)) continue;

    try {
      if (await compressSingleChat(id, signal)) {
        compressed++;
      }
    } catch (e) {
      console.warn(`[IndexedDb] Failed to compress chat ${id}`, e);
    }
  }
  debugReport('compression', { status: 'done', detail: `${compressed} compressed` });
  return compressed;
}

/**
 * Ensure a specific chat is decompressed (for when it becomes active).
 */
export async function ensureChatDecompressed(chatId: string): Promise<void> {
  try {
    await decompressSingleChat(chatId);
  } catch (e) {
    console.warn(`[IndexedDb] Failed to decompress chat ${chatId}`, e);
  }
}

// ─── Compression Scheduler ───

const IDLE_COMPRESS_DELAY_MS = 5 * 60 * 1000; // 5 minutes
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let schedulerActiveChatId: string | undefined;

function cancelCompression() {
  compressionAbort?.abort();
  compressionAbort = null;
}

function scheduleIdleCompression() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    triggerCompression();
  }, IDLE_COMPRESS_DELAY_MS);
}

function triggerCompression() {
  if (migrationInProgress) return;
  cancelCompression();
  const abort = new AbortController();
  compressionAbort = abort;

  const doCompress = async () => {
    if (typeof requestIdleCallback !== 'undefined') {
      await new Promise<void>((resolve) => requestIdleCallback(() => resolve()));
    }
    if (abort.signal.aborted) return;
    await compressInactiveChats(schedulerActiveChatId, abort.signal);
  };

  doCompress().catch((e) => {
    if (!abort.signal.aborted) {
      console.warn('[IndexedDb] Background compression failed', e);
    }
  });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    // Compress when page goes to background
    triggerCompression();
  } else {
    // Cancel when returning to foreground (avoid contention)
    cancelCompression();
  }
}

/**
 * Notify the compression scheduler that the active chat changed.
 * Triggers compression of the previously active chat.
 */
export function notifyActiveChatChanged(chatId: string | undefined): void {
  schedulerActiveChatId = chatId;
  cancelCompression();

  // Decompress the newly active chat (if it was packed)
  if (chatId) {
    ensureChatDecompressed(chatId).then(() => {
      // After decompression, schedule compression of inactive chats
      scheduleIdleCompression();
      triggerCompression();
    });
  } else {
    scheduleIdleCompression();
    triggerCompression();
  }
}

/**
 * Initialize the compression scheduler. Call once during bootstrap.
 * Returns a cleanup function.
 */
export function initCompressionScheduler(activeChatId: string | undefined): () => void {
  if (!isCompressionSupported() || migrationInProgress) return () => {};

  schedulerActiveChatId = activeChatId;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  scheduleIdleCompression();

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    cancelCompression();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
}

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
  compressSingleChat,
  decompressSingleChat,
  currentGeneration as _currentGeneration,
  previousContentStoreSnapshot as _previousContentStoreSnapshot,
};

export const _resetInternalState = () => {
  currentGeneration = 0;
  previousContentStoreSnapshot = {};
  previousChatSnapshot = new Map();
};
