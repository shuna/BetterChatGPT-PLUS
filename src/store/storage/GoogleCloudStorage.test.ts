import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cloudState,
  toastState,
  getDriveFileMock,
  updateDriveFileMock,
  validateTokenMock,
} = vi.hoisted(() => ({
  cloudState: (() => {
    const state = {
      googleAccessToken: 'token-1',
      fileId: 'file-1',
      syncStatus: 'synced' as 'unauthenticated' | 'syncing' | 'synced',
      setSyncStatus: vi.fn(),
    };
    state.setSyncStatus = vi.fn((status: 'unauthenticated' | 'syncing' | 'synced') => {
      state.syncStatus = status;
    });
    return state;
  })(),
  toastState: {
    setToastMessage: vi.fn(),
      setToastDuration: vi.fn(),
    setToastShow: vi.fn(),
    setToastStatus: vi.fn(),
  },
  getDriveFileMock: vi.fn(),
  updateDriveFileMock: vi.fn(async () => ({ id: 'file-1' })),
  validateTokenMock: vi.fn(() => true),
}));

vi.mock('@store/cloud-auth-store', () => ({
  default: {
    getState: () => cloudState,
  },
}));

vi.mock('@store/store', () => ({
  default: {
    getState: () => toastState,
  },
}));

vi.mock('@api/google-api', () => ({
  deleteDriveFile: vi.fn(),
  getDriveFile: getDriveFileMock,
  isGoogleAuthError: (error: unknown) => /(?:^|\s)(401|403)(?:\s|$)|unauthorized|forbidden/i.test(
    error instanceof Error ? error.message : String(error)
  ),
  updateDriveFile: updateDriveFileMock,
  validateGoogleOath2AccessToken: validateTokenMock,
}));

import createGoogleCloudStorage, {
  flushPendingCloudSync,
  resetPendingCloudSyncForTests,
} from './GoogleCloudStorage';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('GoogleCloudStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPendingCloudSyncForTests();
    cloudState.googleAccessToken = 'token-1';
    cloudState.fileId = 'file-1';
    cloudState.syncStatus = 'synced';
    cloudState.setSyncStatus.mockClear();
    toastState.setToastMessage.mockClear();
    toastState.setToastShow.mockClear();
    toastState.setToastStatus.mockClear();
    getDriveFileMock.mockClear();
    updateDriveFileMock.mockClear();
    validateTokenMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPendingCloudSyncForTests();
  });

  it('flushes the latest pending change after an in-flight upload finishes', async () => {
    let resolveUpload: (() => void) | undefined;
    updateDriveFileMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = () => resolve({ id: 'file-1' });
        })
    );

    const storage = createGoogleCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 1 }, version: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);

    await storage!.setItem('test', { state: { count: 2 }, version: 1 });
    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);

    resolveUpload?.();
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(updateDriveFileMock).toHaveBeenCalledTimes(2);
  });

  it('flushes pending changes even when called while another flush is in flight', async () => {
    let resolveUpload: (() => void) | undefined;
    updateDriveFileMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = () => resolve({ id: 'file-1' });
        })
    );

    const storage = createGoogleCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 1 }, version: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);

    const waitingFlush = flushPendingCloudSync();
    await storage!.setItem('test', { state: { count: 2 }, version: 1 });

    resolveUpload?.();
    await waitingFlush;
    await flushMicrotasks();

    expect(updateDriveFileMock).toHaveBeenCalledTimes(2);
  });

  it('uses the latest auth state at flush time', async () => {
    const storage = createGoogleCloudStorage<{ count: number }>();
    expect(storage).toBeDefined();

    await storage!.setItem('test', { state: { count: 3 }, version: 1 });
    cloudState.googleAccessToken = 'token-2';
    cloudState.fileId = 'file-2';

    await flushPendingCloudSync();

    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);
    const firstCall = updateDriveFileMock.mock.calls.at(0) as unknown[] | undefined;
    expect(firstCall?.[1]).toBe('file-2');
    expect(firstCall?.[2]).toBe('token-2');
  });

  it('blocks destructive uploads that would erase all chats', async () => {
    const storage = createGoogleCloudStorage<any>();
    expect(storage).toBeDefined();

    getDriveFileMock.mockResolvedValueOnce({
      state: {
        chats: [{ id: 'chat-1' }],
        contentStore: { hash: { content: [{ type: 'text', text: 'x' }], refCount: 1 } },
      },
      version: 1,
    });

    await storage!.getItem('test');
    await storage!.setItem('test', {
      state: { chats: [], contentStore: {} },
      version: 1,
    });
    await flushPendingCloudSync();

    expect(updateDriveFileMock).not.toHaveBeenCalled();
    expect(toastState.setToastMessage).toHaveBeenCalledWith(
      'Cloud sync skipped because the snapshot would erase all chats.'
    );
    expect(cloudState.setSyncStatus).toHaveBeenLastCalledWith('synced');
  });

});
