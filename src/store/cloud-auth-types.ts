import type { SyncStatus } from '@type/google-api';

export type CloudSyncProvider = 'google' | 'cloudkit';

export const DEFAULT_CLOUD_SYNC_PROVIDER: CloudSyncProvider = 'google';
export const CLOUD_AUTH_STORAGE_VERSION = 3;

export interface CloudProviderSyncState {
  sessionToken?: string;
  refreshToken?: string;
  targetId?: string;
  targetLabel?: string;
  syncStatus: SyncStatus;
  syncTargetConfirmed: boolean;
  recordChangeTag?: string;
}

export interface CloudProviderSyncStateMap {
  google: CloudProviderSyncState;
  cloudkit: CloudProviderSyncState;
}

export interface CloudAuthPersistedState {
  provider: CloudSyncProvider;
  cloudSync: boolean;
  syncStatus: SyncStatus;
  syncTargetConfirmed: boolean;
  remoteTargetId?: string;
  remoteTargetLabel?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  fileId?: string;
  providers: CloudProviderSyncStateMap;
}

const DEFAULT_SYNC_STATE: SyncStatus = 'unauthenticated';

export const isCloudSyncProvider = (value: unknown): value is CloudSyncProvider =>
  value === 'google' || value === 'cloudkit';

export const isSyncStatus = (value: unknown): value is SyncStatus =>
  value === 'unauthenticated' || value === 'syncing' || value === 'synced';

export const createCloudProviderSyncState = (
  partial?: Partial<CloudProviderSyncState>
): CloudProviderSyncState => ({
  sessionToken: partial?.sessionToken,
  refreshToken: partial?.refreshToken,
  targetId: partial?.targetId,
  targetLabel: partial?.targetLabel,
  syncStatus: partial?.syncStatus ?? DEFAULT_SYNC_STATE,
  syncTargetConfirmed: partial?.syncTargetConfirmed ?? false,
  recordChangeTag: partial?.recordChangeTag,
});

export const createCloudAuthPersistedState = (
  partial?: Partial<CloudAuthPersistedState>
): CloudAuthPersistedState => {
  const providers: CloudProviderSyncStateMap = {
    google: createCloudProviderSyncState(partial?.providers?.google),
    cloudkit: createCloudProviderSyncState(partial?.providers?.cloudkit),
  };
  const partialProvider = partial?.provider;
  const provider = isCloudSyncProvider(partialProvider)
    ? partialProvider
    : DEFAULT_CLOUD_SYNC_PROVIDER;
  const activeProviderState = providers[provider];

  return {
    provider,
    cloudSync: partial?.cloudSync ?? false,
    syncStatus: partial?.syncStatus ?? activeProviderState.syncStatus,
    syncTargetConfirmed:
      partial?.syncTargetConfirmed ?? activeProviderState.syncTargetConfirmed,
    remoteTargetId: partial?.remoteTargetId ?? activeProviderState.targetId,
    remoteTargetLabel:
      partial?.remoteTargetLabel ?? activeProviderState.targetLabel,
    googleAccessToken:
      partial?.googleAccessToken ?? providers.google.sessionToken,
    googleRefreshToken:
      partial?.googleRefreshToken ?? providers.google.refreshToken,
    fileId: partial?.fileId ?? activeProviderState.targetId,
    providers,
  };
};

const updateActiveProviderAliases = (
  state: CloudAuthPersistedState,
  provider: CloudSyncProvider = state.provider
): CloudAuthPersistedState => {
  const activeProviderState = state.providers[provider];
  return {
    ...state,
    provider,
    syncStatus: activeProviderState.syncStatus,
    syncTargetConfirmed: activeProviderState.syncTargetConfirmed,
    remoteTargetId: activeProviderState.targetId,
    remoteTargetLabel: activeProviderState.targetLabel,
    fileId: activeProviderState.targetId,
    googleAccessToken: state.providers.google.sessionToken,
    googleRefreshToken: state.providers.google.refreshToken,
  };
};

export const switchCloudProviderState = (
  state: CloudAuthPersistedState,
  provider: CloudSyncProvider
): CloudAuthPersistedState => updateActiveProviderAliases(state, provider);

export const setCloudProviderSessionState = (
  state: CloudAuthPersistedState,
  provider: CloudSyncProvider,
  session: Partial<CloudProviderSyncState>
): CloudAuthPersistedState => {
  const nextProviders: CloudProviderSyncStateMap = {
    ...state.providers,
    [provider]: {
      ...state.providers[provider],
      ...session,
    },
  };

  return updateActiveProviderAliases(
    {
      ...state,
      providers: nextProviders,
    },
    state.provider
  );
};

export const setCloudProviderTargetState = (
  state: CloudAuthPersistedState,
  provider: CloudSyncProvider,
  targetId?: string,
  targetLabel?: string
): CloudAuthPersistedState => {
  const nextProviders: CloudProviderSyncStateMap = {
    ...state.providers,
    [provider]: {
      ...state.providers[provider],
      targetId,
      targetLabel,
    },
  };

  return updateActiveProviderAliases(
    {
      ...state,
      providers: nextProviders,
    },
    state.provider
  );
};

export const setCloudSyncStatusState = (
  state: CloudAuthPersistedState,
  syncStatus: SyncStatus
): CloudAuthPersistedState => {
  const nextProviders: CloudProviderSyncStateMap = {
    ...state.providers,
    [state.provider]: {
      ...state.providers[state.provider],
      syncStatus,
    },
  };

  return updateActiveProviderAliases(
    {
      ...state,
      providers: nextProviders,
    },
    state.provider
  );
};

export const setCloudSyncTargetConfirmedState = (
  state: CloudAuthPersistedState,
  syncTargetConfirmed: boolean
): CloudAuthPersistedState => {
  const nextProviders: CloudProviderSyncStateMap = {
    ...state.providers,
    [state.provider]: {
      ...state.providers[state.provider],
      syncTargetConfirmed,
    },
  };

  return updateActiveProviderAliases(
    {
      ...state,
      providers: nextProviders,
    },
    state.provider
  );
};

export const resetCloudProviderState = (
  state: CloudAuthPersistedState,
  provider: CloudSyncProvider = state.provider
): CloudAuthPersistedState => {
  const nextProviders: CloudProviderSyncStateMap = {
    ...state.providers,
    [provider]: createCloudProviderSyncState(),
  };
  const nextState = {
    ...state,
    providers: nextProviders,
  };

  return updateActiveProviderAliases(
    nextState,
    state.provider
  );
};

export const disconnectCloudSyncState = (
  state: CloudAuthPersistedState
): CloudAuthPersistedState =>
  {
    const resetState = resetCloudProviderState(state, state.provider);
    return {
      ...resetState,
      cloudSync: false,
    };
  };

export const migrateCloudAuthPersistedState = (
  persistedState: unknown,
  version: number
): CloudAuthPersistedState => {
  if (!persistedState || typeof persistedState !== 'object') {
    return createCloudAuthPersistedState();
  }

  const state = persistedState as Record<string, unknown>;
  const providers = state.providers;

  if (
    version >= CLOUD_AUTH_STORAGE_VERSION &&
    providers &&
    typeof providers === 'object'
  ) {
    return createCloudAuthPersistedState(state as Partial<CloudAuthPersistedState>);
  }

  const googleProviderState = createCloudProviderSyncState({
    sessionToken:
      typeof state.googleAccessToken === 'string'
        ? state.googleAccessToken
        : undefined,
    refreshToken:
      typeof state.googleRefreshToken === 'string'
        ? state.googleRefreshToken
        : undefined,
    targetId: typeof state.fileId === 'string' ? state.fileId : undefined,
    targetLabel:
      typeof state.remoteTargetLabel === 'string'
        ? state.remoteTargetLabel
        : undefined,
    syncStatus: isSyncStatus(state.syncStatus)
      ? state.syncStatus
      : DEFAULT_SYNC_STATE,
    syncTargetConfirmed: Boolean(state.syncTargetConfirmed),
  });

  return createCloudAuthPersistedState({
    provider: DEFAULT_CLOUD_SYNC_PROVIDER,
    cloudSync: Boolean(state.cloudSync),
    syncStatus: googleProviderState.syncStatus,
    syncTargetConfirmed: googleProviderState.syncTargetConfirmed,
    remoteTargetId: googleProviderState.targetId,
    remoteTargetLabel: googleProviderState.targetLabel,
    googleAccessToken: googleProviderState.sessionToken,
    googleRefreshToken: googleProviderState.refreshToken,
    fileId: googleProviderState.targetId,
    providers: {
      google: googleProviderState,
      cloudkit: createCloudProviderSyncState(),
    },
  });
};
