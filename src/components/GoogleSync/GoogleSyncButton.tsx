import React, { useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import useGStore from '@store/cloud-auth-store';
import useStore from '@store/store';
import { showToast } from '@utils/showToast';
import { createJSONStorage } from 'zustand/middleware';
import { createLocalStoragePartializedState } from '@store/persistence';
import compressedStorage from '@store/storage/CompressedStorage';

export interface GoogleSyncButtonHandle {
  connect: () => void;
  attemptSilentRefresh: () => void;
  disconnect: () => void;
}

const GoogleSyncButton = forwardRef<
  GoogleSyncButtonHandle,
  {
    loginHandler?: () => void;
    onBeforeSilentRefresh?: () => void;
    onSilentRefreshFail?: () => void;
    showDisconnectButton?: boolean;
    showDisconnectNotice?: boolean;
  }
>(({ loginHandler, onBeforeSilentRefresh, onSilentRefreshFail, showDisconnectButton = true, showDisconnectNotice = true }, ref) => {
  const { t } = useTranslation(['drive']);

  const setGoogleAccessToken = useGStore((state) => state.setGoogleAccessToken);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const setCloudSync = useGStore((state) => state.setCloudSync);
  const setSyncTargetConfirmed = useGStore((state) => state.setSyncTargetConfirmed);
  const cloudSync = useGStore((state) => state.cloudSync);

  const login = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setGoogleAccessToken(codeResponse.access_token);
      setCloudSync(true);
      loginHandler && loginHandler();
      showToast(t('toast.sync'), 'success');
    },
    onError: (error) => {
      console.log('Login Failed');
      showToast(error?.error_description || 'Error in authenticating!', 'error');
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
  });

  const silentLogin = useGoogleLogin({
    onSuccess: (codeResponse) => {
      onBeforeSilentRefresh?.();
      setGoogleAccessToken(codeResponse.access_token);
    },
    onError: () => {
      console.log('Silent refresh failed, manual re-login required');
      onSilentRefreshFail?.();
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
    prompt: '',
  });

  useImperativeHandle(ref, () => ({
    connect: () => {
      login();
    },
    attemptSilentRefresh: () => {
      silentLogin();
    },
    disconnect: () => {
      logout();
    },
  }));

  const logout = () => {
    setGoogleAccessToken(undefined);
    setSyncStatus('unauthenticated');
    setCloudSync(false);
    setSyncTargetConfirmed(false);
    googleLogout();
    useStore.persist.setOptions({
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => createLocalStoragePartializedState(state),
    });
    useStore.persist.rehydrate();
    showToast(t('toast.stop'), 'success');
  };

  return (
    (showDisconnectButton || showDisconnectNotice) ? (
    <div className='flex flex-col items-center gap-3'>
      <div className='flex gap-4 flex-wrap justify-center'>
        <button
          className='btn btn-primary'
          onClick={() => login()}
          aria-label={t('button.sync') as string}
        >
          {t('button.sync')}
        </button>
        {cloudSync && showDisconnectButton && (
          <button
            className='btn btn-neutral'
            onClick={logout}
            aria-label={t('button.stop') as string}
          >
            {t('button.stop')}
          </button>
        )}
      </div>
      {cloudSync && showDisconnectNotice && (
        <div className='max-w-xl rounded-lg border border-gray-200 bg-gray-100/80 px-4 py-3 text-left text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300'>
          <div className='font-medium text-gray-900 dark:text-gray-100'>
            {t('actions.disconnectTitle')}
          </div>
          <div className='mt-1'>{t('actions.disconnectDescription')}</div>
        </div>
      )}
    </div>
    ) : null
  );
});

export default GoogleSyncButton;
