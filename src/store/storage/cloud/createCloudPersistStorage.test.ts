import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudPersistStorage } from './createCloudPersistStorage';
import type { CloudSyncProvider } from './types';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('createCloudPersistStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const buildProvider = () => {
    const state = {
      target: { accessToken: 'token-1', fileId: 'file-1' },
      syncStatus: 'synced' as 'unauthenticated' | 'syncing' | 'synced',
      setSyncStatus: vi.fn((status: 'unauthenticated' | 'syncing' | 'synced') => {
        state.syncStatus = status;
      }),
      notifyError: vi.fn(),
      readItem: vi.fn(async () => ({ state: { chats: [], contentStore: {} }, version: 1 })),
      writeItem: vi.fn(async () => undefined) as any,
      removeItem: vi.fn(async () => undefined),
    };

    const provider: CloudSyncProvider<any> = {
      getTarget: () => state.target,
      readItem: state.readItem,
      writeItem: state.writeItem,
      removeItem: state.removeItem,
      isAuthError: (error: unknown) =>
        /(?:^|\s)(401|403)(?:\s|$)|unauthorized|forbidden/i.test(
          error instanceof Error ? error.message : String(error)
        ),
      setSyncStatus: state.setSyncStatus,
      notifyError: state.notifyError,
    };

    return { provider, state };
  };

  it('coalesces writes and uploads only the latest snapshot', async () => {
    const { provider, state } = buildProvider();
    const controller = createCloudPersistStorage(provider);

    await controller.storage.setItem('test', {
      state: { count: 1, chats: [{ id: 'chat-1' }], contentStore: {} },
      version: 1,
    });
    await controller.storage.setItem('test', {
      state: { count: 2, chats: [{ id: 'chat-1' }], contentStore: {} },
      version: 1,
    });

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(state.writeItem).toHaveBeenCalledTimes(1);
    expect(state.setSyncStatus).toHaveBeenCalledWith('syncing');
    expect(state.setSyncStatus).toHaveBeenLastCalledWith('synced');
  });

  it('maps auth failures to unauthenticated status', async () => {
    const { provider, state } = buildProvider();
    state.writeItem.mockRejectedValueOnce(new Error('Error uploading file: 401 Unauthorized'));
    const controller = createCloudPersistStorage(provider);

    await controller.storage.setItem('test', {
      state: { count: 1, chats: [{ id: 'chat-1' }], contentStore: {} },
      version: 1,
    });
    await controller.flushPendingCloudSync();

    expect(state.setSyncStatus).toHaveBeenLastCalledWith('unauthenticated');
    expect(state.notifyError).toHaveBeenCalledWith('Error uploading file: 401 Unauthorized');
  });

  it('updates guard baseline from effectiveState when writeItem signals server-wins', async () => {
    const { provider, state } = buildProvider();

    // The first write succeeds normally — establishes a baseline with 2 chats
    state.writeItem.mockResolvedValueOnce(undefined);
    const controller = createCloudPersistStorage(provider);

    await controller.storage.setItem('test', {
      state: { chats: [{ id: 'c1' }, { id: 'c2' }], contentStore: { a: 1, b: 2 } },
      version: 1,
    });
    await controller.flushPendingCloudSync();

    // The second write returns effectiveState (server-wins conflict) — the
    // server snapshot has only 1 chat. This should become the new baseline.
    const serverState = { chats: [{ id: 'server-c1' }], contentStore: { x: 1 } };
    state.writeItem.mockResolvedValueOnce({
      effectiveState: { state: serverState, version: 1 },
    });

    await controller.storage.setItem('test', {
      state: { chats: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], contentStore: { a: 1, b: 2, c: 3 } },
      version: 1,
    });
    await controller.flushPendingCloudSync();

    // Now write a snapshot with 1 chat — this would be flagged as "shrank too
    // much" if baseline were still the original 2-chat upload, but should pass
    // because baseline was refreshed to the server's 1-chat state.
    state.writeItem.mockResolvedValueOnce(undefined);
    await controller.storage.setItem('test', {
      state: { chats: [{ id: 'single' }], contentStore: { only: 1 } },
      version: 1,
    });
    await controller.flushPendingCloudSync();

    // 3 successful writes, no guard rejections
    expect(state.writeItem).toHaveBeenCalledTimes(3);
    expect(state.notifyError).not.toHaveBeenCalled();
  });

  it('exposes a reset helper for tests', async () => {
    const { provider, state } = buildProvider();
    const controller = createCloudPersistStorage(provider);

    await controller.storage.setItem('test', {
      state: { count: 1, chats: [{ id: 'chat-1' }], contentStore: {} },
      version: 1,
    });
    controller.resetPendingCloudSyncForTests();
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(state.writeItem).not.toHaveBeenCalled();
  });
});
