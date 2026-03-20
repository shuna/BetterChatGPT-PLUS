import { compress } from 'lz-string';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { buildCloudSyncFile } from './snapshotFile';
import {
  computeCloudSyncMetrics,
  getCloudSyncGuardMessage,
} from './guards';
import type {
  CloudPersistController,
  CloudSyncMetrics,
  CloudSyncProvider,
} from './types';

const CLOUD_SYNC_IDLE_MS = 5000;

type PendingCloudUpload = {
  name: string;
  value: unknown;
};

export interface CloudPersistGuardOptions {
  maxCompressedBytes?: number;
}

export const createCloudPersistStorage = <S>(
  provider: CloudSyncProvider<S>,
  guardOptions?: CloudPersistGuardOptions
): CloudPersistController<S> => {
  let pendingUpload: PendingCloudUpload | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushInFlight: Promise<void> | null = null;
  let listenersRegistered = false;
  let lastSuccessfulUploadMetrics: CloudSyncMetrics | null = null;

  const clearFlushTimer = () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const notifyCloudSyncGuard = (message: string) => {
    provider.notifyError(message);
    provider.setSyncStatus('synced');
  };

  const scheduleFlush = (delayMs: number = CLOUD_SYNC_IDLE_MS) => {
    clearFlushTimer();
    flushTimer = setTimeout(() => {
      void flushPendingCloudSync();
    }, delayMs);
  };

  const registerFlushListeners = () => {
    if (listenersRegistered || typeof window === 'undefined') return;
    listenersRegistered = true;

    const flushOnBackground = () => {
      void flushPendingCloudSync();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushOnBackground();
      }
    });
    window.addEventListener('pagehide', flushOnBackground);
    // Browsers do not guarantee async network completion during unload.
    // We still trigger a best-effort flush here so hidden/pagehide can start
    // the upload earlier, but the last sync is not strictly guaranteed.
    window.addEventListener('beforeunload', flushOnBackground);
  };

  const flushPendingCloudSync = async (): Promise<void> => {
    clearFlushTimer();
    if (flushInFlight) {
      await flushInFlight;
      if (pendingUpload) {
        await flushPendingCloudSync();
      }
      return;
    }

    if (!pendingUpload) return;

    const nextUpload = pendingUpload;
    pendingUpload = null;

    flushInFlight = (async () => {
      const target = provider.getTarget();
      if (!target) {
        return;
      }

      const metrics = computeCloudSyncMetrics(nextUpload.value);
      const guardMessage = getCloudSyncGuardMessage(
        nextUpload.value,
        metrics,
        lastSuccessfulUploadMetrics,
        guardOptions?.maxCompressedBytes
      );
      if (guardMessage) {
        notifyCloudSyncGuard(guardMessage);
        return;
      }

      const compressed = compress(JSON.stringify(nextUpload.value)) ?? '';

      try {
        provider.setSyncStatus('syncing');
        const writeResult = await provider.writeItem(
          nextUpload.name,
          buildCloudSyncFile(compressed),
          target
        );
        // If the provider resolved a conflict in the server's favor, refresh
        // the metrics baseline from the effective (server) state so subsequent
        // guard checks compare against what CloudKit actually persisted.
        if (writeResult?.effectiveState != null) {
          lastSuccessfulUploadMetrics = computeCloudSyncMetrics(writeResult.effectiveState);
        } else {
          lastSuccessfulUploadMetrics = metrics;
        }
        provider.setSyncStatus('synced');
      } catch (e: unknown) {
        provider.notifyError((e as Error).message);
        provider.setSyncStatus(
          provider.isAuthError(e) ? 'unauthenticated' : 'synced'
        );
      } finally {
        flushInFlight = null;
        if (pendingUpload) {
          scheduleFlush();
        }
      }
    })();

    await flushInFlight;
  };

  const resetPendingCloudSyncForTests = () => {
    pendingUpload = null;
    clearFlushTimer();
    flushInFlight = null;
    lastSuccessfulUploadMetrics = null;
  };

  const persistStorage: PersistStorage<S> = {
    getItem: async (name) => {
      provider.setSyncStatus('syncing');
      try {
        const target = provider.getTarget();
        if (!target) {
          provider.setSyncStatus('synced');
          return null;
        }

        const data: StorageValue<S> | null = await provider.readItem(name, target);
        if (!data) {
          provider.setSyncStatus('synced');
          return null;
        }
        lastSuccessfulUploadMetrics = computeCloudSyncMetrics(data);
        provider.setSyncStatus('synced');
        return data;
      } catch (e: unknown) {
        provider.setSyncStatus(provider.isAuthError(e) ? 'unauthenticated' : 'synced');
        provider.notifyError((e as Error).message);
        return null;
      }
    },
    setItem: async (name, newValue): Promise<void> => {
      const target = provider.getTarget();
      if (!target) return;

      pendingUpload = {
        name,
        value: newValue,
      };
      scheduleFlush();
    },
    removeItem: async (name): Promise<void> => {
      const target = provider.getTarget();
      if (!target) return;

      await provider.removeItem(name, target);
    },
  };

  registerFlushListeners();

  return {
    storage: persistStorage,
    flushPendingCloudSync,
    resetPendingCloudSyncForTests,
  };
};
