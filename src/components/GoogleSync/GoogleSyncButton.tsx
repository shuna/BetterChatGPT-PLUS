import React, { useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import useGStore from '@store/cloud-auth-store';
import useStore from '@store/store';
import { createJSONStorage } from 'zustand/middleware';

export interface GoogleSyncButtonHandle {
  attemptSilentRefresh: () => void;
}

const GoogleSyncButton = forwardRef<
  GoogleSyncButtonHandle,
  { loginHandler?: () => void; onSilentRefreshFail?: () => void }
>(({ loginHandler, onSilentRefreshFail }, ref) => {
  const { t } = useTranslation(['drive']);

  const setGoogleAccessToken = useGStore((state) => state.setGoogleAccessToken);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const setCloudSync = useGStore((state) => state.setCloudSync);
  const cloudSync = useGStore((state) => state.cloudSync);

  const setToastStatus = useStore((state) => state.setToastStatus);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const setToastShow = useStore((state) => state.setToastShow);

  const login = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setGoogleAccessToken(codeResponse.access_token);
      setCloudSync(true);
      loginHandler && loginHandler();
      setToastStatus('success');
      setToastMessage(t('toast.sync'));
      setToastShow(true);
    },
    onError: (error) => {
      console.log('Login Failed');
      setToastStatus('error');
      setToastMessage(error?.error_description || 'Error in authenticating!');
      setToastShow(true);
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
  });

  const silentLogin = useGoogleLogin({
    onSuccess: (codeResponse) => {
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
    attemptSilentRefresh: () => {
      silentLogin();
    },
  }));

  const logout = () => {
    setGoogleAccessToken(undefined);
    setSyncStatus('unauthenticated');
    setCloudSync(false);
    googleLogout();
    useStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage),
    });
    useStore.persist.rehydrate();
    setToastStatus('success');
    setToastMessage(t('toast.stop'));
    setToastShow(true);
  };

  return (
    <div className='flex gap-4 flex-wrap justify-center'>
      <button
        className='btn btn-primary'
        onClick={() => login()}
        aria-label={t('button.sync') as string}
      >
        {t('button.sync')}
      </button>
      {cloudSync && (
        <button
          className='btn btn-neutral'
          onClick={logout}
          aria-label={t('button.stop') as string}
        >
          {t('button.stop')}
        </button>
      )}
    </div>
  );
});

export default GoogleSyncButton;
