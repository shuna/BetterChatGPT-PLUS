import { STORE_VERSION } from '@store/version';
import {
  migratePersistedChatDataState,
  type PersistedChatData,
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

// ─── Migration types ───

const MIGRATION_META_KEY = 'migration-meta';
const MIGRATION_SNAPSHOT_KEY = 'migration-snapshot';
const LARGE_MIGRATION_THRESHOLD = 8 * 1024 * 1024; // 8MB

export interface MigrationMetaRecord {
  status: 'idle' | 'running' | 'finalizing' | 'done' | 'failed';
  source: 'localStorage' | 'indexeddb-legacy';
  sourceVersion: number;
  sourceSizeBytes: number;
  totalChats: number;
  migratedChats: number;
  migratedContentHashes: number;
  startedAt: number;
  updatedAt: number;
  lastChatIndex: number;
  lastError?: string;
}

interface MigrationSnapshotRecord {
  data: PersistedChatData;
  version: number;
}

export type MigrationProgressCallback = (meta: MigrationMetaRecord) => void;

let currentGeneration = 0;
let previousContentStoreSnapshot: ContentStoreData = {};
let migrationInProgress = false;
let migrationResumeRunning = false;

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

/**
 * Estimate the byte size of a persisted payload (rough JSON.stringify length).
 */
export function estimatePersistedPayloadSize(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

/**
 * Read migration-meta from IndexedDB. Returns null if not present.
 */
export async function loadMigrationMeta(): Promise<MigrationMetaRecord | null> {
  if (!hasIndexedDb()) return null;
  return withTransaction('readonly', async (store) => {
    return (await idbGet<MigrationMetaRecord>(store, MIGRATION_META_KEY)) ?? null;
  });
}

/**
 * Begin a large migration: save snapshot and create migration-meta.
 *
 * When source is 'indexeddb-legacy', the existing LEGACY_KEY is used as the
 * snapshot to avoid duplicating the entire payload in IndexedDB (which would
 * nearly double storage usage and risk QuotaExceeded).
 */
export async function beginLargeMigration(
  sourceData: PersistedChatData,
  sourceVersion: number,
  source: 'localStorage' | 'indexeddb-legacy'
): Promise<MigrationMetaRecord> {
  const chats = sourceData.chats ?? [];
  const sizeBytesEstimate = estimatePersistedPayloadSize(sourceData);

  const meta: MigrationMetaRecord = {
    status: 'running',
    source,
    sourceVersion,
    sourceSizeBytes: sizeBytesEstimate,
    totalChats: chats.length,
    migratedChats: 0,
    migratedContentHashes: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    lastChatIndex: 0,
  };

  if (source === 'indexeddb-legacy') {
    // Legacy key already contains the full data — reuse it as snapshot
    // to avoid duplicating multi-MB payload in IndexedDB.
    await withTransaction('readwrite', async (store) => {
      await idbPut(store, MIGRATION_META_KEY, meta);
    });
  } else {
    // localStorage source: must write snapshot into IndexedDB
    await withTransaction('readwrite', async (store) => {
      await idbPut(store, MIGRATION_SNAPSHOT_KEY, {
        data: sourceData,
        version: sourceVersion,
      } satisfies MigrationSnapshotRecord);
      await idbPut(store, MIGRATION_META_KEY, meta);
    });
  }

  migrationInProgress = true;
  return meta;
}

/**
 * Migrate a single chat from snapshot to new format.
 * Returns the updated migration meta.
 */
export async function migrateSingleChat(
  snapshot: PersistedChatData,
  index: number,
  accumulatedContentStore: ContentStoreData
): Promise<void> {
  const chats = (snapshot.chats ?? []) as PersistedChat[];
  if (index >= chats.length) return;

  const chat = chats[index];
  const sourceContentStore = snapshot.contentStore ?? {};

  // Add only contentHashes referenced by this chat
  if (chat.branchTree) {
    for (const node of Object.values(chat.branchTree.nodes)) {
      const hash = node.contentHash;
      if (!(hash in accumulatedContentStore) && hash in sourceContentStore) {
        accumulatedContentStore[hash] = { ...sourceContentStore[hash] };
        // Also follow delta chains
        let cur = hash;
        while (sourceContentStore[cur]?.delta) {
          const baseHash = sourceContentStore[cur].delta!.baseHash;
          if (!(baseHash in accumulatedContentStore) && baseHash in sourceContentStore) {
            accumulatedContentStore[baseHash] = { ...sourceContentStore[baseHash] };
          }
          cur = baseHash;
        }
      }
    }
  }

  const gen = 1;

  // Write content-store (incremental) and chat in one transaction
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, CONTENT_STORE_KEY, {
      data: accumulatedContentStore,
      generation: gen,
    } satisfies ContentStoreRecord);
    await idbPut(store, chatKey(chat.id), {
      chat,
      generation: gen,
    } satisfies ChatRecord);
  });
}

/**
 * Resume a large migration from where it left off.
 * Calls onProgress after each chat. Returns when complete or on error.
 */
export async function resumeLargeMigration(
  baseState: StoreState,
  onProgress?: MigrationProgressCallback
): Promise<PersistedChatData | null> {
  if (migrationResumeRunning) {
    console.warn('[Migration] resumeLargeMigration already running — skipping');
    return null;
  }
  migrationResumeRunning = true;
  try {
    return await resumeLargeMigrationInner(baseState, onProgress);
  } finally {
    migrationResumeRunning = false;
  }
}

async function resumeLargeMigrationInner(
  baseState: StoreState,
  onProgress?: MigrationProgressCallback
): Promise<PersistedChatData | null> {
  const meta = await loadMigrationMeta();
  if (!meta || (meta.status !== 'running' && meta.status !== 'finalizing' && meta.status !== 'failed')) {
    return null;
  }

  // If retrying from failed, reset status to running
  if (meta.status === 'failed') {
    await updateMigrationMeta({ status: 'running', lastError: undefined, updatedAt: Date.now() });
    meta.status = 'running';
  }

  if (meta.status === 'finalizing') {
    return finalizeLargeMigration(baseState, onProgress);
  }

  // Load snapshot — try dedicated snapshot key first, fall back to legacy key
  let snapshot = await withTransaction('readonly', async (store) => {
    return idbGet<MigrationSnapshotRecord>(store, MIGRATION_SNAPSHOT_KEY);
  });

  // For indexeddb-legacy source, the legacy key IS the snapshot (no duplication)
  if (!snapshot?.data && meta.source === 'indexeddb-legacy') {
    const legacy = await withTransaction('readonly', async (store) => {
      return idbGet<LegacyChatDataRecord>(store, LEGACY_KEY);
    });
    if (legacy) {
      const version = typeof legacy.version === 'number' ? legacy.version : 0;
      snapshot = {
        data: { chats: legacy.chats, contentStore: legacy.contentStore, branchClipboard: legacy.branchClipboard ?? null },
        version,
      };
    }
  }

  if (!snapshot?.data) {
    // Snapshot missing — mark failed
    await updateMigrationMeta({ status: 'failed', lastError: 'Migration snapshot not found' });
    onProgress?.({ ...meta, status: 'failed', lastError: 'Migration snapshot not found' });
    return null;
  }

  let sourceData = snapshot.data;
  if (snapshot.version < STORE_VERSION) {
    sourceData = migratePersistedChatDataState(baseState, sourceData, snapshot.version);
  }

  const chats = (sourceData.chats ?? []) as PersistedChat[];

  // Load accumulated content store so far
  let accumulatedContentStore: ContentStoreData = {};
  const existingCs = await withTransaction('readonly', async (store) => {
    return idbGet<ContentStoreRecord>(store, CONTENT_STORE_KEY);
  });
  if (existingCs?.data) {
    accumulatedContentStore = { ...existingCs.data };
  }

  // Migrate chat by chat from lastChatIndex
  let currentMeta = { ...meta };
  for (let i = currentMeta.lastChatIndex; i < chats.length; i++) {
    try {
      await migrateSingleChat(sourceData, i, accumulatedContentStore);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await updateMigrationMeta({
        status: 'failed',
        lastError: `Chat ${i} migration failed: ${errorMsg}`,
        lastChatIndex: i,
      });
      currentMeta = { ...currentMeta, status: 'failed', lastError: errorMsg, lastChatIndex: i };
      onProgress?.(currentMeta);
      return null;
    }

    currentMeta = {
      ...currentMeta,
      migratedChats: i + 1,
      lastChatIndex: i + 1,
      updatedAt: Date.now(),
    };
    await updateMigrationMeta({
      migratedChats: currentMeta.migratedChats,
      lastChatIndex: currentMeta.lastChatIndex,
      updatedAt: currentMeta.updatedAt,
    });
    onProgress?.(currentMeta);

    // Yield to event loop
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  // All chats migrated — finalize
  return finalizeLargeMigration(baseState, onProgress);
}

/**
 * Finalize: write branch-clipboard, meta, clean up snapshot and legacy data.
 */
async function finalizeLargeMigration(
  baseState: StoreState,
  onProgress?: MigrationProgressCallback
): Promise<PersistedChatData | null> {
  await updateMigrationMeta({ status: 'finalizing', updatedAt: Date.now() });

  const migMeta = await loadMigrationMeta();
  if (migMeta) {
    onProgress?.({ ...migMeta, status: 'finalizing' });
  }

  // Load snapshot for branch-clipboard (try snapshot key, then legacy key)
  let snapshot = await withTransaction('readonly', async (store) => {
    return idbGet<MigrationSnapshotRecord>(store, MIGRATION_SNAPSHOT_KEY);
  });

  if (!snapshot?.data && migMeta?.source === 'indexeddb-legacy') {
    const legacy = await withTransaction('readonly', async (store) => {
      return idbGet<LegacyChatDataRecord>(store, LEGACY_KEY);
    });
    if (legacy) {
      const version = typeof legacy.version === 'number' ? legacy.version : 0;
      snapshot = {
        data: { chats: legacy.chats, contentStore: legacy.contentStore, branchClipboard: legacy.branchClipboard ?? null },
        version,
      };
    }
  }

  if (!snapshot?.data) {
    // Snapshot was already consumed by a prior finalization — nothing to do
    console.warn('[Migration] finalizeLargeMigration: no snapshot data found, skipping');
    await updateMigrationMeta({ status: 'done', updatedAt: Date.now() });
    return null;
  }

  let sourceData = snapshot.data;
  if (snapshot.version < STORE_VERSION) {
    sourceData = migratePersistedChatDataState(baseState, sourceData, snapshot.version);
  }

  const gen = 1;
  const chats = (sourceData.chats ?? []) as PersistedChat[];

  // Write branch-clipboard + meta
  await withTransaction('readwrite', async (store) => {
    await idbPut(store, BRANCH_CLIPBOARD_KEY, {
      data: sourceData.branchClipboard ?? null,
      generation: gen,
    } satisfies BranchClipboardRecord);
    await idbPut(store, META_KEY, {
      version: STORE_VERSION,
      generation: gen,
      chatIds: chats.map((c) => c.id),
    } satisfies MetaRecord);
  });

  currentGeneration = gen;

  // Load final content-store
  const csRecord = await withTransaction('readonly', async (store) => {
    return idbGet<ContentStoreRecord>(store, CONTENT_STORE_KEY);
  });
  const contentStore = csRecord?.data ?? {};

  // Run residual GC
  const cleanedContentStore = runResidualGC(
    contentStore,
    chats,
    sourceData.branchClipboard ?? null
  );

  // Write cleaned content store if GC removed anything
  if (Object.keys(cleanedContentStore).length < Object.keys(contentStore).length) {
    await withTransaction('readwrite', async (store) => {
      await idbPut(store, CONTENT_STORE_KEY, {
        data: cleanedContentStore,
        generation: gen,
      } satisfies ContentStoreRecord);
    });
  }

  // Delete legacy data, snapshot, and migration-meta
  await withTransaction('readwrite', async (store) => {
    await idbDelete(store, LEGACY_KEY);
    await idbDelete(store, MIGRATION_SNAPSHOT_KEY);
  });

  await updateMigrationMeta({ status: 'done', updatedAt: Date.now() });

  if (migMeta) {
    onProgress?.({ ...migMeta, status: 'done' });
  }

  previousContentStoreSnapshot = { ...cleanedContentStore };
  previousChatSnapshot = new Map();
  for (const chat of chats) {
    previousChatSnapshot.set(chat.id, computeChatFingerprint(chat));
  }

  return {
    chats,
    contentStore: cleanedContentStore,
    branchClipboard: sourceData.branchClipboard ?? null,
  };
}

/**
 * Partial update of migration-meta.
 */
async function updateMigrationMeta(
  partial: Partial<MigrationMetaRecord>
): Promise<void> {
  await withTransaction('readwrite', async (store) => {
    const existing = await idbGet<MigrationMetaRecord>(store, MIGRATION_META_KEY);
    if (existing) {
      await idbPut(store, MIGRATION_META_KEY, { ...existing, ...partial });
    }
  });
}

// ─── Migration from legacy single-key format ───

/**
 * Migrate legacy single-key data. For large payloads (>=8MB), defers to
 * background migration and returns 'large-migration-started' sentinel.
 */
async function migrateLegacyData(
  baseState: StoreState
): Promise<PersistedChatData | null | 'large-migration-started'> {
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

    // Large payload check — defer to background migration
    const payloadSize = estimatePersistedPayloadSize(chatData);
    if (payloadSize >= LARGE_MIGRATION_THRESHOLD) {
      database.close();
      await beginLargeMigration(chatData, version, 'indexeddb-legacy');
      return 'large-migration-started';
    }

    // Small payload — immediate migration (existing path)
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
      chatIds: chats.map((c) => c.id),
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
    const migMeta = await idbGet<MigrationMetaRecord>(store, MIGRATION_META_KEY);

    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    database.close();

    // Check for in-progress large migration
    if (migMeta && (migMeta.status === 'running' || migMeta.status === 'finalizing' || migMeta.status === 'failed')) {
      // Return null — caller (useAppBootstrap) will handle resumption
      return null;
    }

    // If legacy data exists and no meta, do migration
    if (legacy && !meta) {
      const result = await migrateLegacyData(baseState);
      if (result === 'large-migration-started') {
        // Large migration deferred — return null, bootstrap will resume
        return null;
      }
      return result;
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

  let compressed = 0;
  for (const key of rawKeys) {
    if (signal?.aborted) break;
    const id = key.slice('chat:'.length);
    if (id === activeChatId) continue;

    try {
      if (await compressSingleChat(id, signal)) {
        compressed++;
      }
    } catch (e) {
      console.warn(`[IndexedDb] Failed to compress chat ${id}`, e);
    }
  }
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
  LARGE_MIGRATION_THRESHOLD,
  MIGRATION_META_KEY as _MIGRATION_META_KEY,
  MIGRATION_SNAPSHOT_KEY as _MIGRATION_SNAPSHOT_KEY,
};

export const _resetInternalState = () => {
  currentGeneration = 0;
  previousContentStoreSnapshot = {};
  previousChatSnapshot = new Map();
};
