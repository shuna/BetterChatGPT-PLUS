import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cloudState,
  toastState,
  fetchCloudKitRecordMock,
  saveCloudKitRecordMock,
  deleteCloudKitRecordMock,
  getCloudKitConfigMock,
  isCloudKitAuthErrorMock,
  MockCloudKitConflictError,
} = vi.hoisted(() => {
  const cloudkitProvider = {
    sessionToken: 'ck-token' as string | undefined,
    refreshToken: undefined as string | undefined,
    targetId: undefined as string | undefined,
    targetLabel: undefined as string | undefined,
    syncStatus: 'synced' as 'unauthenticated' | 'syncing' | 'synced',
    syncTargetConfirmed: true,
    recordChangeTag: 'tag-1' as string | undefined,
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
    setSyncStatus: vi.fn(),
    setProviderSession: vi.fn(
      (
        provider: string,
        session: Record<string, unknown>
      ) => {
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
    saveCloudKitRecordMock: vi.fn(),
    deleteCloudKitRecordMock: vi.fn(),
    getCloudKitConfigMock: vi.fn(() => ({
      containerId: 'iCloud.test',
      environment: 'development' as const,
      apiToken: 'api-token',
    })),
    isCloudKitAuthErrorMock: vi.fn(
      (error: unknown) =>
        error instanceof Error &&
        /AUTHENTICATION_REQUIRED|NOT_AUTHENTICATED|AUTHENTICATION_FAILED/.test(
          error.message
        )
    ),
    MockCloudKitConflictError: class CloudKitConflictError extends Error {
      serverRecord: unknown;
      constructor(message: string, serverRecord: unknown) {
        super(message);
        this.name = 'CloudKitConflictError';
        this.serverRecord = serverRecord;
      }
    },
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
  CloudKitConflictError: MockCloudKitConflictError,
  fetchCloudKitRecord: fetchCloudKitRecordMock,
  saveCloudKitRecord: saveCloudKitRecordMock,
  deleteCloudKitRecord: deleteCloudKitRecordMock,
  getCloudKitConfig: getCloudKitConfigMock,
  isCloudKitAuthError: isCloudKitAuthErrorMock,
}));

vi.mock('@utils/deviceId', () => ({
  getOrCreateDeviceId: () => 'device-uuid',
}));

vi.mock('@store/persistence', () => ({
  hydrateFromPersistedStoreState: vi.fn((_base: unknown, persisted: unknown) => persisted),
  createPersistedChatDataState: vi.fn(() => ({})),
  migratePersistedState: vi.fn((state: unknown) => state),
  needsDataMigration: vi.fn(() => false),
}));

vi.mock('@store/storage/IndexedDbStorage', () => ({
  saveChatData: vi.fn(),
}));

vi.mock('@store/version', () => ({
  STORE_VERSION: 17,
}));

vi.mock('i18next', () => ({
  default: { t: vi.fn((key: string) => key) },
}));

import {
  createCloudKitCloudProvider,
  validateCloudKitSync,
  lzStringToBase64,
  base64ToLzString,
} from './cloudkit';
import { CloudKitConflictError } from '@api/cloudkit';
import { compress } from 'lz-string';

describe('CloudKit provider', () => {
  beforeEach(() => {
    cloudState.providers.cloudkit.sessionToken = 'ck-token';
    cloudState.providers.cloudkit.syncStatus = 'synced';
    cloudState.providers.cloudkit.recordChangeTag = 'tag-1';
    cloudState.setSyncStatus.mockClear();
    cloudState.setProviderSession.mockClear();
    toastState.setToastMessage.mockClear();
    toastState.setToastShow.mockClear();
    toastState.setToastStatus.mockClear();
    fetchCloudKitRecordMock.mockReset();
    saveCloudKitRecordMock.mockReset();
    deleteCloudKitRecordMock.mockReset();
    getCloudKitConfigMock.mockReturnValue({
      containerId: 'iCloud.test',
      environment: 'development' as const,
      apiToken: 'api-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateCloudKitSync', () => {
    it('returns true when session token exists', () => {
      expect(validateCloudKitSync()).toBe(true);
    });

    it('returns false when session token is missing', () => {
      cloudState.providers.cloudkit.sessionToken = undefined;
      expect(validateCloudKitSync()).toBe(false);
    });
  });

  describe('getTarget', () => {
    it('returns target when authenticated', () => {
      const provider = createCloudKitCloudProvider();
      const target = provider.getTarget();
      expect(target).toEqual({
        accessToken: 'ck-token',
        fileId: 'weavelet-default-snapshot',
      });
    });

    it('returns null when unauthenticated', () => {
      cloudState.providers.cloudkit.syncStatus = 'unauthenticated';
      const provider = createCloudKitCloudProvider();
      expect(provider.getTarget()).toBeNull();
    });

    it('returns null when session token is missing', () => {
      cloudState.providers.cloudkit.sessionToken = undefined;
      const provider = createCloudKitCloudProvider();
      expect(provider.getTarget()).toBeNull();
    });
  });

  describe('readItem', () => {
    it('returns null when record does not exist', async () => {
      fetchCloudKitRecordMock.mockResolvedValueOnce({
        record: null,
      });

      const provider = createCloudKitCloudProvider();
      const result = await provider.readItem('test', {
        accessToken: 'ck-token',
        fileId: 'rec',
      });
      expect(result).toBeNull();
    });

    it('decodes Base64 payload and returns StorageValue', async () => {
      const data = { state: { chats: [], contentStore: {} }, version: 1 };
      const compressed = compress(JSON.stringify(data))!;
      const payload = lzStringToBase64(compressed);

      fetchCloudKitRecordMock.mockResolvedValueOnce({
        record: {
          recordName: 'rec',
          recordChangeTag: 'tag-2',
          fields: { payload: { value: payload } },
        },
      });

      const provider = createCloudKitCloudProvider();
      const result = await provider.readItem('test', {
        accessToken: 'ck-token',
        fileId: 'rec',
      });
      expect(result).toEqual(data);
    });

    it('updates recordChangeTag on read', async () => {
      const data = { state: {}, version: 1 };
      const compressed = compress(JSON.stringify(data))!;
      const payload = lzStringToBase64(compressed);

      fetchCloudKitRecordMock.mockResolvedValueOnce({
        record: {
          recordName: 'rec',
          recordChangeTag: 'new-tag',
          fields: { payload: { value: payload } },
        },
      });

      const provider = createCloudKitCloudProvider();
      await provider.readItem('test', {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(cloudState.setProviderSession).toHaveBeenCalledWith(
        'cloudkit',
        { recordChangeTag: 'new-tag' }
      );
    });

    it('updates token when newWebAuthToken is returned', async () => {
      fetchCloudKitRecordMock.mockResolvedValueOnce({
        record: null,
        newWebAuthToken: 'rotated-token',
      });

      const provider = createCloudKitCloudProvider();
      await provider.readItem('test', {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(cloudState.setProviderSession).toHaveBeenCalledWith(
        'cloudkit',
        { sessionToken: 'rotated-token' }
      );
    });
  });

  describe('writeItem', () => {
    it('encodes to Base64 and saves', async () => {
      saveCloudKitRecordMock.mockResolvedValueOnce({
        record: { recordChangeTag: 'tag-2' },
      });

      const provider = createCloudKitCloudProvider();
      const file = new File(['compressed-data'], 'test.json');
      await provider.writeItem('test', file, {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(saveCloudKitRecordMock).toHaveBeenCalledTimes(1);
      const call = saveCloudKitRecordMock.mock.calls[0];
      // payload should be Base64 encoded
      expect(typeof call[3]).toBe('string');
      // recordChangeTag should be passed
      expect(call[6]).toBe('tag-1');
    });

    it('updates recordChangeTag after successful save', async () => {
      saveCloudKitRecordMock.mockResolvedValueOnce({
        record: { recordChangeTag: 'tag-new' },
      });

      const provider = createCloudKitCloudProvider();
      const file = new File(['data'], 'test.json');
      await provider.writeItem('test', file, {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(cloudState.setProviderSession).toHaveBeenCalledWith(
        'cloudkit',
        { recordChangeTag: 'tag-new' }
      );
    });

    it('updates token when newWebAuthToken is returned on save', async () => {
      saveCloudKitRecordMock.mockResolvedValueOnce({
        record: { recordChangeTag: 'tag-2' },
        newWebAuthToken: 'new-token',
      });

      const provider = createCloudKitCloudProvider();
      const file = new File(['data'], 'test.json');
      await provider.writeItem('test', file, {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(cloudState.setProviderSession).toHaveBeenCalledWith(
        'cloudkit',
        { sessionToken: 'new-token' }
      );
    });
  });

  describe('writeItem conflict resolution', () => {
    it('returns effectiveState when server wins the conflict', async () => {
      saveCloudKitRecordMock.mockRejectedValueOnce(
        new CloudKitConflictError('SERVER_RECORD_CHANGED', null)
      );

      const serverData = { state: { chats: [{ id: 'server-chat' }], contentStore: {} }, version: 17 };
      const serverCompressed = compress(JSON.stringify(serverData))!;
      const serverPayload = lzStringToBase64(serverCompressed);

      fetchCloudKitRecordMock.mockResolvedValueOnce({
        record: {
          recordName: 'weavelet-default-snapshot',
          recordChangeTag: 'server-tag',
          fields: {
            payload: { value: serverPayload },
            updatedAt: { value: Date.now() + 60_000 },
          },
        },
      });

      const provider = createCloudKitCloudProvider();
      const file = new File(['local-data'], 'test.json');
      const result = await provider.writeItem('test', file, {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(result).toBeDefined();
      expect(result?.effectiveState).toBeDefined();
      expect((result!.effectiveState as any).state.chats).toEqual([{ id: 'server-chat' }]);
      expect(toastState.setToastStatus).toHaveBeenCalledWith('warning');
    });
  });

  describe('removeItem', () => {
    it('calls deleteCloudKitRecord', async () => {
      deleteCloudKitRecordMock.mockResolvedValueOnce({});

      const provider = createCloudKitCloudProvider();
      await provider.removeItem('test', {
        accessToken: 'ck-token',
        fileId: 'rec',
      });

      expect(deleteCloudKitRecordMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAuthError', () => {
    it('delegates to isCloudKitAuthError', () => {
      const provider = createCloudKitCloudProvider();
      expect(
        provider.isAuthError(new Error('AUTHENTICATION_REQUIRED'))
      ).toBe(true);
      expect(provider.isAuthError(new Error('random'))).toBe(false);
    });
  });

  describe('notifyError', () => {
    it('shows toast with error message', () => {
      const provider = createCloudKitCloudProvider();
      provider.notifyError('Something went wrong');
      expect(toastState.setToastMessage).toHaveBeenCalledWith(
        'Something went wrong'
      );
      expect(toastState.setToastShow).toHaveBeenCalledWith(true);
      expect(toastState.setToastStatus).toHaveBeenCalledWith('error');
    });
  });

  describe('Base64 helpers', () => {
    it('round-trips ASCII strings', () => {
      const original = 'Hello, World!';
      expect(base64ToLzString(lzStringToBase64(original))).toBe(original);
    });

    it('round-trips UTF-8 strings with non-ASCII characters', () => {
      const original = 'こんにちは世界 🌍';
      expect(base64ToLzString(lzStringToBase64(original))).toBe(original);
    });

    it('round-trips lz-string compressed data', () => {
      const data = JSON.stringify({ chats: [{ id: 'chat-1' }] });
      const compressed = compress(data)!;
      const roundTripped = base64ToLzString(lzStringToBase64(compressed));
      expect(roundTripped).toBe(compressed);
    });
  });
});
