import { decompress } from 'lz-string';
import type { StorageValue } from 'zustand/middleware';

import {
  CLOUDKIT_DEFAULT_RECORD_NAME,
  CloudKitConflictError,
  type CloudKitRecord,
  deleteCloudKitRecord,
  fetchCloudKitRecord,
  getCloudKitConfig,
  isCloudKitAuthError,
  saveCloudKitRecord,
} from '@api/cloudkit';
import { getOrCreateDeviceId } from '@utils/deviceId';
import useCloudAuthStore from '@store/cloud-auth-store';
import useStore from '@store/store';
import {
  hydrateFromPersistedStoreState,
  createPersistedChatDataState,
  migratePersistedState,
  needsDataMigration,
  type PersistedStoreState,
} from '@store/persistence';
import { saveChatData } from '@store/storage/IndexedDbStorage';
import { STORE_VERSION } from '@store/version';
import i18next from 'i18next';
import { showToast } from '@utils/showToast';
import type { CloudSyncProvider, CloudSyncTarget } from '../types';

// --- Base64 helpers ---
// lz-string compress() outputs arbitrary UTF-16 code units (including surrogates
// and code points above U+00FF). TextEncoder (UTF-8) cannot round-trip these.
// We encode via Uint16Array → raw bytes → btoa, preserving every code unit.

export const lzStringToBase64 = (str: string): string => {
  const u16 = new Uint16Array(str.length);
  for (let i = 0; i < str.length; i++) {
    u16[i] = str.charCodeAt(i);
  }
  const bytes = new Uint8Array(u16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToLzString = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const u16 = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  let str = '';
  for (let i = 0; i < u16.length; i++) {
    str += String.fromCharCode(u16[i]);
  }
  return str;
};

// --- Helpers ---

const getCloudSyncTarget = (): CloudSyncTarget | null => {
  const state = useCloudAuthStore.getState();
  const cloudkitState = state.providers.cloudkit;
  if (
    !cloudkitState.sessionToken ||
    cloudkitState.syncStatus === 'unauthenticated'
  ) {
    return null;
  }

  return {
    accessToken: cloudkitState.sessionToken,
    fileId: CLOUDKIT_DEFAULT_RECORD_NAME,
  };
};

const notifyCloudError = (message: string) => {
  showToast(message, 'error');
};

const maybeUpdateToken = (newWebAuthToken?: string) => {
  if (newWebAuthToken) {
    useCloudAuthStore
      .getState()
      .setProviderSession('cloudkit', { sessionToken: newWebAuthToken });
  }
};

const updateRecordChangeTag = (tag?: string) => {
  useCloudAuthStore
    .getState()
    .setProviderSession('cloudkit', { recordChangeTag: tag });
};

const getRecordChangeTag = (): string | undefined =>
  useCloudAuthStore.getState().providers.cloudkit.recordChangeTag;

const normalizeRemoteRecord = (
  record: CloudKitRecord
): { state: Partial<PersistedStoreState>; version: number } => {
  const payload = record.fields?.payload?.value;
  if (!payload) return { state: {}, version: 0 };

  const compressed = base64ToLzString(payload);
  const json = decompress(compressed);
  if (!json) return { state: {}, version: 0 };

  const parsed = JSON.parse(json);
  if (parsed && typeof parsed === 'object' && 'state' in parsed) {
    return {
      state: (parsed.state ?? {}) as Partial<PersistedStoreState>,
      version: parsed.version ?? 0,
    };
  }
  return { state: parsed as Partial<PersistedStoreState>, version: STORE_VERSION };
};

const hydrateFromServerRecord = async (record: CloudKitRecord) => {
  const normalized = normalizeRemoteRecord(record);
  const remotePersistedState = migratePersistedState(
    structuredClone(normalized.state),
    normalized.version
  ) as Partial<PersistedStoreState>;

  const hydratedState = hydrateFromPersistedStoreState(
    useStore.getState(),
    remotePersistedState
  );
  useStore.setState(hydratedState);
  await saveChatData(createPersistedChatDataState(useStore.getState()));

  if (needsDataMigration()) {
    useStore.getState().setMigrationUiState({
      visible: true,
      status: 'needs-export-import',
    });
  }
};

// --- Validate ---

export const validateCloudKitSync = (): boolean => {
  const state = useCloudAuthStore.getState();
  const cloudkitState = state.providers.cloudkit;
  return !!cloudkitState.sessionToken;
};

// --- Provider ---

export const createCloudKitCloudProvider = <S>(): CloudSyncProvider<S> => ({
  getTarget: getCloudSyncTarget,

  readItem: async (_name, target): Promise<StorageValue<S> | null> => {
    const config = getCloudKitConfig();
    if (!config) return null;

    const result = await fetchCloudKitRecord(
      config,
      target.accessToken,
      CLOUDKIT_DEFAULT_RECORD_NAME
    );
    maybeUpdateToken(result.newWebAuthToken);

    if (!result.record) return null;

    updateRecordChangeTag(result.record.recordChangeTag);

    const payload = result.record.fields?.payload?.value;
    if (!payload) return null;

    const compressed = base64ToLzString(payload);
    const json = decompress(compressed);
    if (!json) return null;

    return JSON.parse(json) as StorageValue<S>;
  },

  writeItem: async (_name, file, target) => {
    const config = getCloudKitConfig();
    if (!config) return;

    const compressed = await file.text();
    const payload = lzStringToBase64(compressed);
    const recordChangeTag = getRecordChangeTag();
    // Compute updatedAt once — this exact value is written to the record
    // AND used for conflict comparison, ensuring true last-write-wins.
    const updatedAt = Date.now();

    try {
      const result = await saveCloudKitRecord(
        config,
        target.accessToken,
        CLOUDKIT_DEFAULT_RECORD_NAME,
        payload,
        STORE_VERSION,
        getOrCreateDeviceId(),
        recordChangeTag,
        updatedAt
      );

      updateRecordChangeTag(result.record.recordChangeTag);
      maybeUpdateToken(result.newWebAuthToken);
    } catch (e: unknown) {
      if (e instanceof CloudKitConflictError) {
        // Fetch latest server record
        const fetchResult = await fetchCloudKitRecord(
          config,
          target.accessToken,
          CLOUDKIT_DEFAULT_RECORD_NAME
        );
        maybeUpdateToken(fetchResult.newWebAuthToken);

        if (!fetchResult.record) {
          // Record was deleted, retry as create
          const retryResult = await saveCloudKitRecord(
            config,
            target.accessToken,
            CLOUDKIT_DEFAULT_RECORD_NAME,
            payload,
            STORE_VERSION,
            getOrCreateDeviceId(),
            undefined,
            updatedAt
          );
          updateRecordChangeTag(retryResult.record.recordChangeTag);
          maybeUpdateToken(retryResult.newWebAuthToken);
          return;
        }

        const serverUpdatedAt =
          fetchResult.record.fields?.updatedAt?.value ?? 0;

        if (updatedAt >= serverUpdatedAt) {
          // Local wins — retry with server's recordChangeTag
          const retryResult = await saveCloudKitRecord(
            config,
            target.accessToken,
            CLOUDKIT_DEFAULT_RECORD_NAME,
            payload,
            STORE_VERSION,
            getOrCreateDeviceId(),
            fetchResult.record.recordChangeTag,
            updatedAt
          );
          updateRecordChangeTag(retryResult.record.recordChangeTag);
          maybeUpdateToken(retryResult.newWebAuthToken);
        } else {
          // Server wins — hydrate from server and signal the effective state
          // so the generic layer updates its guard-metrics baseline.
          updateRecordChangeTag(fetchResult.record.recordChangeTag);
          const normalized = normalizeRemoteRecord(fetchResult.record);
          await hydrateFromServerRecord(fetchResult.record);

          showToast(i18next.t('toast.conflict', { ns: 'cloudkit' }), 'warning');

          return {
            effectiveState: { state: normalized.state, version: normalized.version },
          };
        }
      }
      throw e;
    }
  },

  removeItem: async (_name, target): Promise<void> => {
    const config = getCloudKitConfig();
    if (!config) return;

    const result = await deleteCloudKitRecord(
      config,
      target.accessToken,
      CLOUDKIT_DEFAULT_RECORD_NAME
    );
    maybeUpdateToken(result.newWebAuthToken);
  },

  isAuthError: isCloudKitAuthError,

  setSyncStatus: (status) => {
    useCloudAuthStore.getState().setSyncStatus(status);
  },

  notifyError: notifyCloudError,
});
