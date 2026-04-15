import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  getStateMock: vi.fn(),
  createPersistedChatDataStateMock: vi.fn(),
  collectIndexedDbRecoverySnapshotMock: vi.fn(),
}));

const storeState = {
  folders: [{ id: 'folder-1' }],
  evaluationSettings: { enabled: true },
  evaluationResults: [{ id: 'eval-1' }],
};

vi.mock('@store/storage/CompressedStorage', () => ({
  default: {
    getItem: (...args: unknown[]) => mocks.getItemMock(...args),
  },
}));

vi.mock('@store/store', () => ({
  default: {
    getState: () => mocks.getStateMock(),
  },
}));

vi.mock('@store/persistence', () => ({
  createPersistedChatDataState: (...args: unknown[]) =>
    mocks.createPersistedChatDataStateMock(...args),
}));

vi.mock('@store/storage/IndexedDbStorage', () => ({
  collectIndexedDbRecoverySnapshot: (...args: unknown[]) =>
    mocks.collectIndexedDbRecoverySnapshotMock(...args),
}));

vi.mock('@utils/date', () => ({
  getToday: () => '2026-04-15',
}));

import {
  buildRecoveryExportPayload,
  getRecoveryExportFilename,
  readRecoveryLocalSources,
} from './recoveryExport';

describe('readRecoveryLocalSources', () => {
  beforeEach(() => {
    mocks.getItemMock.mockReset();
    localStorage.clear();
  });

  it('reads both decompressed zustand persist data and legacy chats safely', async () => {
    mocks.getItemMock.mockReturnValue(JSON.stringify({ state: { theme: 'light' }, version: 18 }));
    localStorage.setItem('chats', JSON.stringify([{ id: 'legacy-chat' }]));

    const result = await readRecoveryLocalSources();

    expect(result.zustandPersist.available).toBe(true);
    expect(result.zustandPersist.data).toEqual({
      state: { theme: 'light' },
      version: 18,
    });
    expect(result.legacyLocalStorageChats.available).toBe(true);
    expect(result.legacyLocalStorageChats.data).toEqual([{ id: 'legacy-chat' }]);
  });

  it('captures parse errors instead of throwing', async () => {
    mocks.getItemMock.mockReturnValue('{broken');
    localStorage.setItem('chats', '{oops');

    const result = await readRecoveryLocalSources();

    expect(result.zustandPersist.available).toBe(true);
    expect(result.zustandPersist.error).toBeTruthy();
    expect(result.legacyLocalStorageChats.available).toBe(true);
    expect(result.legacyLocalStorageChats.error).toBeTruthy();
  });
});

describe('buildRecoveryExportPayload', () => {
  beforeEach(() => {
    mocks.getItemMock.mockReset();
    mocks.getStateMock.mockReset();
    mocks.createPersistedChatDataStateMock.mockReset();
    mocks.collectIndexedDbRecoverySnapshotMock.mockReset();
    localStorage.clear();

    mocks.getStateMock.mockReturnValue(storeState);
    mocks.createPersistedChatDataStateMock.mockReturnValue({
      chats: [{ id: 'live-chat' }],
      contentStore: { hash: { content: 'hello', refCount: 1 } },
      branchClipboard: null,
    });
    mocks.getItemMock.mockReturnValue(null);
  });

  it('combines live store, local sources, and IndexedDB snapshot', async () => {
    const indexedDbSnapshot = {
      databaseName: 'weavelet-canvas',
      storeName: 'persisted-state',
      collectedAt: '2026-04-15T00:00:00.000Z',
      keys: ['meta'],
      chats: [],
    };
    mocks.collectIndexedDbRecoverySnapshotMock.mockResolvedValue(indexedDbSnapshot);

    const result = await buildRecoveryExportPayload();

    expect(result.version).toBe(1);
    expect(result.sources.liveStore.available).toBe(true);
    expect(result.sources.liveStore.data).toMatchObject({
      chats: [{ id: 'live-chat' }],
      folders: storeState.folders,
      evaluationSettings: storeState.evaluationSettings,
      evaluationResults: storeState.evaluationResults,
    });
    expect(result.sources.zustandPersist.available).toBe(false);
    expect(result.sources.legacyLocalStorageChats.available).toBe(false);
    expect(result.sources.indexedDb).toEqual({
      available: true,
      data: indexedDbSnapshot,
    });
  });

  it('records IndexedDB export errors without failing the whole payload', async () => {
    mocks.collectIndexedDbRecoverySnapshotMock.mockRejectedValue(new Error('idb failed'));

    const result = await buildRecoveryExportPayload();

    expect(result.sources.indexedDb.available).toBe(true);
    expect(result.sources.indexedDb.error).toBe('idb failed');
  });

  it('uses the current date in the recovery export filename', () => {
    expect(getRecoveryExportFilename()).toBe('2026-04-15-recovery-export');
  });
});
