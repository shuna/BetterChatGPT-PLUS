import { PersistStorage, StorageValue } from 'zustand/middleware';
import { compress } from 'lz-string';
import useCloudAuthStore from '@store/cloud-auth-store';
import useStore from '@store/store';
import {
  deleteDriveFile,
  getDriveFile,
  updateDriveFile,
  validateGoogleOath2AccessToken,
} from '@api/google-api';

const CLOUD_SYNC_IDLE_MS = 5000;

type PendingCloudUpload = {
  value: unknown;
};

let pendingUpload: PendingCloudUpload | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let listenersRegistered = false;

const clearFlushTimer = () => {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
};

const buildCloudSyncFile = (value: unknown) => {
  const compressed = compress(JSON.stringify(value));
  const blob = new Blob([compressed], {
    type: 'application/octet-stream',
  });

  return new File([blob], 'better-chatgpt.json', {
    type: 'application/octet-stream',
  });
};

const getActiveCloudSyncTarget = () => {
  const { googleAccessToken, fileId, syncStatus } = useCloudAuthStore.getState();
  if (!googleAccessToken || !fileId || syncStatus === 'unauthenticated') {
    return null;
  }

  return {
    accessToken: googleAccessToken,
    fileId,
  };
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

export const flushPendingCloudSync = async (): Promise<void> => {
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
    const target = getActiveCloudSyncTarget();
    if (!target) {
      return;
    }

    try {
      useCloudAuthStore.getState().setSyncStatus('syncing');
      await updateDriveFile(
        buildCloudSyncFile(nextUpload.value),
        target.fileId,
        target.accessToken
      );
      useCloudAuthStore.getState().setSyncStatus('synced');
    } catch (e: unknown) {
      useStore.getState().setToastMessage((e as Error).message);
      useStore.getState().setToastShow(true);
      useStore.getState().setToastStatus('error');
      useCloudAuthStore.getState().setSyncStatus('unauthenticated');
    } finally {
      flushInFlight = null;
      if (pendingUpload) {
        scheduleFlush();
      }
    }
  })();

  await flushInFlight;
};

export const resetPendingCloudSyncForTests = () => {
  pendingUpload = null;
  clearFlushTimer();
  flushInFlight = null;
};

const createGoogleCloudStorage = <S>(): PersistStorage<S> | undefined => {
  const accessToken = useCloudAuthStore.getState().googleAccessToken;
  const fileId = useCloudAuthStore.getState().fileId;
  if (!accessToken || !fileId) return;

  registerFlushListeners();

  try {
    const authenticated = validateGoogleOath2AccessToken(accessToken);
    if (!authenticated) return;
  } catch (e) {
    // prevent error if the storage is not defined (e.g. when server side rendering a page)
    return;
  }
  const persistStorage: PersistStorage<S> = {
    getItem: async (name) => {
      useCloudAuthStore.getState().setSyncStatus('syncing');
      try {
        const accessToken = useCloudAuthStore.getState().googleAccessToken;
        const fileId = useCloudAuthStore.getState().fileId;
        if (!accessToken || !fileId) return null;

        const data: StorageValue<S> = await getDriveFile(fileId, accessToken);
        useCloudAuthStore.getState().setSyncStatus('synced');
        return data;
      } catch (e: unknown) {
        useCloudAuthStore.getState().setSyncStatus('unauthenticated');
        useStore.getState().setToastMessage((e as Error).message);
        useStore.getState().setToastShow(true);
        useStore.getState().setToastStatus('error');
        return null;
      }
    },
    setItem: async (name, newValue): Promise<void> => {
      const target = getActiveCloudSyncTarget();
      if (!target) return;

      pendingUpload = {
        value: newValue,
      };
      scheduleFlush();
    },

    removeItem: async (name): Promise<void> => {
      const accessToken = useCloudAuthStore.getState().googleAccessToken;
      const fileId = useCloudAuthStore.getState().fileId;
      if (!accessToken || !fileId) return;

      await deleteDriveFile(accessToken, fileId);
    },
  };
  return persistStorage;
};

export default createGoogleCloudStorage;
