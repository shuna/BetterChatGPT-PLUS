import type { PersistStorage } from 'zustand/middleware';
import { createCloudPersistStorage } from './cloud/createCloudPersistStorage';
import {
  createGoogleCloudProvider,
  validateGoogleCloudSync,
} from './cloud/providers/google';

const controller = createCloudPersistStorage(createGoogleCloudProvider<unknown>());

export const flushPendingCloudSync = controller.flushPendingCloudSync;
export const resetPendingCloudSyncForTests =
  controller.resetPendingCloudSyncForTests;

const createGoogleCloudStorage = <S>(): PersistStorage<S> | undefined => {
  if (!validateGoogleCloudSync()) return;
  return controller.storage as PersistStorage<S>;
};

export default createGoogleCloudStorage;
