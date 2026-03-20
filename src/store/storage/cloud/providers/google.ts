import useCloudAuthStore from '@store/cloud-auth-store';
import useStore from '@store/store';
import {
  deleteDriveFile,
  getDriveFile,
  isGoogleAuthError,
  updateDriveFile,
  validateGoogleOath2AccessToken,
} from '@api/google-api';
import type { CloudSyncProvider, CloudSyncTarget } from '../types';

const getCloudSyncTarget = (): CloudSyncTarget | null => {
  const { googleAccessToken, fileId, syncStatus } = useCloudAuthStore.getState();
  if (!googleAccessToken || !fileId || syncStatus === 'unauthenticated') {
    return null;
  }

  return {
    accessToken: googleAccessToken,
    fileId,
  };
};

const notifyCloudError = (message: string) => {
  useStore.getState().setToastMessage(message);
  useStore.getState().setToastShow(true);
  useStore.getState().setToastStatus('error');
};

export const validateGoogleCloudSync = () => {
  const { googleAccessToken, fileId } = useCloudAuthStore.getState();
  if (!googleAccessToken || !fileId) return false;

  try {
    return validateGoogleOath2AccessToken(googleAccessToken);
  } catch {
    return false;
  }
};

export const createGoogleCloudProvider = <S>(): CloudSyncProvider<S> => ({
  getTarget: getCloudSyncTarget,
  readItem: async (name, target) => getDriveFile(target.fileId, target.accessToken),
  writeItem: async (name, file, target) => {
    await updateDriveFile(file, target.fileId, target.accessToken);
  },
  removeItem: async (name, target) => {
    await deleteDriveFile(target.accessToken, target.fileId);
  },
  isAuthError: isGoogleAuthError,
  setSyncStatus: (status) => {
    useCloudAuthStore.getState().setSyncStatus(status);
  },
  notifyError: notifyCloudError,
});
