import { useEffect, useState } from 'react';
import useStore, { type StoreState } from '@store/store';
import i18n from '../i18n';
import { ChatInterface } from '@type/chat';
import { Theme } from '@type/theme';
import useInitialiseNewChat from './useInitialiseNewChat';
import {
  applyPersistedChatDataState,
  createPersistedChatDataState,
  setIndexedDbMigrationComplete,
  type PersistedChatData,
} from '@store/persistence';
import { STORE_VERSION } from '@store/version';
import {
  loadChatData,
  saveChatData,
  initCompressionScheduler,
  notifyActiveChatChanged,
  loadMigrationMeta,
  resumeLargeMigration,
  setMigrationInProgress,
  isMigrationInProgress,
  beginLargeMigration,
  estimatePersistedPayloadSize,
  LARGE_MIGRATION_THRESHOLD,
} from '@store/storage/IndexedDbStorage';
import type { MigrationMetaRecord } from '@store/storage/IndexedDbStorage';
import { notifyStorageError } from '@store/storage/storageErrors';

function migMetaToUiState(meta: MigrationMetaRecord) {
  const status = meta.status === 'idle' || meta.status === 'done' ? 'done' : meta.status;
  return {
    visible: status !== 'done',
    status: status as 'running' | 'finalizing' | 'failed' | 'done',
    progress: meta.totalChats > 0 ? meta.migratedChats / meta.totalChats : 0,
    migratedChats: meta.migratedChats,
    totalChats: meta.totalChats,
    sourceSizeBytes: meta.sourceSizeBytes,
    currentPhase: meta.status === 'finalizing' ? 'finalizing' as const : 'migrating-chats' as const,
    resumable: meta.status === 'failed',
    lastError: meta.lastError,
  };
}

export function resumeLargeMigrationInBackground(baseState: StoreState) {
  resumeLargeMigration(baseState, (meta) => {
    useStore.getState().setMigrationUiState(migMetaToUiState(meta));
  }).then((result) => {
    setMigrationInProgress(false);
    setIndexedDbMigrationComplete(true);
    if (result) {
      // Apply migrated data to store
      const nextState = { ...useStore.getState() };
      applyPersistedChatDataState(nextState, result);
      useStore.setState({
        chats: nextState.chats,
        contentStore: nextState.contentStore,
        currentChatIndex: nextState.currentChatIndex,
      });
      // Now safe to start compression scheduler
      const activeChatId = nextState.chats?.[nextState.currentChatIndex]?.id;
      initCompressionScheduler(activeChatId);
    }
    useStore.getState().setMigrationUiState({
      visible: false,
      status: 'done',
      progress: 1,
      migratedChats: 0,
      totalChats: 0,
      sourceSizeBytes: 0,
      currentPhase: 'finalizing',
      resumable: false,
    });
  }).catch((e) => {
    setMigrationInProgress(false);
    console.error('[Migration] Background migration failed', e);
  });
}

const useAppBootstrap = () => {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const initialiseNewChat = useInitialiseNewChat();
  const setChats = useStore((state) => state.setChats);
  const setTheme = useStore((state) => state.setTheme);
  const setApiKey = useStore((state) => state.setApiKey);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);

  const showBootstrapWarning = (message: string) => {
    const store = useStore.getState();
    store.setToastStatus('warning');
    store.setToastMessage(message);
    store.setToastShow(true);
  };

  useEffect(() => {
    // Auto-open provider menu if no favorites and no provider custom models
    // (only if onboarding is already completed — otherwise the onboarding flow handles it)
    const { favoriteModels, providerCustomModels, setShowProviderMenu, onboardingCompleted } = useStore.getState();
    const hasCustomModels = Object.values(providerCustomModels).some((m) => m && m.length > 0);
    if (onboardingCompleted && (!favoriteModels || favoriteModels.length === 0) && !hasCustomModels) {
      setShowProviderMenu(true);
    }

    document.documentElement.lang = i18n.language;

    const handleLanguageChanged = (language: string) => {
      document.documentElement.lang = language;
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let saveTimer: number | undefined;
    let unsubscribe: (() => void) | undefined;
    let cleanupCompression: (() => void) | undefined;
    let migrationStarted = false;
    let saving = false;
    let pendingSave = false;

    const flushChatDataSave = async () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveTimer = undefined;
      }

      if (saving) {
        pendingSave = true;
        return;
      }

      saving = true;
      try {
        while (true) {
          pendingSave = false;
          try {
            await saveChatData(createPersistedChatDataState(useStore.getState()));
          } catch (error) {
            notifyStorageError(error);
          }
          if (!pendingSave) break;
        }
      } finally {
        saving = false;
      }
    };

    const queueChatDataSave = () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(async () => {
        saveTimer = undefined;
        await flushChatDataSave();
      }, 500);
    };

    const handleVisibilityFlush = () => {
      if (document.visibilityState === 'hidden') {
        void flushChatDataSave();
      }
    };

    const handlePageHide = () => {
      void flushChatDataSave();
    };

    const bootstrap = async () => {
      await useStore.persist.rehydrate();

      const persistedFolderCount = Object.keys(useStore.getState().folders).length;

      const oldChats = localStorage.getItem('chats');
      const legacyApiKey = localStorage.getItem('apiKey');
      const legacyTheme = localStorage.getItem('theme');

      if (legacyApiKey) {
        setApiKey(legacyApiKey);
        localStorage.removeItem('apiKey');
      }

      if (legacyTheme) {
        setTheme(legacyTheme as Theme);
        localStorage.removeItem('theme');
      }

      let legacyChats: ChatInterface[] | null = null;
      if (oldChats) {
        try {
          legacyChats = JSON.parse(oldChats) as ChatInterface[];
        } catch {
          legacyChats = null;
        }
      }

      let indexedDbChatData = null;
      let indexedDbLoadFailed = false;
      try {
        indexedDbChatData = await loadChatData(useStore.getState());
      } catch (error) {
        indexedDbLoadFailed = true;
        notifyStorageError(error);
      }
      if (cancelled) return;

      if (
        (indexedDbChatData?.chats && indexedDbChatData.chats.length > 0) ||
        (indexedDbChatData?.contentStore && Object.keys(indexedDbChatData.contentStore).length > 0)
      ) {
        const nextState = { ...useStore.getState() };
        applyPersistedChatDataState(nextState, indexedDbChatData);
        useStore.setState({
          chats: nextState.chats,
          contentStore: nextState.contentStore,
          currentChatIndex: nextState.currentChatIndex,
        });
        // IndexedDB already has authoritative data — safe to strip chats from localStorage
        setIndexedDbMigrationComplete(true);
      } else if (
        !isMigrationInProgress() && (
          useStore.getState().chats ||
          Object.keys(useStore.getState().contentStore ?? {}).length > 0 ||
          useStore.getState().branchClipboard
        )
      ) {
        // First launch after introducing IndexedDB: migrate any existing chat payloads
        // from localStorage-backed zustand state into IndexedDB and keep localStorage slim.
        const chatDataState = createPersistedChatDataState(useStore.getState());
        const payloadSize = estimatePersistedPayloadSize(chatDataState);
        try {
          if (payloadSize >= LARGE_MIGRATION_THRESHOLD) {
            await beginLargeMigration(chatDataState, STORE_VERSION, 'localStorage');
            migrationStarted = true;
            setMigrationInProgress(true);
            // Do NOT set migrationComplete yet — chats must stay in localStorage
            // until resumeLargeMigration finishes and applies data to store.
          } else {
            await saveChatData(chatDataState);
            // IndexedDB write succeeded — safe to strip chats from localStorage
            setIndexedDbMigrationComplete(true);
          }
        } catch (error) {
          notifyStorageError(error);
          // Do NOT set migrationComplete — keep chats in localStorage as safety net
        }
      } else if (legacyChats && legacyChats.length > 0) {
        // Check if localStorage chats are large enough for background migration
        const lsPayload: PersistedChatData = { chats: legacyChats, contentStore: {}, branchClipboard: null };
        const lsSize = estimatePersistedPayloadSize(lsPayload);
        if (lsSize >= LARGE_MIGRATION_THRESHOLD) {
          // Defer to background migration
          try {
            await beginLargeMigration(lsPayload, STORE_VERSION, 'localStorage');
            migrationStarted = true;
            setMigrationInProgress(true);
            setIndexedDbMigrationComplete(true);
          } catch (error) {
            notifyStorageError(error);
            // Fallback: immediate save
            setChats(legacyChats);
            setCurrentChatIndex(0);
            useStore.setState({ contentStore: {} });
            try {
              await saveChatData(createPersistedChatDataState(useStore.getState()));
              setIndexedDbMigrationComplete(true);
            } catch (err) {
              notifyStorageError(err);
            }
          }
        } else {
          setChats(legacyChats);
          setCurrentChatIndex(0);
          useStore.setState({ contentStore: {} });
          try {
            await saveChatData(createPersistedChatDataState(useStore.getState()));
            setIndexedDbMigrationComplete(true);
          } catch (error) {
            notifyStorageError(error);
          }
        }
      } else {
        // No chat data anywhere — safe to strip (nothing to lose)
        setIndexedDbMigrationComplete(true);
      }

      localStorage.removeItem('chats');

      const { chats, currentChatIndex } = useStore.getState();
      const largeMigrationRunning = migrationStarted || isMigrationInProgress();
      const missingChatDataWhileFoldersRemain =
        !largeMigrationRunning &&
        persistedFolderCount > 0 &&
        (!chats || chats.length === 0) &&
        !(legacyChats && legacyChats.length > 0) &&
        !indexedDbChatData?.chats?.length;

      if (missingChatDataWhileFoldersRemain) {
        showBootstrapWarning(
          indexedDbLoadFailed
            ? i18n.t('storage.folderOnlyWarningLoadFailed', {
                defaultValue:
                  'フォルダは復元されましたが、会話データの読み込みに失敗しました。モバイルブラウザの保存制限が原因の可能性があります。',
              })
            : i18n.t('storage.folderOnlyWarningMissingChats', {
                defaultValue:
                  'フォルダは復元されましたが、会話データが見つかりませんでした。保存状態が不整合になっている可能性があります。',
              })
        );
      }

      if (!chats || chats.length === 0) {
        initialiseNewChat();
      } else if (!(currentChatIndex >= 0 && currentChatIndex < chats.length)) {
        setCurrentChatIndex(0);
      }
      if (!cancelled) {
        setIsBootstrapped(true);
      }

      // Check for in-progress large migration
      const migMeta = await loadMigrationMeta();
      if (migMeta && (migMeta.status === 'running' || migMeta.status === 'finalizing' || migMeta.status === 'failed')) {
        setMigrationInProgress(true);

        // Show initial migration UI state
        const initialUiState = migMetaToUiState(migMeta);
        useStore.getState().setMigrationUiState(initialUiState);

        if (migMeta.status === 'failed') {
          // Show failed state, user can retry via banner
        } else {
          // Resume migration in background
          resumeLargeMigrationInBackground(useStore.getState());
        }
      }

      // Initialize compression scheduler (skips if migration in progress)
      const activeChatId = useStore.getState().chats?.[useStore.getState().currentChatIndex]?.id;
      cleanupCompression = initCompressionScheduler(activeChatId);

      unsubscribe = useStore.subscribe((state, prev) => {
        // Track active chat changes for compression scheduler
        if (state.currentChatIndex !== prev.currentChatIndex || state.chats !== prev.chats) {
          const newActiveChatId = state.chats?.[state.currentChatIndex]?.id;
          if (newActiveChatId !== prev.chats?.[prev.currentChatIndex]?.id) {
            notifyActiveChatChanged(newActiveChatId);
          }
        }

        if (
          state.chats === prev.chats &&
          state.contentStore === prev.contentStore &&
          state.branchClipboard === prev.branchClipboard
        ) {
          return;
        }
        queueChatDataSave();
      });

    };

    document.addEventListener('visibilitychange', handleVisibilityFlush);
    window.addEventListener('pagehide', handlePageHide);
    bootstrap().catch((error) => {
      notifyStorageError(error);
      if (!cancelled) {
        setIsBootstrapped(true);
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityFlush);
      window.removeEventListener('pagehide', handlePageHide);
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
      cleanupCompression?.();
      unsubscribe?.();
    };
  }, [initialiseNewChat, setApiKey, setChats, setCurrentChatIndex, setTheme]);

  return isBootstrapped;
};

export default useAppBootstrap;
