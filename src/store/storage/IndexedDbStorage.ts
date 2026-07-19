import {
  getStreamingChatIds,
  isStreamingContentHash,
} from '@utils/streamingBuffer';
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
import { ensureUniqueChatIds } from '@utils/chatIdentity';
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
  compressedBase64?: string;
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

export type ChatDataLoadStatus = 'ok' | 'degraded';

export type ChatDataLoadResult = PersistedChatData & {
  loadStatus: ChatDataLoadStatus;
  missingChatIds: string[];
  errors: string[];
};

let currentGeneration = 0;
let previousContentStoreSnapshot: ContentStoreData = {};
let migrationInProgress = false;
let chatDataWritesBlocked = false;
let storageMutationQueue: Promise<void> = Promise.resolve();
let hasLoadedCommittedSnapshot = false;

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
  });

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const withCrossContextStorageLock = async <T>(run: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(
      `${DB_NAME}:${STORE_NAME}:mutation`,
      { mode: 'exclusive' },
      run
    );
  }
  return run();
};

const enqueueStorageMutation = <T>(run: () => Promise<T>): Promise<T> => {
  const result = storageMutationQueue.then(
    () => withCrossContextStorageLock(run),
    () => withCrossContextStorageLock(run)
  );
  storageMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

export function setChatDataWritesBlocked(blocked: boolean): void {
  chatDataWritesBlocked = blocked;
  if (blocked) cancelCompression();
}

export function areChatDataWritesBlocked(): boolean {
  return chatDataWritesBlocked;
}

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
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE_NAME);
    try {
      const result = await run(store);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      await done.catch(() => undefined);
      throw error;
    }
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
    if (
      chat.branchTree?.nodes &&
      typeof chat.branchTree.nodes === 'object' &&
      !Array.isArray(chat.branchTree.nodes)
    ) {
      for (const node of Object.values(chat.branchTree.nodes)) {
        refs.add(node.contentHash);
      }
    }
  }
  if (
    clipboard?.nodes &&
    typeof clipboard.nodes === 'object' &&
    !Array.isArray(clipboard.nodes)
  ) {
    for (const node of Object.values(clipboard.nodes)) {
      refs.add(node.contentHash);
    }
  }
  return refs;
}

function findPersistedDataIntegrityErrors(
  chats: PersistedChat[],
  contentStore: ContentStoreData,
  clipboard: BranchClipboard | null,
  options: { allowTransientStreamingHashes?: boolean } = {}
): string[] {
  const errors: string[] = [];
  const seenChatIds = new Set<string>();

  const checkContentHash = (hash: unknown, owner: string) => {
    // A page can close between persisting a streaming placeholder and the
    // final buffered snapshot. Rehydration already replaces these known
    // transient references with recoverable empty content. Let that repair
    // run instead of classifying the whole committed snapshot as corrupt.
    if (
      options.allowTransientStreamingHashes &&
      typeof hash === 'string' &&
      isStreamingContentHash(hash)
    ) {
      return;
    }
    if (typeof hash !== 'string' || !contentStore[hash]) {
      errors.push(`Missing contentHash for ${owner}: ${String(hash)}`);
      return;
    }
    const visited = new Set<string>();
    let current = hash;
    while (contentStore[current]?.delta) {
      if (visited.has(current)) {
        errors.push(`Circular delta chain for ${owner}: ${hash}`);
        return;
      }
      visited.add(current);
      current = contentStore[current].delta!.baseHash;
      if (!contentStore[current]) {
        errors.push(`Missing delta base for ${owner}: ${current}`);
        return;
      }
    }
  };

  for (const chat of chats) {
    if (!chat || typeof chat.id !== 'string' || chat.id.length === 0) {
      errors.push('Chat has an invalid id');
      continue;
    }
    if (seenChatIds.has(chat.id)) {
      errors.push(`Duplicate chat id: ${chat.id}`);
    }
    seenChatIds.add(chat.id);

    if (!chat.branchTree) continue;
    if (
      !chat.branchTree.nodes ||
      typeof chat.branchTree.nodes !== 'object' ||
      Array.isArray(chat.branchTree.nodes)
    ) {
      errors.push(`Invalid branchTree nodes: ${chat.id}`);
      continue;
    }
    for (const node of Object.values(chat.branchTree.nodes)) {
      checkContentHash(node?.contentHash, `chat ${chat.id}`);
    }
  }

  if (
    clipboard &&
    (!clipboard.nodes ||
      typeof clipboard.nodes !== 'object' ||
      Array.isArray(clipboard.nodes))
  ) {
    errors.push('Invalid branch clipboard nodes');
  } else if (clipboard?.nodes) {
    for (const node of Object.values(clipboard.nodes)) {
      checkContentHash(node?.contentHash, 'branch clipboard');
    }
  }

  return errors;
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
): Promise<ChatDataLoadResult | null> {
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

    // Rehydrate has always repaired invalid/duplicate IDs and malformed node
    // maps. Apply the same non-destructive normalization to a migration copy
    // before integrity validation, otherwise repairable legacy data is locked
    // behind the recovery banner forever.
    const legacyChats = ((legacy.chats ?? []) as PersistedChat[]).map((chat) => {
      if (!chat || typeof chat !== 'object' || !chat.branchTree) return chat;
      const nodes = chat.branchTree.nodes;
      return {
        ...chat,
        branchTree: {
          ...chat.branchTree,
          nodes:
            nodes && typeof nodes === 'object' && !Array.isArray(nodes)
              ? { ...nodes }
              : {},
        },
      };
    });
    if (legacyChats.every((chat) => chat && typeof chat === 'object')) {
      ensureUniqueChatIds(legacyChats as ChatInterface[]);
    }

    const chatData: PersistedChatData = {
      chats: legacyChats,
      contentStore: legacy.contentStore,
      branchClipboard: legacy.branchClipboard ?? null,
    };

    const chats = (chatData.chats ?? []) as PersistedChat[];
    const integrityErrors = findPersistedDataIntegrityErrors(
      chats,
      chatData.contentStore ?? {},
      chatData.branchClipboard ?? null,
      { allowTransientStreamingHashes: true }
    );
    if (integrityErrors.length > 0) {
      return {
        ...chatData,
        loadStatus: 'degraded',
        missingChatIds: [],
        errors: integrityErrors,
      };
    }
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
    hasLoadedCommittedSnapshot = true;
    previousContentStoreSnapshot = { ...(chatData.contentStore ?? {}) };

    return {
      ...chatData,
      loadStatus: 'ok',
      missingChatIds: [],
      errors: [],
    };
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
): Promise<ChatDataLoadResult | null> => {
  if (!hasIndexedDb()) return null;

  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const txDone = transactionDone(tx);
    const store = tx.objectStore(STORE_NAME);

    const [legacy, meta] = await Promise.all([
      idbGet<LegacyChatDataRecord>(store, LEGACY_KEY),
      idbGet<MetaRecord>(store, META_KEY),
    ]);

    await txDone;
    database.close();

    // If legacy data exists and no meta, migrate storage format (not schema)
    if (legacy && !meta) {
      const migrated = await enqueueStorageMutation(() => migrateLegacyData(baseState));
      if (migrated) return migrated;

      // Another tab may have completed the migration while this tab waited
      // for the mutation lock. Re-read the committed format rather than
      // treating the store as empty and starting a destructive first save.
      return loadChatData(baseState);
    }

    if (!meta) return null;

    return withCrossContextStorageLock(async () => {
      // The meta observed before waiting for the lock may already be stale.
      const currentMeta = await withTransaction('readonly', (store) =>
        idbGet<MetaRecord>(store, META_KEY)
      );
      return currentMeta ? loadSplitData(currentMeta) : null;
    });
  } catch (e) {
    database.close();
    throw e;
  }
};

async function loadSplitData(
  meta: MetaRecord
): Promise<ChatDataLoadResult | null> {
  const G = meta.generation;

  const database = await openDatabase();
  try {
    const keyTx = database.transaction(STORE_NAME, 'readonly');
    const keyTxDone = transactionDone(keyTx);
    const allKeys = await idbGetAllKeys(keyTx.objectStore(STORE_NAME));
    await keyTxDone;
    const rawChatKeys = (allKeys as string[]).filter(
      (k) => typeof k === 'string' && k.startsWith('chat:') && !isPackedKey(k)
    );
    const packedChatKeys = (allKeys as string[]).filter(
      (k) => typeof k === 'string' && isPackedKey(k)
    );

    // Start a fresh transaction and issue every record request synchronously,
    // without awaiting a prior request in that transaction. Gzip
    // decompression happens only after recordTxDone.
    const recordTx = database.transaction(STORE_NAME, 'readonly');
    const recordTxDone = transactionDone(recordTx);
    const recordStore = recordTx.objectStore(STORE_NAME);
    const [csRecord, cbRecord, rawValues, packedValues] = await Promise.all([
      idbGet<ContentStoreRecord>(recordStore, CONTENT_STORE_KEY),
      idbGet<BranchClipboardRecord>(recordStore, BRANCH_CLIPBOARD_KEY),
      Promise.all(rawChatKeys.map((key) => idbGet<ChatRecord>(recordStore, key))),
      Promise.all(
        packedChatKeys.map((key) =>
          idbGet<{ compressed: Uint8Array; generation: number }>(recordStore, key)
        )
      ),
    ]);
    await recordTxDone;
    database.close();

    const errors: string[] = [];
    const chatRecords: Array<{ key: string; record: ChatRecord }> = [];
    const usableRawKeys = new Set<string>();

    // When meta and content-store describe the same committed generation,
    // meta.chatIds is authoritative. Records outside that set are leftovers
    // from an interrupted cleanup, not evidence that the committed snapshot
    // failed to load. Keep them on disk for recovery, but do not let a
    // malformed orphan permanently force the app into read-only mode.
    const csGen = csRecord?.generation ?? 0;
    const committedGen = Math.max(G, csGen);
    const authoritativeChatIds =
      csGen <= G && meta.chatIds ? new Set(meta.chatIds) : null;
    const belongsToCommittedSnapshot = (key: string) => {
      if (!authoritativeChatIds) return true;
      return authoritativeChatIds.has(key.slice('chat:'.length));
    };

    for (let i = 0; i < rawChatKeys.length; i++) {
      const key = rawChatKeys[i];
      const record = rawValues[i];
      const expectedId = key.slice('chat:'.length);
      if (
        record?.chat &&
        typeof record.chat === 'object' &&
        record.chat.id === expectedId &&
        Number.isFinite(record.generation)
      ) {
        // A raw record from an interrupted future generation is not eligible
        // for raw-first resolution. A packed record may still contain the
        // last committed version of the same chat.
        if (record.generation <= committedGen) {
          usableRawKeys.add(key);
        }
        chatRecords.push({ key, record });
      } else if (belongsToCommittedSnapshot(key)) {
        errors.push(`Invalid raw chat record: ${key}`);
      }
    }

    for (let i = 0; i < packedChatKeys.length; i++) {
      const pk = packedChatKeys[i];
      const rawKey = pk.slice(0, -':packed'.length);
      if (usableRawKeys.has(rawKey)) continue;

      const packed = packedValues[i];
      if (packed?.compressed) {
        try {
          const record = await decompressChatRecord<ChatRecord>(
            packed.compressed instanceof Uint8Array
              ? packed.compressed
              : new Uint8Array(packed.compressed as ArrayBufferLike)
          );
          const expectedId = rawKey.slice('chat:'.length);
          if (!record?.chat || record.chat.id !== expectedId) {
            throw new Error(`Packed chat id does not match key: ${expectedId}`);
          }
          chatRecords.push({
            key: rawKey,
            record: { ...record, generation: packed.generation },
          });
          const invalidRawError = `Invalid raw chat record: ${rawKey}`;
          const invalidRawIndex = errors.indexOf(invalidRawError);
          if (invalidRawIndex >= 0) errors.splice(invalidRawIndex, 1);
        } catch (e) {
          console.warn(`[IndexedDb] Failed to decompress ${pk}, skipping`, e);
          if (belongsToCommittedSnapshot(rawKey)) {
            errors.push(`Failed to decompress packed chat: ${pk}`);
          }
        }
      } else if (belongsToCommittedSnapshot(rawKey)) {
        errors.push(`Invalid packed chat record: ${pk}`);
      }
    }

    // ── Generation reconciliation ──

    // Determine the effective committed generation.
    // content-store is written first (step 1), so it may be ahead of meta.

    // Chat records: filter by generation AND by the authoritative chat ID list
    // stored in meta. This prevents deleted chats from resurrecting when the
    // app crashes after Step 3 (meta written) but before Step 4 (stale key cleanup).
    //
    // However, if csGen > G (content-store was written but meta was not updated),
    // meta.chatIds is stale and may not include chats added in the newer generation.
    // In that case, skip chatIds filtering to avoid dropping valid new chats.
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
    hasLoadedCommittedSnapshot = true;

    // Raise the needs-migration flag if stored data predates current schema
    if (meta.version < STORE_VERSION) {
      migratePersistedState({}, meta.version);
    }

    let contentStore = csRecord?.data ?? {};
    if (!csRecord || !csRecord.data || typeof csRecord.data !== 'object') {
      errors.push('Missing or invalid content-store record');
    }

    const recoveredChatIds = new Set(chats.map((chat) => chat.id));
    const missingChatIds = (meta.chatIds ?? []).filter((id) => !recoveredChatIds.has(id));
    for (const id of missingChatIds) {
      errors.push(`Missing committed chat: ${id}`);
    }

    errors.push(...findPersistedDataIntegrityErrors(chats, contentStore, clipboard, {
      allowTransientStreamingHashes: true,
    }));

    const loadStatus: ChatDataLoadStatus = errors.length > 0 ? 'degraded' : 'ok';

    // Run residual GC to clean up any leftover superset entries
    // only after a complete load. A partial load must never discard content
    // belonging to a chat that could not be decoded.
    if (loadStatus === 'ok') {
      contentStore = runResidualGC(contentStore, chats, clipboard);
    }

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
      loadStatus,
      missingChatIds,
      errors,
    };
  } catch (e) {
    database.close();
    throw e;
  }
}

async function collectIndexedDbRecoverySnapshotUnlocked(): Promise<IndexedDbRecoverySnapshot | null> {
  if (!hasIndexedDb()) return null;

  const database = await openDatabase();
  try {
    const keyTx = database.transaction(STORE_NAME, 'readonly');
    const keyTxDone = transactionDone(keyTx);
    const allKeys = await idbGetAllKeys(keyTx.objectStore(STORE_NAME));
    await keyTxDone;
    const keys = allKeys
      .filter((key): key is string => typeof key === 'string')
      .sort();

    if (keys.length === 0) {
      return null;
    }

    const rawChatKeys = keys.filter(
      (key) => key.startsWith('chat:') && !isPackedKey(key)
    );
    const packedChatKeys = keys.filter(isPackedKey);
    const recordTx = database.transaction(STORE_NAME, 'readonly');
    const recordTxDone = transactionDone(recordTx);
    const recordStore = recordTx.objectStore(STORE_NAME);
    const [meta, legacy, contentStore, branchClipboard, rawValues, packedValues] = await Promise.all([
      idbGet<MetaRecord>(recordStore, META_KEY),
      idbGet<LegacyChatDataRecord>(recordStore, LEGACY_KEY),
      idbGet<ContentStoreRecord>(recordStore, CONTENT_STORE_KEY),
      idbGet<BranchClipboardRecord>(recordStore, BRANCH_CLIPBOARD_KEY),
      Promise.all(rawChatKeys.map((key) => idbGet<ChatRecord>(recordStore, key))),
      Promise.all(
        packedChatKeys.map((key) =>
          idbGet<{ compressed: Uint8Array; generation: number }>(recordStore, key)
        )
      ),
    ]);
    await recordTxDone;

    const chats: IndexedDbRecoveryChatSnapshot[] = [];

    for (let i = 0; i < rawChatKeys.length; i++) {
      const key = rawChatKeys[i];
      const record = rawValues[i];
      chats.push({
        key,
        packed: false,
        generation: record?.generation,
        record,
      });
    }

    for (let i = 0; i < packedChatKeys.length; i++) {
      const key = packedChatKeys[i];
      const packed = packedValues[i];
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
          snapshot.compressedBase64 = bytesToBase64(compressed);
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

    return snapshot;
  } finally {
    database.close();
  }
}

export const collectIndexedDbRecoverySnapshot = (
  options: { consistent?: boolean } = {}
): Promise<IndexedDbRecoverySnapshot | null> =>
  options.consistent === false
    ? collectIndexedDbRecoverySnapshotUnlocked()
    : withCrossContextStorageLock(collectIndexedDbRecoverySnapshotUnlocked);

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
const saveChatDataUnlocked = async (data: PersistedChatData): Promise<void> => {
  if (!hasIndexedDb()) return;
  if (chatDataWritesBlocked) {
    throw new Error('Chat data writes are blocked because persisted data did not load safely');
  }
  debugReport('idb-save', { label: 'IndexedDB Save', status: 'active' });
  if (migrationInProgress) {
    throw new Error('Chat data save deferred because migration is in progress');
  }

  const diskMeta = await withTransaction('readonly', (store) =>
    idbGet<MetaRecord>(store, META_KEY)
  );
  if (
    diskMeta &&
    diskMeta.generation > currentGeneration &&
    hasLoadedCommittedSnapshot
  ) {
    throw new Error(
      'Refusing to overwrite chat data because a newer generation was saved by another context'
    );
  }
  currentGeneration = Math.max(currentGeneration, diskMeta?.generation ?? 0);
  const nextGen = currentGeneration + 1;
  const chats = (data.chats ?? []) as PersistedChat[];
  const contentStore = data.contentStore ?? {};
  const clipboard = data.branchClipboard ?? null;
  const integrityErrors = findPersistedDataIntegrityErrors(chats, contentStore, clipboard);
  if (integrityErrors.length > 0) {
    throw new Error(`Refusing to persist inconsistent chat data: ${integrityErrors.join('; ')}`);
  }
  if ((diskMeta?.chatIds?.length ?? 0) > 0 && chats.length === 0) {
    throw new Error('Refusing to replace a non-empty committed store with an empty chat list');
  }

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
  hasLoadedCommittedSnapshot = true;

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

export const saveChatData = (data: PersistedChatData): Promise<void> =>
  enqueueStorageMutation(() => saveChatDataUnlocked(data));

// ─── Copy-on-Write Compression ───

/** Active compression abort controller — only one compression cycle runs at a time */
let compressionAbort: AbortController | null = null;

/**
 * Compress a single chat with an atomic compare-and-swap transaction.
 * Returns true if compression succeeded.
 */
async function commitCompressedChatUnlocked(
  chatId: string,
  rawRecord: ChatRecord,
  compressed: Uint8Array,
  signal?: AbortSignal
): Promise<boolean> {
  if (chatDataWritesBlocked || signal?.aborted) return false;
  const key = chatKey(chatId);
  const pk = packedKey(key);
  // Compare-and-swap the raw record and packed replacement in one atomic
  // transaction. If another writer changed the chat while compression was
  // running, preserve the newer raw record.
  return withTransaction('readwrite', async (store) => {
    const currentRaw = await idbGet<ChatRecord>(store, key);
    if (
      !currentRaw?.chat ||
      currentRaw.generation !== rawRecord.generation ||
      computeChatFingerprint(currentRaw.chat) !== computeChatFingerprint(rawRecord.chat)
    ) {
      return false;
    }
    await idbPut(store, pk, {
      compressed,
      generation: rawRecord.generation,
    });
    await idbDelete(store, key);
    return true;
  });
}

export const compressSingleChat = (
  chatId: string,
  signal?: AbortSignal
): Promise<boolean> => {
  if (!isCompressionSupported() || chatDataWritesBlocked || signal?.aborted) {
    return Promise.resolve(false);
  }

  // Gzip can be relatively slow. Do the immutable read and compression before
  // taking the mutation queue/Web Lock, then use CAS for the short commit.
  return withTransaction('readonly', (store) =>
    idbGet<ChatRecord>(store, chatKey(chatId))
  ).then(async (rawRecord) => {
    if (!rawRecord?.chat || signal?.aborted || chatDataWritesBlocked) return false;
    const compressed = await compressChatRecord(rawRecord);
    if (signal?.aborted || chatDataWritesBlocked) return false;
    return enqueueStorageMutation(() =>
      commitCompressedChatUnlocked(chatId, rawRecord, compressed, signal)
    );
  });
};

/**
 * Decompress a single chat without overwriting an equal or newer raw record.
 * Returns true if decompression occurred.
 */
async function commitDecompressedChatUnlocked(
  chatId: string,
  packed: { compressed: Uint8Array; generation: number },
  record: ChatRecord
): Promise<boolean> {
  if (chatDataWritesBlocked) return false;
  const key = chatKey(chatId);
  const pk = packedKey(key);
  return withTransaction('readwrite', async (store) => {
    const [currentPacked, currentRaw] = await Promise.all([
      idbGet<{ compressed: Uint8Array; generation: number }>(store, pk),
      idbGet<ChatRecord>(store, key),
    ]);
    if (!currentPacked?.compressed || currentPacked.generation !== packed.generation) {
      return false;
    }
    if (currentRaw && currentRaw.generation >= packed.generation) {
      await idbDelete(store, pk);
      return false;
    }
    await idbPut(store, key, {
      chat: record.chat,
      generation: packed.generation,
    });
    await idbDelete(store, pk);
    return true;
  });
}

export const decompressSingleChat = async (chatId: string): Promise<boolean> => {
  if (chatDataWritesBlocked) return false;

  // As with compression, keep the CPU/stream work outside the mutation lock.
  // The commit re-checks the generation so a newer packed/raw record wins.
  const packed = await withTransaction('readonly', (store) =>
    idbGet<{ compressed: Uint8Array; generation: number }>(store, packedKey(chatKey(chatId)))
  );
  if (!packed?.compressed || chatDataWritesBlocked) return false;
  const compressed = packed.compressed instanceof Uint8Array
    ? packed.compressed
    : new Uint8Array(packed.compressed as ArrayBufferLike);
  const record = await decompressChatRecord<ChatRecord>(compressed);
  if (chatDataWritesBlocked) return false;
  return enqueueStorageMutation(() =>
    commitDecompressedChatUnlocked(chatId, { ...packed, compressed }, record)
  );
};

/**
 * Compress inactive chats. `activeChatId` is excluded.
 * Processes chats sequentially. Abortable via signal.
 */
export async function compressInactiveChats(
  activeChatId: string | undefined,
  signal?: AbortSignal
): Promise<number> {
  if (!isCompressionSupported() || chatDataWritesBlocked) return 0;

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
  if (migrationInProgress || chatDataWritesBlocked) return;
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
  if (chatDataWritesBlocked) return;
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
  if (!isCompressionSupported() || migrationInProgress || chatDataWritesBlocked) {
    return () => {};
  }

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

const clearChatDataUnlocked = async (): Promise<void> => {
  if (!hasIndexedDb()) return;

  await withTransaction('readwrite', async (store) => {
    const allKeys = await idbGetAllKeys(store);
    for (const key of allKeys) {
      await idbDelete(store, key as string);
    }
  });

  currentGeneration = 0;
  hasLoadedCommittedSnapshot = false;
  previousContentStoreSnapshot = {};
  previousChatSnapshot = new Map();
};

export const clearChatData = (): Promise<void> =>
  enqueueStorageMutation(clearChatDataUnlocked);

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
  hasLoadedCommittedSnapshot = false;
  previousContentStoreSnapshot = {};
  previousChatSnapshot = new Map();
  chatDataWritesBlocked = false;
  storageMutationQueue = Promise.resolve();
};
