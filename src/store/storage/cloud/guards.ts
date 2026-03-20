import { compress } from 'lz-string';
import type { CloudSyncMetrics } from './types';

const MAX_CLOUD_SYNC_JSON_BYTES = 2_000_000;
const MAX_CLOUD_SYNC_COMPRESSED_BYTES = 1_000_000;
const MIN_DESTRUCTIVE_SIZE_RATIO = 0.2;

const getSnapshotState = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  if ('state' in value && value.state && typeof value.state === 'object') {
    return value.state as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
};

export const computeCloudSyncMetrics = (value: unknown): CloudSyncMetrics => {
  const json = JSON.stringify(value) ?? '';
  const compressed = compress(json) ?? '';
  const state = getSnapshotState(value);
  const chats = state?.chats;
  const contentStore = state?.contentStore;

  return {
    jsonBytes: new Blob([json]).size,
    compressedBytes: new Blob([compressed]).size,
    chatCount: Array.isArray(chats) ? chats.length : null,
    contentEntryCount:
      contentStore && typeof contentStore === 'object'
        ? Object.keys(contentStore).length
        : null,
  };
};

export const getCloudSyncGuardMessage = (
  value: unknown,
  metrics: CloudSyncMetrics,
  lastSuccessfulUploadMetrics: CloudSyncMetrics | null,
  maxCompressedBytes: number = MAX_CLOUD_SYNC_COMPRESSED_BYTES
): string | null => {
  if (metrics.jsonBytes > MAX_CLOUD_SYNC_JSON_BYTES) {
    return 'Cloud sync skipped because the snapshot is too large to upload safely.';
  }

  if (metrics.compressedBytes > maxCompressedBytes) {
    return 'Cloud sync skipped because the compressed snapshot is too large to upload safely.';
  }

  if (metrics.chatCount === 0) {
    return 'Cloud sync skipped because the snapshot would erase all chats.';
  }

  const state = getSnapshotState(value);
  const stateChats = state?.['chats'];
  const chats = Array.isArray(stateChats) ? stateChats : null;
  if (
    metrics.contentEntryCount === 0 &&
    chats &&
    chats.some(
      (chat) =>
        chat &&
        typeof chat === 'object' &&
        'branchTree' in chat &&
        chat.branchTree &&
        typeof chat.branchTree === 'object'
    )
  ) {
    return 'Cloud sync skipped because branch data is missing from the snapshot.';
  }

  if (
    lastSuccessfulUploadMetrics &&
    metrics.chatCount !== null &&
    lastSuccessfulUploadMetrics.chatCount !== null &&
    lastSuccessfulUploadMetrics.chatCount > 0 &&
    metrics.chatCount < lastSuccessfulUploadMetrics.chatCount &&
    metrics.chatCount === 0
  ) {
    return 'Cloud sync skipped because the snapshot removes every synced chat.';
  }

  if (
    lastSuccessfulUploadMetrics &&
    lastSuccessfulUploadMetrics.compressedBytes > 0 &&
    metrics.compressedBytes <
      lastSuccessfulUploadMetrics.compressedBytes * MIN_DESTRUCTIVE_SIZE_RATIO
  ) {
    return 'Cloud sync skipped because the snapshot shrank too much compared with the last successful sync.';
  }

  return null;
};
