import React, { useState } from 'react';

import useCloudAuthStore from '@store/cloud-auth-store';
import type { CloudSyncProvider as CloudSyncProviderType } from '@store/cloud-auth-types';
import GoogleSync from './GoogleSync';
import CloudKitSync from './CloudKitSync';
import RefreshIcon from '@icon/RefreshIcon';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

const providerLabels: Record<CloudSyncProviderType, string> = {
  google: 'Google Drive',
  cloudkit: 'iCloud',
};

const CloudSync = () => {
  const selectedProvider = useCloudAuthStore((s) => s.provider);
  const cloudSync = useCloudAuthStore((s) => s.cloudSync);
  const setProvider = useCloudAuthStore((s) => s.setProvider);

  const [expanded, setExpanded] = useState(false);
  // Track when user picked a provider to set up (before cloudSync is true)
  const [setupProvider, setSetupProvider] = useState<CloudSyncProviderType | null>(null);

  const isActive = cloudSync;
  // Show the provider panel when active OR when user is in setup flow
  const showingProvider = isActive ? selectedProvider : setupProvider;

  return (
    <>
      <a
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => {
          setExpanded((v) => !v);
          if (expanded) setSetupProvider(null);
        }}
      >
        <RefreshIcon className='w-4 h-4' />
        クラウド同期
        {isActive && (
          <span className='ml-auto text-xs text-gray-400 dark:text-gray-500'>
            {providerLabels[selectedProvider]}
          </span>
        )}
      </a>

      {expanded && (
        <div className='px-2 pb-2'>
          {showingProvider ? (
            /* --- Provider panel (active or setting up) --- */
            <>
              {showingProvider === 'google' ? (
                googleClientId ? (
                  <GoogleSync clientId={googleClientId} />
                ) : (
                  <div className='text-xs text-amber-600 dark:text-amber-400'>
                    VITE_GOOGLE_CLIENT_ID 未設定
                  </div>
                )
              ) : (
                <CloudKitSync />
              )}
              {!isActive && (
                <button
                  type='button'
                  onClick={() => setSetupProvider(null)}
                  className='mt-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                >
                  ← 戻る
                </button>
              )}
            </>
          ) : (
            /* --- No sync: show provider choices --- */
            <div className='flex flex-col gap-1'>
              <button
                type='button'
                onClick={() => {
                  setProvider('google');
                  setSetupProvider('google');
                }}
                className='rounded px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
              >
                Google Drive で同期
              </button>
              <button
                type='button'
                onClick={() => {
                  setProvider('cloudkit');
                  setSetupProvider('cloudkit');
                }}
                className='rounded px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
              >
                iCloud で同期
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default CloudSync;
