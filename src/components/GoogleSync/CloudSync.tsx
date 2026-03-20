import React from 'react';

import useCloudAuthStore from '@store/cloud-auth-store';
import type { CloudSyncProvider as CloudSyncProviderType } from '@store/cloud-auth-types';
import GoogleSync from './GoogleSync';
import CloudKitSync from './CloudKitSync';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

type ProviderOption = {
  id: CloudSyncProviderType;
  title: string;
  description: string;
};

const providerOptions: ProviderOption[] = [
  {
    id: 'google',
    title: 'Google Drive',
    description: 'Keeps the current Drive-based sync flow available for web and desktop.',
  },
  {
    id: 'cloudkit',
    title: 'iCloud / CloudKit',
    description: 'iPhone-friendly sync via your private iCloud container.',
  },
];

const CloudSync = () => {
  const selectedProvider = useCloudAuthStore((s) => s.provider);
  const setProvider = useCloudAuthStore((s) => s.setProvider);

  return (
    <div className='rounded-md border border-gray-200 bg-white/60 p-3 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200'>
      <div className='mb-3'>
        <div className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
          Sync provider
        </div>
        <div className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
          Choose the cloud backend that should own this workspace snapshot.
        </div>
      </div>

      <div className='grid gap-2 md:grid-cols-2'>
        {providerOptions.map((provider) => {
          const active = selectedProvider === provider.id;
          return (
            <button
              key={provider.id}
              type='button'
              onClick={() => setProvider(provider.id)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                active
                  ? 'border-emerald-400 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-50'
                  : 'border-gray-200 bg-white/80 text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-900/70'
              }`}
            >
              <div className='text-sm font-semibold'>{provider.title}</div>
              <div className='mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300'>
                {provider.description}
              </div>
            </button>
          );
        })}
      </div>

      <div className='mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/90 p-3 dark:border-gray-700 dark:bg-gray-900/40'>
        {selectedProvider === 'google' ? (
          <div className='space-y-3'>
            <div className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
              Google Drive
            </div>
            {googleClientId ? (
              <GoogleSync clientId={googleClientId} />
            ) : (
              <div className='rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'>
                Google sync is unavailable because `VITE_GOOGLE_CLIENT_ID` is
                not configured.
              </div>
            )}
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
              iCloud / CloudKit
            </div>
            <CloudKitSync />
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudSync;
