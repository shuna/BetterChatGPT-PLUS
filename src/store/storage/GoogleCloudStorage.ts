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
const MAX_CLOUD_SYNC_JSON_BYTES = 2_000_000;
const MAX_CLOUD_SYNC_COMPRESSED_BYTES = 1_000_000;
const MIN_DESTRUCTIVE_SIZE_RATIO = 0.2;

type PendingCloudUpload = {
  value: unknown;
};

type CloudSyncMetrics = {
  jsonBytes: number;
  compressedBytes: number;
  chatCount: number | null;
  contentEntryCount: number | null;
};

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

const buildCloudSyncFile = (compressed: string) => {
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

const getSnapshotState = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  if ('state' in value && value.state && typeof value.state === 'object') {
    return value.state as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
};

const computeCloudSyncMetrics = (value: unknown): CloudSyncMetrics => {
  const json = JSON.stringify(value);
  const compressed = compress(json) ?? '';
  const state = getSnapshotState(value);
  const chats = state?.chats;
  const contentStore = state?.contentStore;

  return {
    jsonBytes: new Blob([json]).size,
    compressedBytes: new Blob([compressed]).size,
    chatCount: Array.isArray(chats) ? chats.length : null,
    contentEntryCount:
      contentStore && typeof contentStore === 'object'
        ? Object.keys(contentStore).length
        : null,
  };
};

const getCloudSyncGuardMessage = (
  value: unknown,
  metrics: CloudSyncMetrics
): string | null => {
  if (metrics.jsonBytes > MAX_CLOUD_SYNC_JSON_BYTES) {
    return 'Cloud sync skipped because the snapshot is too large to upload safely.';
  }

  if (metrics.compressedBytes > MAX_CLOUD_SYNC_COMPRESSED_BYTES) {
    return 'Cloud sync skipped because the compressed snapshot is too large to upload safely.';
  }

  if (metrics.chatCount === 0) {
    return 'Cloud sync skipped because the snapshot would erase all chats.';
  }

  const state = getSnapshotState(value);
  const stateChats = state?.['chats'];
  const chats = Array.isArray(stateChats) ? stateChats : null;
  if (
    metrics.contentEntryCount === 0 &&
    chats &&
    chats.some(
      (chat) =>
        chat &&
        typeof chat === 'object' &&
        'branchTree' in chat &&
        chat.branchTree &&
        typeof chat.branchTree === 'object'
    )
  ) {
    return 'Cloud sync skipped because branch data is missing from the snapshot.';
  }

  if (
    lastSuccessfulUploadMetrics &&
    metrics.chatCount !== null &&
    lastSuccessfulUploadMetrics.chatCount !== null &&
    lastSuccessfulUploadMetrics.chatCount > 0 &&
    metrics.chatCount < lastSuccessfulUploadMetrics.chatCount &&
    metrics.chatCount === 0
  ) {
    return 'Cloud sync skipped because the snapshot removes every synced chat.';
  }

  if (
    lastSuccessfulUploadMetrics &&
    lastSuccessfulUploadMetrics.compressedBytes > 0 &&
    metrics.compressedBytes <
      lastSuccessfulUploadMetrics.compressedBytes * MIN_DESTRUCTIVE_SIZE_RATIO
  ) {
    return 'Cloud sync skipped because the snapshot shrank too much compared with the last successful sync.';
  }

  return null;
};

const notifyCloudSyncGuard = (message: string) => {
  useStore.getState().setToastMessage(message);
  useStore.getState().setToastShow(true);
  useStore.getState().setToastStatus('error');
  useCloudAuthStore.getState().setSyncStatus('synced');
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

    const metrics = computeCloudSyncMetrics(nextUpload.value);
    const guardMessage = getCloudSyncGuardMessage(nextUpload.value, metrics);
    if (guardMessage) {
      notifyCloudSyncGuard(guardMessage);
      return;
    }

    const compressed = compress(JSON.stringify(nextUpload.value)) ?? '';

    try {
      useCloudAuthStore.getState().setSyncStatus('syncing');
      await updateDriveFile(
        buildCloudSyncFile(compressed),
        target.fileId,
        target.accessToken
      );
      lastSuccessfulUploadMetrics = metrics;
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
  lastSuccessfulUploadMetrics = null;
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
        lastSuccessfulUploadMetrics = computeCloudSyncMetrics(data);
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
