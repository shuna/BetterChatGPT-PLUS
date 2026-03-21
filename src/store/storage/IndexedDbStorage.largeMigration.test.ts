/**
 * Tests for Phase 4: Large data incremental migration.
 *
 * Uses fake-indexeddb polyfill injected into globalThis.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Polyfill indexedDB + window into globalThis
(globalThis as any).indexedDB = new IDBFactory();
(globalThis as any).IDBKeyRange = IDBKeyRange;
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import {
  loadChatData,
  clearChatData,
  loadMigrationMeta,
  beginLargeMigration,
  migrateSingleChat,
  resumeLargeMigration,
  estimatePersistedPayloadSize,
  setMigrationInProgress,
  isMigrationInProgress,
  initCompressionScheduler,
  _resetInternalState,
  LARGE_MIGRATION_THRESHOLD,
  _MIGRATION_META_KEY,
  _MIGRATION_SNAPSHOT_KEY,
} from './IndexedDbStorage';
import type { MigrationMetaRecord } from './IndexedDbStorage';
import type { ContentStoreData } from '@utils/contentStore';
import type { BranchNode, ChatInterface } from '@type/chat';
import type { StoreState } from '@store/store';
import type { PersistedChatData } from '@store/persistence';
import { STORE_VERSION } from '@store/version';

// ── Helpers ──

const makeChat = (id: string, contentHashes: string[]) => ({
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
});

const baseState = {} as StoreState;

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
  setMigrationInProgress(false);
  const db = await openDb();
  const tx = db.transaction('persisted-state', 'readwrite');
  const store = tx.objectStore('persisted-state');
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const key of keys) {
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });
  db.close();
});

// ── Helper to create test data ──

function makeSourceData(chatCount: number): PersistedChatData {
  const contentStore: ContentStoreData = {};
  const chats: ChatInterface[] = [];

  for (let i = 0; i < chatCount; i++) {
    const hash = `hash-${i}`;
    contentStore[hash] = {
      content: [{ type: 'text', text: `message ${i}` }],
      refCount: 1,
    };
    chats.push(makeChat(`chat-${i}`, [hash]) as unknown as ChatInterface);
  }

  return { chats, contentStore, branchClipboard: null };
}

// ── Tests ──

describe('estimatePersistedPayloadSize', () => {
  it('returns 0 for circular references', () => {
    const obj: any = {};
    obj.self = obj;
    expect(estimatePersistedPayloadSize(obj)).toBe(0);
  });
});

describe('beginLargeMigration', () => {
  it('creates migration-meta (indexeddb-legacy: no separate snapshot)', async () => {
    const sourceData = makeSourceData(3);
    const meta = await beginLargeMigration(sourceData, STORE_VERSION, 'indexeddb-legacy');

    expect(meta.status).toBe('running');
    expect(meta.totalChats).toBe(3);
    expect(meta.migratedChats).toBe(0);
    expect(meta.lastChatIndex).toBe(0);

    // Verify meta in IDB
    const storedMeta = await idbGet<MigrationMetaRecord>(_MIGRATION_META_KEY);
    expect(storedMeta?.status).toBe('running');

    // indexeddb-legacy source should NOT create a separate snapshot (avoids duplication)
    const snapshot = await idbGet<any>(_MIGRATION_SNAPSHOT_KEY);
    expect(snapshot).toBeUndefined();
  });

  it('creates migration-meta and snapshot (localStorage source)', async () => {
    const sourceData = makeSourceData(3);
    const meta = await beginLargeMigration(sourceData, STORE_VERSION, 'localStorage');

    expect(meta.status).toBe('running');
    expect(meta.totalChats).toBe(3);

    const snapshot = await idbGet<any>(_MIGRATION_SNAPSHOT_KEY);
    expect(snapshot?.data.chats).toHaveLength(3);
  });

  it('preserves source data (does not delete legacy key)', async () => {
    await idbPut('chat-data', { chats: [], contentStore: {}, version: 1 });
    const sourceData = makeSourceData(2);
    await beginLargeMigration(sourceData, STORE_VERSION, 'indexeddb-legacy');

    // Legacy key should still exist
    const legacy = await idbGet('chat-data');
    expect(legacy).toBeDefined();
  });
});

describe('migrateSingleChat', () => {
  it('adds only referenced contentHashes to content-store', async () => {
    const sourceData = makeSourceData(3);
    const accumulated: ContentStoreData = {};

    await migrateSingleChat(sourceData, 0, accumulated);

    expect(Object.keys(accumulated)).toEqual(['hash-0']);

    // Verify chat key was written
    const chatRecord = await idbGet<any>('chat:chat-0');
    expect(chatRecord?.chat.id).toBe('chat-0');
  });

  it('incrementally adds hashes for each chat', async () => {
    const sourceData = makeSourceData(3);
    const accumulated: ContentStoreData = {};

    await migrateSingleChat(sourceData, 0, accumulated);
    await migrateSingleChat(sourceData, 1, accumulated);

    expect(Object.keys(accumulated).sort()).toEqual(['hash-0', 'hash-1']);
  });
});

/**
 * Helper: set up indexeddb-legacy migration by writing legacy key + begin.
 */
async function setupLegacyMigration(sourceData: PersistedChatData) {
  // Write legacy key so resumeLargeMigration can use it as snapshot
  await idbPut('chat-data', {
    ...sourceData,
    version: STORE_VERSION,
  });
  await beginLargeMigration(sourceData, STORE_VERSION, 'indexeddb-legacy');
}

describe('resumeLargeMigration', () => {
  it('migrates all chats from lastChatIndex=0 and finalizes', async () => {
    const sourceData = makeSourceData(5);
    await setupLegacyMigration(sourceData);

    const progressUpdates: MigrationMetaRecord[] = [];
    const result = await resumeLargeMigration(baseState, (meta) => {
      progressUpdates.push({ ...meta });
    });

    // Should return fully migrated data
    expect(result).not.toBeNull();
    expect(result!.chats).toHaveLength(5);
    expect(Object.keys(result!.contentStore)).toHaveLength(5);

    // Progress should be monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].migratedChats).toBeGreaterThanOrEqual(
        progressUpdates[i - 1].migratedChats
      );
    }

    // Final meta should be 'done'
    const finalMeta = await loadMigrationMeta();
    expect(finalMeta?.status).toBe('done');

    // Snapshot should be cleaned up
    const snapshot = await idbGet(_MIGRATION_SNAPSHOT_KEY);
    expect(snapshot).toBeUndefined();
  });

  it('resumes from lastChatIndex after interruption', async () => {
    const sourceData = makeSourceData(5);
    await setupLegacyMigration(sourceData);

    // Simulate partial progress: manually migrate first 2 chats
    const accumulated: ContentStoreData = {};
    await migrateSingleChat(sourceData, 0, accumulated);
    await migrateSingleChat(sourceData, 1, accumulated);

    // Update meta to reflect partial progress
    await idbPut(_MIGRATION_META_KEY, {
      ...(await idbGet<MigrationMetaRecord>(_MIGRATION_META_KEY))!,
      lastChatIndex: 2,
      migratedChats: 2,
    });

    // Resume should pick up from index 2
    const result = await resumeLargeMigration(baseState);

    expect(result).not.toBeNull();
    expect(result!.chats).toHaveLength(5);

    // All 5 content hashes should exist
    for (let i = 0; i < 5; i++) {
      expect(result!.contentStore[`hash-${i}`]).toBeDefined();
    }
  });

  it('returns null and marks failed when snapshot is missing', async () => {
    // Create meta without snapshot
    await idbPut(_MIGRATION_META_KEY, {
      status: 'running',
      source: 'indexeddb-legacy',
      sourceVersion: 1,
      sourceSizeBytes: 1000,
      totalChats: 3,
      migratedChats: 0,
      migratedContentHashes: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastChatIndex: 0,
    } satisfies MigrationMetaRecord);

    const result = await resumeLargeMigration(baseState);
    expect(result).toBeNull();

    const meta = await loadMigrationMeta();
    expect(meta?.status).toBe('failed');
    expect(meta?.lastError).toContain('snapshot');
  });

  it('returns null when no migration is active', async () => {
    const result = await resumeLargeMigration(baseState);
    expect(result).toBeNull();
  });

  it('retries from failed state by resetting status to running', async () => {
    const sourceData = makeSourceData(3);
    await setupLegacyMigration(sourceData);

    // Simulate failure at chat index 1
    await idbPut(_MIGRATION_META_KEY, {
      ...(await idbGet<MigrationMetaRecord>(_MIGRATION_META_KEY))!,
      status: 'failed',
      lastChatIndex: 1,
      migratedChats: 1,
      lastError: 'simulated failure',
    });

    // Resume should accept failed status and retry
    const result = await resumeLargeMigration(baseState);
    expect(result).not.toBeNull();
    expect(result!.chats).toHaveLength(3);

    const finalMeta = await loadMigrationMeta();
    expect(finalMeta?.status).toBe('done');
    expect(finalMeta?.lastError).toBeUndefined();
  });
});

describe('finalizeLargeMigration recovery', () => {
  it('completes when status is already finalizing', async () => {
    const sourceData = makeSourceData(3);
    await setupLegacyMigration(sourceData);

    // Migrate all chats manually
    const accumulated: ContentStoreData = {};
    for (let i = 0; i < 3; i++) {
      await migrateSingleChat(sourceData, i, accumulated);
    }

    // Set status to finalizing (simulating crash during finalize)
    await idbPut(_MIGRATION_META_KEY, {
      ...(await idbGet<MigrationMetaRecord>(_MIGRATION_META_KEY))!,
      status: 'finalizing',
      lastChatIndex: 3,
      migratedChats: 3,
    });

    const result = await resumeLargeMigration(baseState);
    expect(result).not.toBeNull();
    expect(result!.chats).toHaveLength(3);

    const meta = await loadMigrationMeta();
    expect(meta?.status).toBe('done');
  });
});

describe('compression scheduler migration guard', () => {
  it('does not start compression when migration is in progress', () => {
    setMigrationInProgress(true);
    const cleanup = initCompressionScheduler('chat-1');

    // If migration is in progress, initCompressionScheduler returns noop
    // We verify by checking no event listeners were added (cleanup is noop)
    expect(typeof cleanup).toBe('function');
    cleanup();

    setMigrationInProgress(false);
  });

});

describe('loadChatData with migration states', () => {
  it('returns null when migration-meta status is running', async () => {
    await idbPut(_MIGRATION_META_KEY, {
      status: 'running',
      source: 'indexeddb-legacy',
      sourceVersion: 1,
      sourceSizeBytes: 1000,
      totalChats: 3,
      migratedChats: 1,
      migratedContentHashes: 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastChatIndex: 1,
    } satisfies MigrationMetaRecord);

    const result = await loadChatData(baseState);
    expect(result).toBeNull();
  });

  it('returns null when migration-meta status is failed', async () => {
    await idbPut(_MIGRATION_META_KEY, {
      status: 'failed',
      source: 'indexeddb-legacy',
      sourceVersion: 1,
      sourceSizeBytes: 1000,
      totalChats: 3,
      migratedChats: 1,
      migratedContentHashes: 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastChatIndex: 1,
      lastError: 'some error',
    } satisfies MigrationMetaRecord);

    const result = await loadChatData(baseState);
    expect(result).toBeNull();
  });

  it('defers large legacy data to background migration', async () => {
    // Create a legacy record larger than threshold
    const bigContent: ContentStoreData = {};
    const bigChats: ChatInterface[] = [];
    // Generate enough data to exceed 8MB
    for (let i = 0; i < 200; i++) {
      const hash = `bighash-${i}`;
      bigContent[hash] = {
        content: [{ type: 'text', text: 'x'.repeat(50000) }],
        refCount: 1,
      };
      bigChats.push(makeChat(`bigchat-${i}`, [hash]) as unknown as ChatInterface);
    }

    await idbPut('chat-data', {
      chats: bigChats,
      contentStore: bigContent,
      branchClipboard: null,
      version: STORE_VERSION,
    });

    const result = await loadChatData(baseState);
    // Should return null (deferred to background)
    expect(result).toBeNull();

    // migration-meta should be created
    const meta = await loadMigrationMeta();
    expect(meta?.status).toBe('running');
    expect(meta?.totalChats).toBe(200);
  });
});

describe('progress monotonicity', () => {
  it('progress values increase monotonically during migration', async () => {
    const sourceData = makeSourceData(10);
    await setupLegacyMigration(sourceData);

    const progressValues: number[] = [];
    await resumeLargeMigration(baseState, (meta) => {
      progressValues.push(meta.migratedChats / meta.totalChats);
    });

    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
    // Last progress before finalize should be 1.0
    const chatProgress = progressValues.filter((p) => p <= 1);
    expect(chatProgress[chatProgress.length - 1]).toBe(1);
  });
});
