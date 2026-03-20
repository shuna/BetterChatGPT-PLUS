import { describe, expect, it } from 'vitest';
import {
  createCloudAuthPersistedState,
  createCloudProviderSyncState,
  disconnectCloudSyncState,
  migrateCloudAuthPersistedState,
  resetCloudProviderState,
  switchCloudProviderState,
} from './cloud-auth-types';

describe('cloud auth state helpers', () => {
  it('switches providers without losing provider-specific state', () => {
    const state = createCloudAuthPersistedState({
      provider: 'google',
      cloudSync: true,
      googleAccessToken: 'google-token',
      googleRefreshToken: 'google-refresh',
      fileId: 'google-file',
      providers: {
        google: {
          sessionToken: 'google-token',
          refreshToken: 'google-refresh',
          targetId: 'google-file',
          targetLabel: 'Google Drive',
          syncStatus: 'synced',
          syncTargetConfirmed: true,
        },
        cloudkit: {
          sessionToken: 'cloudkit-token',
          refreshToken: 'cloudkit-refresh',
          targetId: 'cloudkit-record',
          targetLabel: 'CloudKit',
          syncStatus: 'syncing',
          syncTargetConfirmed: false,
        },
      },
    });

    const switched = switchCloudProviderState(state, 'cloudkit');

    expect(switched.provider).toBe('cloudkit');
    expect(switched.syncStatus).toBe('syncing');
    expect(switched.syncTargetConfirmed).toBe(false);
    expect(switched.remoteTargetId).toBe('cloudkit-record');
    expect(switched.fileId).toBe('cloudkit-record');
    expect(switched.googleAccessToken).toBe('google-token');
    expect(switched.googleRefreshToken).toBe('google-refresh');
    expect(switched.providers.google.targetId).toBe('google-file');
    expect(switched.providers.cloudkit.targetId).toBe('cloudkit-record');
  });

  it('disconnects the active provider while preserving the other provider', () => {
    const state = createCloudAuthPersistedState({
      provider: 'google',
      cloudSync: true,
      googleAccessToken: 'google-token',
      fileId: 'google-file',
      providers: {
        google: {
          sessionToken: 'google-token',
          refreshToken: 'google-refresh',
          targetId: 'google-file',
          targetLabel: 'Google Drive',
          syncStatus: 'synced',
          syncTargetConfirmed: true,
        },
        cloudkit: {
          sessionToken: 'cloudkit-token',
          targetId: 'cloudkit-record',
          targetLabel: 'CloudKit',
          syncStatus: 'syncing',
          syncTargetConfirmed: false,
        },
      },
    });

    const disconnected = disconnectCloudSyncState(state);

    expect(disconnected.cloudSync).toBe(false);
    expect(disconnected.provider).toBe('google');
    expect(disconnected.syncStatus).toBe('unauthenticated');
    expect(disconnected.syncTargetConfirmed).toBe(false);
    expect(disconnected.googleAccessToken).toBeUndefined();
    expect(disconnected.fileId).toBeUndefined();
    expect(disconnected.providers.google).toEqual(createCloudProviderSyncState());
    expect(disconnected.providers.cloudkit.targetId).toBe('cloudkit-record');
    expect(disconnected.providers.cloudkit.sessionToken).toBe('cloudkit-token');
  });

  it('can reset a non-active provider without changing the current provider alias', () => {
    const state = createCloudAuthPersistedState({
      provider: 'google',
      cloudSync: true,
      googleAccessToken: 'google-token',
      fileId: 'google-file',
      providers: {
        google: {
          sessionToken: 'google-token',
          targetId: 'google-file',
          syncStatus: 'synced',
          syncTargetConfirmed: true,
        },
        cloudkit: {
          sessionToken: 'cloudkit-token',
          targetId: 'cloudkit-record',
          syncStatus: 'syncing',
          syncTargetConfirmed: true,
        },
      },
    });

    const reset = resetCloudProviderState(state, 'cloudkit');

    expect(reset.provider).toBe('google');
    expect(reset.syncStatus).toBe('synced');
    expect(reset.fileId).toBe('google-file');
    expect(reset.providers.google.targetId).toBe('google-file');
    expect(reset.providers.cloudkit).toEqual(createCloudProviderSyncState());
  });

  it('migrates legacy google-only cloud auth state', () => {
    const migrated = migrateCloudAuthPersistedState(
      {
        cloudSync: true,
        syncStatus: 'synced',
        syncTargetConfirmed: true,
        googleAccessToken: 'google-token',
        googleRefreshToken: 'google-refresh',
        fileId: 'google-file',
      },
      2
    );

    expect(migrated.provider).toBe('google');
    expect(migrated.cloudSync).toBe(true);
    expect(migrated.googleAccessToken).toBe('google-token');
    expect(migrated.googleRefreshToken).toBe('google-refresh');
    expect(migrated.fileId).toBe('google-file');
    expect(migrated.providers.google.targetId).toBe('google-file');
    expect(migrated.providers.cloudkit).toEqual(createCloudProviderSyncState());
  });

  it('preserves recordChangeTag through create/restore cycle', () => {
    const state = createCloudAuthPersistedState({
      provider: 'cloudkit',
      providers: {
        google: createCloudProviderSyncState(),
        cloudkit: createCloudProviderSyncState({
          sessionToken: 'ck-token',
          syncStatus: 'synced',
          syncTargetConfirmed: true,
          recordChangeTag: 'tag-abc',
        }),
      },
    });

    expect(state.providers.cloudkit.recordChangeTag).toBe('tag-abc');

    // Simulate persist restore: createCloudAuthPersistedState is called with
    // the serialized state, which internally calls createCloudProviderSyncState
    const restored = createCloudAuthPersistedState({
      provider: state.provider,
      cloudSync: state.cloudSync,
      providers: state.providers,
    });

    expect(restored.providers.cloudkit.recordChangeTag).toBe('tag-abc');
  });
});
