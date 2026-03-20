import { StoreApi, create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CloudAuthSlice, createCloudAuthSlice } from './cloud-auth-slice';
import {
  CLOUD_AUTH_STORAGE_VERSION,
  createCloudAuthPersistedState,
  migrateCloudAuthPersistedState,
} from './cloud-auth-types';

export type StoreState = CloudAuthSlice;

export type StoreSlice<T> = (
  set: StoreApi<StoreState>['setState'],
  get: StoreApi<StoreState>['getState']
) => T;

const useCloudAuthStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...createCloudAuthSlice(set, get),
    }),
    {
      name: 'cloud',
      partialize: (state) =>
        createCloudAuthPersistedState({
          provider: state.provider,
          cloudSync: state.cloudSync,
          syncStatus: state.syncStatus,
          syncTargetConfirmed: state.syncTargetConfirmed,
          remoteTargetId: state.remoteTargetId,
          remoteTargetLabel: state.remoteTargetLabel,
          googleAccessToken: state.googleAccessToken,
          googleRefreshToken: state.googleRefreshToken,
          fileId: state.fileId,
          providers: state.providers,
        }),
      version: CLOUD_AUTH_STORAGE_VERSION,
      migrate: (persistedState, version) =>
        migrateCloudAuthPersistedState(persistedState, version),
    }
  )
);

export default useCloudAuthStore;
