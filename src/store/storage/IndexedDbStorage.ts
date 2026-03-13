import { STORE_VERSION } from '@store/version';
import {
  migratePersistedChatDataState,
  type PersistedChatData,
} from '@store/persistence';
import type { StoreState } from '@store/store';

const DB_NAME = 'weavelet-canvas';
const DB_VERSION = 1;
const STORE_NAME = 'persisted-state';
const CHAT_DATA_KEY = 'chat-data';

type ChatDataRecord = PersistedChatData & {
  version: number;
};

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

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> => {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await run(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });

    return result;
  } finally {
    database.close();
  }
};

export const loadChatData = async (
  baseState: StoreState
): Promise<PersistedChatData | null> => {
  if (!hasIndexedDb()) return null;

  return await withStore('readonly', async (store) => {
    const record = await new Promise<ChatDataRecord | undefined>((resolve, reject) => {
      const request = store.get(CHAT_DATA_KEY);
      request.onsuccess = () => resolve(request.result as ChatDataRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read chat data from IndexedDB'));
    });

    if (!record) return null;

    const chatData = {
      chats: record.chats,
      contentStore: record.contentStore,
      branchClipboard: record.branchClipboard ?? null,
    };
    const version = typeof record.version === 'number' ? record.version : 0;

    if (version < STORE_VERSION) {
      const migrated = migratePersistedChatDataState(baseState, chatData, version);
      await saveChatData(migrated);
      return migrated;
    }

    return chatData;
  });
};

export const saveChatData = async (data: PersistedChatData): Promise<void> => {
  if (!hasIndexedDb()) return;

  await withStore('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ ...data, version: STORE_VERSION }, CHAT_DATA_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to save chat data to IndexedDB'));
    });
  });
};

export const clearChatData = async (): Promise<void> => {
  if (!hasIndexedDb()) return;

  await withStore('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(CHAT_DATA_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to clear chat data from IndexedDB'));
    });
  });
};
