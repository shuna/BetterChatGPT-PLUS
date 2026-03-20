import type { PersistStorage, StorageValue } from 'zustand/middleware';

export type CloudSyncStatus = 'unauthenticated' | 'syncing' | 'synced';

export type CloudSyncTarget = {
  accessToken: string;
  fileId: string;
};

export type CloudSyncMetrics = {
  jsonBytes: number;
  compressedBytes: number;
  chatCount: number | null;
  contentEntryCount: number | null;
};

export type WriteItemResult = {
  /** When the server's payload was accepted instead of the local one (e.g. conflict
   *  resolved in server's favor), return the effective state so the generic layer
   *  can update its guard-metrics baseline. */
  effectiveState?: unknown;
};

export type CloudSyncProvider<S> = {
  getTarget: () => CloudSyncTarget | null;
  readItem: (name: string, target: CloudSyncTarget) => Promise<StorageValue<S> | null>;
  writeItem: (name: string, file: File, target: CloudSyncTarget) => Promise<WriteItemResult | void>;
  removeItem: (name: string, target: CloudSyncTarget) => Promise<void>;
  isAuthError: (error: unknown) => boolean;
  setSyncStatus: (status: CloudSyncStatus) => void;
  notifyError: (message: string) => void;
};

export type CloudPersistController<S> = {
  storage: PersistStorage<S>;
  flushPendingCloudSync: () => Promise<void>;
  resetPendingCloudSyncForTests: () => void;
};
