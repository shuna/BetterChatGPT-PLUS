import type { SyncStatus } from '@type/google-api';
import {
  type CloudAuthPersistedState,
  type CloudProviderSyncState,
  type CloudSyncProvider,
  createCloudAuthPersistedState,
  disconnectCloudSyncState,
  resetCloudProviderState,
  setCloudProviderSessionState,
  setCloudProviderTargetState,
  setCloudSyncStatusState,
  setCloudSyncTargetConfirmedState,
  switchCloudProviderState,
} from './cloud-auth-types';
import type { StoreSlice } from './cloud-auth-store';

export interface CloudAuthSlice extends CloudAuthPersistedState {
  setProvider: (provider: CloudSyncProvider) => void;
  setGoogleAccessToken: (googleAccessToken?: string) => void;
  setGoogleRefreshToken: (googleRefreshToken?: string) => void;
  setFileId: (fileId?: string) => void;
  setRemoteTargetId: (remoteTargetId?: string) => void;
  setRemoteTargetLabel: (remoteTargetLabel?: string) => void;
  setProviderSession: (
    provider: CloudSyncProvider,
    session: Partial<CloudProviderSyncState>
  ) => void;
  setProviderTarget: (
    provider: CloudSyncProvider,
    targetId?: string,
    targetLabel?: string
  ) => void;
  setCloudSync: (cloudSync: boolean) => void;
  setSyncStatus: (syncStatus: SyncStatus) => void;
  setSyncTargetConfirmed: (syncTargetConfirmed: boolean) => void;
  resetCloudSyncProvider: (provider?: CloudSyncProvider) => void;
  disconnectCloudSync: () => void;
}

const mergeCloudAuthState = (
  prev: CloudAuthSlice,
  next: CloudAuthPersistedState
): CloudAuthSlice => ({
  ...prev,
  ...next,
});

export const createCloudAuthSlice: StoreSlice<CloudAuthSlice> = (set) => ({
  ...createCloudAuthPersistedState(),
  setProvider: (provider: CloudSyncProvider) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(prev, switchCloudProviderState(prev, provider))
    );
  },
  setGoogleAccessToken: (googleAccessToken?: string) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderSessionState(prev, 'google', {
          sessionToken: googleAccessToken,
        })
      )
    );
  },
  setGoogleRefreshToken: (googleRefreshToken?: string) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderSessionState(prev, 'google', {
          refreshToken: googleRefreshToken,
        })
      )
    );
  },
  setFileId: (fileId?: string) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderTargetState(prev, prev.provider, fileId)
      )
    );
  },
  setRemoteTargetId: (remoteTargetId?: string) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderTargetState(
          prev,
          prev.provider,
          remoteTargetId,
          prev.remoteTargetLabel
        )
      )
    );
  },
  setRemoteTargetLabel: (remoteTargetLabel?: string) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderTargetState(
          prev,
          prev.provider,
          prev.remoteTargetId,
          remoteTargetLabel
        )
      )
    );
  },
  setProviderSession: (
    provider: CloudSyncProvider,
    session: Partial<CloudProviderSyncState>
  ) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderSessionState(prev, provider, session)
      )
    );
  },
  setProviderTarget: (
    provider: CloudSyncProvider,
    targetId?: string,
    targetLabel?: string
  ) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudProviderTargetState(prev, provider, targetId, targetLabel)
      )
    );
  },
  setCloudSync: (cloudSync: boolean) => {
    set((prev: CloudAuthSlice) => ({
      ...prev,
      cloudSync,
    }));
  },
  setSyncStatus: (syncStatus: SyncStatus) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(prev, setCloudSyncStatusState(prev, syncStatus))
    );
  },
  setSyncTargetConfirmed: (syncTargetConfirmed: boolean) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        setCloudSyncTargetConfirmedState(prev, syncTargetConfirmed)
      )
    );
  },
  resetCloudSyncProvider: (provider?: CloudSyncProvider) => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(
        prev,
        resetCloudProviderState(prev, provider ?? prev.provider)
      )
    );
  },
  disconnectCloudSync: () => {
    set((prev: CloudAuthSlice) =>
      mergeCloudAuthState(prev, disconnectCloudSyncState(prev))
    );
  },
});
