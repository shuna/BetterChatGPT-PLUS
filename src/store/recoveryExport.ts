import useStore from '@store/store';
import { createPersistedChatDataState } from '@store/persistence';
import { collectIndexedDbRecoverySnapshot } from '@store/storage/IndexedDbStorage';
import compressedStorage from '@store/storage/CompressedStorage';
import { getToday } from '@utils/date';

type RecoverySource<T> = {
  available: boolean;
  data?: T;
  error?: string;
};

export type RecoveryExportPayload = {
  version: 1;
  exportedAt: string;
  sources: {
    liveStore: RecoverySource<ReturnType<typeof createPersistedChatDataState> & {
      folders: ReturnType<typeof useStore.getState>['folders'];
      evaluationSettings: ReturnType<typeof useStore.getState>['evaluationSettings'];
      evaluationResults: ReturnType<typeof useStore.getState>['evaluationResults'];
    }>;
    zustandPersist: RecoverySource<unknown>;
    legacyLocalStorageChats: RecoverySource<unknown>;
    indexedDb: RecoverySource<Awaited<ReturnType<typeof collectIndexedDbRecoverySnapshot>>>;
  };
};

const readJsonValue = (raw: string | null): RecoverySource<unknown> => {
  if (!raw) return { available: false };
  try {
    return {
      available: true,
      data: JSON.parse(raw),
    };
  } catch (error) {
    return {
      available: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const readRecoveryLocalSources = async (): Promise<Pick<
  RecoveryExportPayload['sources'],
  'zustandPersist' | 'legacyLocalStorageChats'
>> => {
  let persisted: RecoverySource<unknown>;
  try {
    const raw = await compressedStorage.getItem('free-chat-gpt');
    persisted = readJsonValue(raw);
  } catch (error) {
    persisted = {
      available: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const legacyLocalStorageChats = readJsonValue(localStorage.getItem('chats'));

  return {
    zustandPersist: persisted,
    legacyLocalStorageChats,
  };
};

export const buildRecoveryExportPayload = async (): Promise<RecoveryExportPayload> => {
  const state = useStore.getState();
  const liveStore = {
    available: true,
    data: {
      ...createPersistedChatDataState(state),
      folders: state.folders,
      evaluationSettings: state.evaluationSettings,
      evaluationResults: state.evaluationResults,
    },
  } satisfies RecoverySource<RecoveryExportPayload['sources']['liveStore']['data']>;

  let indexedDb: RecoveryExportPayload['sources']['indexedDb'];
  try {
    const snapshot = await collectIndexedDbRecoverySnapshot();
    indexedDb = snapshot
      ? { available: true, data: snapshot }
      : { available: false };
  } catch (error) {
    indexedDb = {
      available: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sources: {
      liveStore,
      ...(await readRecoveryLocalSources()),
      indexedDb,
    },
  };
};

export const getRecoveryExportFilename = () => `${getToday()}-recovery-export`;
