import type { PersistStorage } from 'zustand/middleware';
import { createCloudPersistStorage } from './cloud/createCloudPersistStorage';
import {
  createCloudKitCloudProvider,
  validateCloudKitSync,
} from './cloud/providers/cloudkit';

const controller = createCloudPersistStorage(
  createCloudKitCloudProvider<unknown>(),
  { maxCompressedBytes: 700_000 }
);

export const flushPendingCloudKitSync = controller.flushPendingCloudSync;
export const resetPendingCloudKitSyncForTests =
  controller.resetPendingCloudSyncForTests;

const createCloudKitCloudStorage = <S>(): PersistStorage<S> | undefined => {
  if (!validateCloudKitSync()) return;
  return controller.storage as PersistStorage<S>;
};

export default createCloudKitCloudStorage;
