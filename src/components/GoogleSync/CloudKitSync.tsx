import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createJSONStorage } from 'zustand/middleware';

import useStore from '@store/store';
import useCloudAuthStore from '@store/cloud-auth-store';
import {
  fetchCloudKitCurrentUser,
  getCloudKitAuthUrl,
  getCloudKitConfig,
} from '@api/cloudkit';
import createCloudKitCloudStorage, {
  flushPendingCloudKitSync,
} from '@store/storage/CloudKitCloudStorage';
import {
  createLocalStoragePartializedState,
  createPartializedState,
  createPersistedChatDataState,
  hydrateFromPersistedStoreState,
  migratePersistedState,
  needsDataMigration,
  type PersistedStoreState,
} from '@store/persistence';
import { saveChatData } from '@store/storage/IndexedDbStorage';
import { STORE_VERSION } from '@store/version';
import compressedStorage from '@store/storage/CompressedStorage';

import TickIcon from '@icon/TickIcon';
import RefreshIcon from '@icon/RefreshIcon';

import type { SyncStatus } from '@type/google-api';

const AUTH_POPUP_TIMEOUT_MS = 60_000;
const POPUP_CLOSED_POLL_MS = 500;

const SyncIcon = ({ status }: { status: SyncStatus }) => {
  if (status === 'unauthenticated') {
    return (
      <div className='bg-red-600/80 rounded-full w-4 h-4 text-xs flex justify-center items-center'>
        !
      </div>
    );
  }
  if (status === 'syncing') {
    return (
      <div className='rounded-full bg-gray-600/80 p-1 animate-spin'>
        <RefreshIcon className='h-2 w-2' />
      </div>
    );
  }
  return (
    <div className='bg-gray-600/80 rounded-full p-1'>
      <TickIcon className='h-2 w-2' />
    </div>
  );
};

const normalizeRemoteStorageValue = (
  snapshot: unknown
): { state: Partial<PersistedStoreState>; version: number } => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { state: {}, version: 0 };
  }
  if ('state' in snapshot) {
    const wrapped = snapshot as {
      state?: Partial<PersistedStoreState>;
      version?: number;
    };
    return {
      state: (wrapped.state ?? {}) as Partial<PersistedStoreState>,
      version: wrapped.version ?? 0,
    };
  }
  return { state: snapshot as Partial<PersistedStoreState>, version: STORE_VERSION };
};

const CloudKitSync = () => {
  const { t } = useTranslation(['cloudkit']);

  const provider = useCloudAuthStore((s) => s.provider);
  const cloudSync = useCloudAuthStore((s) => s.cloudSync);
  const syncStatus = useCloudAuthStore((s) => s.syncStatus);
  const syncTargetConfirmed = useCloudAuthStore((s) => s.syncTargetConfirmed);
  const setSyncStatus = useCloudAuthStore((s) => s.setSyncStatus);
  const setCloudSync = useCloudAuthStore((s) => s.setCloudSync);
  const setSyncTargetConfirmed = useCloudAuthStore((s) => s.setSyncTargetConfirmed);
  const setProviderSession = useCloudAuthStore((s) => s.setProviderSession);
  const resetCloudSyncProvider = useCloudAuthStore((s) => s.resetCloudSyncProvider);
  const disconnectCloudSync = useCloudAuthStore((s) => s.disconnectCloudSync);

  const setToastStatus = useStore((s) => s.setToastStatus);
  const setToastMessage = useStore((s) => s.setToastMessage);
  const setToastShow = useStore((s) => s.setToastShow);

  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const config = getCloudKitConfig();

  const showToast = useCallback(
    (message: string, status: 'success' | 'error' | 'warning' = 'error') => {
      setToastMessage(message);
      setToastShow(true);
      setToastStatus(status);
    },
    [setToastMessage, setToastShow, setToastStatus]
  );

  // Auto-reconnect when returning to mounted component with confirmed target
  useEffect(() => {
    if (
      provider === 'cloudkit' &&
      syncTargetConfirmed &&
      cloudSync
    ) {
      const cloudkitState = useCloudAuthStore.getState().providers.cloudkit;
      if (cloudkitState.sessionToken) {
        enableCloudKitPersistence();
      } else {
        setSyncStatus('unauthenticated');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enableCloudKitPersistence = () => {
    useStore.persist.setOptions({
      storage: createCloudKitCloudStorage(),
      partialize: (state) => createPartializedState(state),
    });
  };

  const enableLocalPersistence = () => {
    useStore.persist.setOptions({
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => createLocalStoragePartializedState(state),
    });
    useStore.persist.rehydrate();
  };

  const handleConnect = async () => {
    if (!config) {
      showToast(t('error.config'));
      return;
    }

    setBusy(true);

    const redirectURL = `${location.origin}${import.meta.env.BASE_URL}cloudkit-auth-callback.html`;
    const authUrl = getCloudKitAuthUrl(config, redirectURL);

    const popup = window.open(authUrl, 'cloudkit-auth', 'width=600,height=700');
    if (!popup) {
      showToast(t('error.popupBlocked'));
      setBusy(false);
      return;
    }
    popupRef.current = popup;

    let settled = false;

    const cleanup = () => {
      settled = true;
      window.removeEventListener('message', messageHandler);
      clearInterval(closedPollTimer);
      clearTimeout(timeoutTimer);
      popupRef.current = null;
    };

    const messageHandler = async (event: MessageEvent) => {
      if (settled) return;
      if (event.origin !== location.origin) return;
      if (event.source !== popup) return;

      if (event.data?.type === 'cloudkit-auth') {
        cleanup();
        const ckWebAuthToken = event.data.ckWebAuthToken as string;
        try {
          const userResult = await fetchCloudKitCurrentUser(config, ckWebAuthToken);

          setProviderSession('cloudkit', {
            sessionToken: userResult.newWebAuthToken ?? ckWebAuthToken,
          });
          // CloudKit uses fixed recordName — auth = target confirmed (unlike Google which requires file selection)
          setSyncTargetConfirmed(true);
          setCloudSync(true);
          setSyncStatus('synced');
          enableCloudKitPersistence();
          showToast(t('status.connected'), 'success');
        } catch {
          showToast(t('error.auth'));
          setSyncStatus('unauthenticated');
        }
        setBusy(false);
        return;
      }

      if (event.data?.type === 'cloudkit-auth-error') {
        cleanup();
        showToast(t('error.auth'));
        setBusy(false);
        return;
      }
    };

    window.addEventListener('message', messageHandler);

    const closedPollTimer = window.setInterval(() => {
      if (settled) return;
      if (popup.closed) {
        cleanup();
        showToast(t('error.cancelled'));
        setBusy(false);
      }
    }, POPUP_CLOSED_POLL_MS);

    const timeoutTimer = window.setTimeout(() => {
      if (settled) return;
      cleanup();
      popup.close();
      showToast(t('error.timeout'));
      setBusy(false);
    }, AUTH_POPUP_TIMEOUT_MS);
  };

  const handlePull = async () => {
    if (busy) return;
    setBusy(true);
    setSyncStatus('syncing');

    try {
      const storage = createCloudKitCloudStorage();
      if (!storage) {
        showToast(t('error.auth'));
        setSyncStatus('unauthenticated');
        setBusy(false);
        return;
      }

      const remoteStorageValue = await storage.getItem('free-chat-gpt');
      if (!remoteStorageValue) {
        setSyncStatus('synced');
        setBusy(false);
        return;
      }

      const normalized = normalizeRemoteStorageValue(remoteStorageValue);
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

      enableCloudKitPersistence();
      setSyncStatus('synced');
      showToast(t('toast.pull'), 'success');
    } catch {
      showToast(t('error.auth'));
      setSyncStatus('unauthenticated');
    }
    setBusy(false);
  };

  const handlePush = async () => {
    if (busy) return;
    setBusy(true);
    setSyncStatus('syncing');

    try {
      enableCloudKitPersistence();
      await flushPendingCloudKitSync();
      setSyncStatus('synced');
      showToast(t('toast.push'), 'success');
    } catch {
      showToast(t('error.auth'));
      setSyncStatus('unauthenticated');
    }
    setBusy(false);
  };

  const handleDisconnect = () => {
    if (busy) return;
    resetCloudSyncProvider('cloudkit');
    disconnectCloudSync();
    enableLocalPersistence();
    showToast(t('status.disconnected'), 'success');
  };

  const isConnected = cloudSync && provider === 'cloudkit' && syncStatus !== 'unauthenticated';
  const needsReconnect = cloudSync && provider === 'cloudkit' && syncStatus === 'unauthenticated';

  if (!config) {
    return (
      <div className='rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'>
        {t('unavailable')}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300'>
        <p>{t('tagline')}</p>
        <p className='mt-2 text-xs'>{t('notice')}</p>
      </div>

      {isConnected && (
        <div className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200'>
          <SyncIcon status={syncStatus} />
          <span>
            {syncStatus === 'syncing' ? t('status.syncing') : t('status.connected')}
          </span>
        </div>
      )}

      <div className='grid gap-2 md:grid-cols-2'>
        {!isConnected && !needsReconnect && (
          <button
            type='button'
            className='btn btn-primary'
            onClick={handleConnect}
            disabled={busy}
          >
            {busy ? t('status.authenticating') : t('button.connect')}
          </button>
        )}

        {needsReconnect && (
          <>
            <button
              type='button'
              className='btn btn-primary'
              onClick={handleConnect}
              disabled={busy}
            >
              {busy ? t('status.authenticating') : t('button.connect')}
            </button>
            <button
              type='button'
              className='btn btn-neutral'
              onClick={handleDisconnect}
              disabled={busy}
            >
              {t('button.disconnect')}
            </button>
          </>
        )}

        {isConnected && (
          <>
            <button
              type='button'
              className='btn btn-primary'
              onClick={handlePull}
              disabled={busy}
            >
              {t('button.pull')}
            </button>
            <button
              type='button'
              className='btn btn-primary'
              onClick={handlePush}
              disabled={busy}
            >
              {t('button.push')}
            </button>
            <button
              type='button'
              className='btn btn-neutral md:col-span-2'
              onClick={handleDisconnect}
              disabled={busy}
            >
              {t('button.disconnect')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CloudKitSync;
