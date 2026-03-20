export interface StreamRecord {
  requestId: string;
  chatIndex: number;
  messageIndex: number;
  bufferedText: string;
  status: 'streaming' | 'completed' | 'interrupted' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
  acknowledged: boolean;
  /** Proxy session ID for server-side recovery (set when proxy mode is active) */
  proxySessionId?: string;
  /** Last received proxy event ID for recovery offset */
  lastProxyEventId?: number;
  /** OpenRouter generation ID when present in the upstream stream */
  generationId?: string;
}

const DB_NAME = 'sw-stream-db';
const STORE_NAME = 'requests';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'requestId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRequest(record: StreamRecord): Promise<void> {
  const db = await openDb();
  await reqToPromise(tx(db, 'readwrite').put(record));
  db.close();
}

export async function getRequest(requestId: string): Promise<StreamRecord | undefined> {
  const db = await openDb();
  const result = await reqToPromise(tx(db, 'readonly').get(requestId));
  db.close();
  return result;
}

export async function appendText(
  requestId: string,
  text: string,
  lastProxyEventId?: number,
  generationId?: string
): Promise<void> {
  const db = await openDb();
  const store = tx(db, 'readwrite');
  const record: StreamRecord | undefined = await reqToPromise(store.get(requestId));
  if (record) {
    record.bufferedText += text;
    record.updatedAt = Date.now();
    if (lastProxyEventId !== undefined) {
      record.lastProxyEventId = lastProxyEventId;
    }
    if (generationId !== undefined) {
      record.generationId = generationId;
    }
    await reqToPromise(store.put(record));
  }
  db.close();
}

export async function setGenerationId(
  requestId: string,
  generationId: string
): Promise<void> {
  const db = await openDb();
  const store = tx(db, 'readwrite');
  const record: StreamRecord | undefined = await reqToPromise(store.get(requestId));
  if (record) {
    record.generationId = generationId;
    record.updatedAt = Date.now();
    await reqToPromise(store.put(record));
  }
  db.close();
}

export async function updateStatus(
  requestId: string,
  status: StreamRecord['status'],
  error?: string
): Promise<void> {
  const db = await openDb();
  const store = tx(db, 'readwrite');
  const record: StreamRecord | undefined = await reqToPromise(store.get(requestId));
  if (record) {
    record.status = status;
    record.updatedAt = Date.now();
    if (error !== undefined) record.error = error;
    await reqToPromise(store.put(record));
  }
  db.close();
}

export async function getAllPending(): Promise<StreamRecord[]> {
  const db = await openDb();
  const all: StreamRecord[] = await reqToPromise(tx(db, 'readonly').getAll());
  db.close();
  return all.filter((r) => !r.acknowledged);
}

export async function deleteRequest(requestId: string): Promise<void> {
  const db = await openDb();
  await reqToPromise(tx(db, 'readwrite').delete(requestId));
  db.close();
}

export async function cleanupStale(maxAgeMs: number = 3600000): Promise<void> {
  const db = await openDb();
  const store = tx(db, 'readwrite');
  const all: StreamRecord[] = await reqToPromise(store.getAll());
  const now = Date.now();
  for (const r of all) {
    if (now - r.createdAt > maxAgeMs) {
      store.delete(r.requestId);
    }
  }
  db.close();
}
