import { isGoogleAuthError, listDriveFiles } from '@api/google-api';

import useStore, { createPartializedState } from '@store/store';
import useCloudAuthStore from '@store/cloud-auth-store';
import { showToast } from '@utils/showToast';
import { STORE_VERSION } from '@store/version';

export const getFiles = async (googleAccessToken: string) => {
  try {
    const driveFiles = await listDriveFiles(googleAccessToken);
    return driveFiles.files;
  } catch (e: unknown) {
    useCloudAuthStore.getState().setSyncStatus(
      isGoogleAuthError(e) ? 'unauthenticated' : 'synced'
    );
    showToast((e as Error).message, 'error');
    return;
  }
};

export const getFileID = async (
  googleAccessToken: string
): Promise<string | null> => {
  const driveFiles = await listDriveFiles(googleAccessToken);
  if (driveFiles.files.length === 0) return null;
  return driveFiles.files[0].id;
};

export const stateToFile = () => {
  const partializedState = createPartializedState(useStore.getState());
  const snapshot = {
    state: partializedState,
    version: STORE_VERSION,
  };

  const blob = new Blob([JSON.stringify(snapshot)], {
    type: 'application/json',
  });
  const file = new File([blob], 'better-chatgpt.json', {
    type: 'application/json',
  });

  return file;
};
