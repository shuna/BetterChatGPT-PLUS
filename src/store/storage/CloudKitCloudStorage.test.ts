import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cloudState,
  toastState,
  fetchCloudKitRecordMock,
  saveCloudKitRecordMock,
} = vi.hoisted(() => {
  const cloudkitProvider = {
    sessionToken: 'ck-token',
    refreshToken: undefined,
    targetId: undefined,
    targetLabel: undefined,
    syncStatus: 'synced' as 'unauthenticated' | 'syncing' | 'synced',
    syncTargetConfirmed: true,
    recordChangeTag: undefined as string | undefined,
  };

  const state = {
    providers: {
      google: {
        sessionToken: undefined,
        refreshToken: undefined,
        targetId: undefined,
        targetLabel: undefined,
        syncStatus: 'unauthenticated' as const,
        syncTargetConfirmed: false,
      },
      cloudkit: cloudkitProvider,
    },
    setSyncStatus: vi.fn((status: 'unauthenticated' | 'syncing' | 'synced') => {
      cloudkitProvider.syncStatus = status;
    }),
    setProviderSession: vi.fn(
      (provider: string, session: Record<string, unknown>) => {
        if (provider === 'cloudkit') {
          Object.assign(cloudkitProvider, session);
        }
      }
    ),
  };

  return {
    cloudState: state,
    toastState: {
      setToastMessage: vi.fn(),
      setToastShow: vi.fn(),
      setToastStatus: vi.fn(),
    },
    fetchCloudKitRecordMock: vi.fn(),
    saveCloudKitRecordMock: vi.fn(async () => ({
      record: { recordChangeTag: 'tag-new' },
    })),
  };
});

vi.mock('@store/cloud-auth-store', () => ({
  default: {
    getState: () => cloudState,
  },
}));

vi.mock('@store/store', () => ({
  default: {
    getState: () => toastState,
    setState: vi.fn(),
    persist: {
      setOptions: vi.fn(),
      rehydrate: vi.fn(),
    },
  },
}));

vi.mock('@api/cloudkit', () => ({
  CLOUDKIT_DEFAULT_RECORD_NAME: 'weavelet-default-snapshot',
  CloudKitConflictError: class CloudKitConflictError extends Error {
    serverRecord: unknown;
    constructor(message: string, serverRecord: unknown) {
      super(message);
      this.name = 'CloudKitConflictError';
      this.serverRecord = serverRecord;
    }
  },
  fetchCloudKitRecord: fetchCloudKitRecordMock,
  saveCloudKitRecord: saveCloudKitRecordMock,
  deleteCloudKitRecord: vi.fn(async () => ({})),
  getCloudKitConfig: () => ({
    containerId: 'iCloud.test',
    environment: 'development',
    apiToken: 'api-token',
  }),
  isCloudKitAuthError: (error: unknown) =>
    error instanceof Error &&
    /AUTHENTICATION_REQUIRED|NOT_AUTHENTICATED|AUTHENTICATION_FAILED/.test(
      error.message
    ),
}));

vi.mock('@utils/deviceId', () => ({
  getOrCreateDeviceId: () => 'device-uuid',
}));

vi.mock('@store/persistence', () => ({
  hydrateFromPersistedStoreState: vi.fn((_base: unknown, persisted: unknown) => persisted),
  createPersistedChatDataState: vi.fn(() => ({})),
  migratePersistedState: vi.fn((state: unknown) => state),
}));

vi.mock('@store/storage/IndexedDbStorage', () => ({
  saveChatData: vi.fn(),
}));

vi.mock('@store/version', () => ({
  STORE_VERSION: 17,
}));

import createCloudKitCloudStorage, {
  flushPendingCloudKitSync,
  resetPendingCloudKitSyncForTests,
} from './CloudKitCloudStorage';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('CloudKitCloudStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPendingCloudKitSyncForTests();
    cloudState.providers.cloudkit.sessionToken = 'ck-token';
    cloudState.providers.cloudkit.syncStatus = 'synced';
    cloudState.providers.cloudkit.recordChangeTag = undefined;
    cloudState.setSyncStatus.mockClear();
    cloudState.setProviderSession.mockClear();
    toastState.setToastMessage.mockClear();
    toastState.setToastShow.mockClear();
    toastState.setToastStatus.mockClear();
    fetchCloudKitRecordMock.mockClear();
    saveCloudKitRecordMock.mockClear();
    saveCloudKitRecordMock.mockResolvedValue({
      record: { recordChangeTag: 'tag-new' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPendingCloudKitSyncForTests();
  });

  it('coalesces repeated writes and uploads once after idle', async () => {
    const storage = createCloudKitCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 1 }, version: 1 });
    await storage!.setItem('test', { state: { count: 2 }, version: 1 });

    await vi.advanceTimersByTimeAsync(4999);
    expect(saveCloudKitRecordMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();

    expect(saveCloudKitRecordMock).toHaveBeenCalledTimes(1);
    expect(cloudState.setSyncStatus).toHaveBeenCalledWith('syncing');
    expect(cloudState.setSyncStatus).toHaveBeenLastCalledWith('synced');
  });

  it('flushes immediately when requested', async () => {
    const storage = createCloudKitCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 3 }, version: 1 });
    await flushPendingCloudKitSync();

    expect(saveCloudKitRecordMock).toHaveBeenCalledTimes(1);
  });

  it('blocks oversized uploads with 700KB limit', async () => {
    const storage = createCloudKitCloudStorage<any>();
    expect(storage).toBeDefined();

    // Create data that is too large to upload safely (>2MB JSON trips the first guard)
    const largeText = 'x'.repeat(2_100_000);

    await storage!.setItem('test', {
      state: {
        chats: [{ id: 'chat-1', messages: [{ role: 'user', content: largeText }] }],
        contentStore: {},
      },
      version: 1,
    });
    await flushPendingCloudKitSync();

    expect(saveCloudKitRecordMock).not.toHaveBeenCalled();
    expect(toastState.setToastMessage).toHaveBeenCalledWith(
      expect.stringContaining('too large to upload safely')
    );
  });

  it('keeps the session on non-auth upload failures', async () => {
    saveCloudKitRecordMock.mockRejectedValueOnce(
      new Error('CloudKit request failed: 500')
    );

    const storage = createCloudKitCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 3 }, version: 1 });
    await flushPendingCloudKitSync();

    expect(cloudState.setSyncStatus).toHaveBeenLastCalledWith('synced');
  });

  it('marks session unauthenticated on auth failures', async () => {
    saveCloudKitRecordMock.mockRejectedValueOnce(
      new Error('AUTHENTICATION_REQUIRED')
    );

    const storage = createCloudKitCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 3 }, version: 1 });
    await flushPendingCloudKitSync();

    expect(cloudState.setSyncStatus).toHaveBeenLastCalledWith('unauthenticated');
  });
});
