import { describe, expect, it, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Polyfill IndexedDB for test environment
(globalThis as any).indexedDB = new IDBFactory();
(globalThis as any).IDBKeyRange = IDBKeyRange;

import {
  saveRequest,
  getRequest,
  appendText,
  setGenerationId,
  updateStatus,
  getAllPending,
  deleteRequest,
  cleanupStale,
  type StreamRecord,
} from './streamDb';

function makeRecord(overrides: Partial<StreamRecord> = {}): StreamRecord {
  return {
    requestId: 'req-1',
    chatIndex: 0,
    messageIndex: 1,
    bufferedText: '',
    status: 'streaming',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    acknowledged: false,
    ...overrides,
  };
}

beforeEach(async () => {
  // Clear all records
  const all = await getAllPending();
  for (const r of all) {
    await deleteRequest(r.requestId);
  }
});

describe('streamDb CRUD', () => {
  it('saves and retrieves a record', async () => {
    const record = makeRecord({ requestId: 'crud-1', bufferedText: 'hello' });
    await saveRequest(record);
    const result = await getRequest('crud-1');
    expect(result).toBeDefined();
    expect(result!.requestId).toBe('crud-1');
    expect(result!.bufferedText).toBe('hello');
    expect(result!.status).toBe('streaming');
  });

  it('returns undefined for non-existent record', async () => {
    const result = await getRequest('nonexistent');
    expect(result).toBeUndefined();
  });

  it('deletes a record', async () => {
    await saveRequest(makeRecord({ requestId: 'del-1' }));
    await deleteRequest('del-1');
    const result = await getRequest('del-1');
    expect(result).toBeUndefined();
  });

  it('delete is no-op for non-existent record', async () => {
    await expect(deleteRequest('nonexistent')).resolves.toBeUndefined();
  });
});

describe('appendText', () => {
  it('appends text to existing record', async () => {
    await saveRequest(makeRecord({ requestId: 'append-1', bufferedText: 'Hello' }));
    await appendText('append-1', ' World');
    const result = await getRequest('append-1');
    expect(result!.bufferedText).toBe('Hello World');
  });

  it('updates updatedAt timestamp', async () => {
    const before = Date.now();
    await saveRequest(makeRecord({ requestId: 'append-ts', updatedAt: before - 5000 }));
    await appendText('append-ts', 'text');
    const result = await getRequest('append-ts');
    expect(result!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is no-op for non-existent record', async () => {
    await expect(appendText('nonexistent', 'text')).resolves.toBeUndefined();
  });

  it('updates lastProxyEventId when provided', async () => {
    await saveRequest(makeRecord({ requestId: 'append-eid', lastProxyEventId: 0 }));
    await appendText('append-eid', 'chunk', 42);
    const result = await getRequest('append-eid');
    expect(result!.lastProxyEventId).toBe(42);
    expect(result!.bufferedText).toBe('chunk');
  });

  it('does not change lastProxyEventId when not provided', async () => {
    await saveRequest(makeRecord({ requestId: 'append-no-eid', lastProxyEventId: 10 }));
    await appendText('append-no-eid', 'chunk');
    const result = await getRequest('append-no-eid');
    expect(result!.lastProxyEventId).toBe(10);
  });

  it('stores generationId when provided', async () => {
    await saveRequest(makeRecord({ requestId: 'append-gen' }));
    await appendText('append-gen', 'chunk', 7, 'gen-123');
    const result = await getRequest('append-gen');
    expect(result!.generationId).toBe('gen-123');
  });

  it('accumulates text over multiple appends', async () => {
    await saveRequest(makeRecord({ requestId: 'append-multi' }));
    await appendText('append-multi', 'a');
    await appendText('append-multi', 'b');
    await appendText('append-multi', 'c');
    const result = await getRequest('append-multi');
    expect(result!.bufferedText).toBe('abc');
  });
});

describe('updateStatus', () => {
  it('updates status field', async () => {
    await saveRequest(makeRecord({ requestId: 'status-1', status: 'streaming' }));
    await updateStatus('status-1', 'completed');
    const result = await getRequest('status-1');
    expect(result!.status).toBe('completed');
  });

  it('sets error when provided', async () => {
    await saveRequest(makeRecord({ requestId: 'status-err' }));
    await updateStatus('status-err', 'failed', 'Network error');
    const result = await getRequest('status-err');
    expect(result!.status).toBe('failed');
    expect(result!.error).toBe('Network error');
  });

  it('is no-op for non-existent record', async () => {
    await expect(updateStatus('nonexistent', 'completed')).resolves.toBeUndefined();
  });
});

describe('getAllPending', () => {
  it('returns only non-acknowledged records', async () => {
    await saveRequest(makeRecord({ requestId: 'pending-1', acknowledged: false }));
    await saveRequest(makeRecord({ requestId: 'pending-2', acknowledged: true }));
    await saveRequest(makeRecord({ requestId: 'pending-3', acknowledged: false }));
    const results = await getAllPending();
    const ids = results.map((r) => r.requestId).sort();
    expect(ids).toEqual(['pending-1', 'pending-3']);
  });

  it('returns empty array when no records', async () => {
    const results = await getAllPending();
    expect(results).toEqual([]);
  });
});

describe('cleanupStale', () => {
  it('removes records older than maxAgeMs', async () => {
    const old = Date.now() - 7200000; // 2 hours ago
    await saveRequest(makeRecord({ requestId: 'stale-1', createdAt: old }));
    await saveRequest(makeRecord({ requestId: 'fresh-1', createdAt: Date.now() }));
    await cleanupStale(3600000); // 1 hour threshold
    expect(await getRequest('stale-1')).toBeUndefined();
    expect(await getRequest('fresh-1')).toBeDefined();
  });
});

describe('proxy recovery fields', () => {
  it('persists proxySessionId and lastProxyEventId', async () => {
    await saveRequest(
      makeRecord({
        requestId: 'proxy-1',
        proxySessionId: 'chat:uuid',
        lastProxyEventId: 150,
      })
    );
    const result = await getRequest('proxy-1');
    expect(result!.proxySessionId).toBe('chat:uuid');
    expect(result!.lastProxyEventId).toBe(150);
  });

  it('updates generationId independently', async () => {
    await saveRequest(makeRecord({ requestId: 'proxy-gen' }));
    await setGenerationId('proxy-gen', 'gen-xyz');
    const result = await getRequest('proxy-gen');
    expect(result!.generationId).toBe('gen-xyz');
  });
});
