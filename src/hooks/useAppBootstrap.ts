import { useEffect, useState } from 'react';
import useStore, { type StoreState } from '@store/store';
import { showToast } from '@utils/showToast';
import i18n from '../i18n';
import { Theme } from '@type/theme';
import useInitialiseNewChat from './useInitialiseNewChat';
import {
  applyPersistedChatDataState,
  createPersistedChatDataState,
  setIndexedDbMigrationComplete,
  needsDataMigration,
} from '@store/persistence';
import {
  loadChatData,
  saveChatData,
  initCompressionScheduler,
  notifyActiveChatChanged,
  setChatDataWritesBlocked,
} from '@store/storage/IndexedDbStorage';
import { notifyStorageError } from '@store/storage/storageErrors';
import { registerSnapshotFlushCallback } from '@utils/streamingBuffer';
import { setRuntimeStoreGetter } from '@src/local-llm/runtime';

function setBootPhase(phase: string) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = phase;
}

const useAppBootstrap = () => {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const initialiseNewChat = useInitialiseNewChat();
  const setChats = useStore((state) => state.setChats);
  const setTheme = useStore((state) => state.setTheme);
  const setApiKey = useStore((state) => state.setApiKey);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);

  const showBootstrapWarning = (message: string) => {
    showToast(message, 'warning');
  };

  useEffect(() => {
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
    let saving = false;
    let pendingSave = false;
    let storageHealthy = false;

    // No chat-data write is allowed until IndexedDB has been loaded and
    // validated. This prevents a default empty store from overwriting data
    // after a startup read failure.
    setChatDataWritesBlocked(true);

    const flushChatDataSave = async () => {
      if (!storageHealthy) return;
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
      setBootPhase('rehydrating store');
      await useStore.persist.rehydrate();

      // Wire up local model runtime store access
      setRuntimeStoreGetter(() => useStore.getState());

      const persistedFolderCount = Object.keys(useStore.getState().folders).length;

      // Clean up legacy localStorage keys
      const legacyApiKey = localStorage.getItem('apiKey');

      if (legacyApiKey) {
        setApiKey(legacyApiKey);
        localStorage.removeItem('apiKey');
      }

      // Apply theme immediately after rehydration to avoid FOUC
      const rehydratedTheme = useStore.getState().theme;
      if (rehydratedTheme) {
        document.documentElement.className = rehydratedTheme;
        try { localStorage.setItem('theme', rehydratedTheme); } catch {}
      }

      // Load chat data from IndexedDB
      let indexedDbChatData = null;
      let indexedDbLoadFailed = false;
      let indexedDbLoadErrors: string[] = [];
      try {
        setBootPhase('loading chat data');
        indexedDbChatData = await loadChatData(useStore.getState());
      } catch (error) {
        indexedDbLoadFailed = true;
        indexedDbLoadErrors = [error instanceof Error ? error.message : String(error)];
        notifyStorageError(error);
      }
      if (cancelled) return;

      const indexedDbLoadDegraded = indexedDbChatData?.loadStatus === 'degraded';
      if (indexedDbLoadFailed || indexedDbLoadDegraded) {
        setChatDataWritesBlocked(true);
        useStore.getState().setMigrationUiState({
          visible: true,
          status: 'storage-recovery-required',
          details: indexedDbLoadDegraded
            ? indexedDbChatData?.errors
            : indexedDbLoadErrors,
        });
        if (indexedDbLoadDegraded) {
          indexedDbLoadFailed = true;
          showBootstrapWarning(
            i18n.t('storage.degradedChatData', {
              defaultValue:
                '会話データの一部を安全に復元できなかったため、上書きを停止しました。既存データは変更されていません。',
            })
          );
          console.error('[bootstrap] IndexedDB chat data is degraded', {
            missingChatIds: indexedDbChatData?.missingChatIds,
            errors: indexedDbChatData?.errors,
          });
        }
      } else if (indexedDbChatData) {
        setIndexedDbMigrationComplete(true);
        const nextState = { ...useStore.getState() };
        applyPersistedChatDataState(nextState, indexedDbChatData);
        useStore.setState({
          chats: nextState.chats,
          contentStore: nextState.contentStore,
          currentChatIndex: nextState.currentChatIndex,
        });
        setChatDataWritesBlocked(false);
        storageHealthy = true;
        if ((indexedDbChatData.repairedMissingContentHashes?.length ?? 0) > 0) {
          showBootstrapWarning(
            `${indexedDbChatData.repairedMissingContentHashes!.length}件の欠損した会話内容を復旧しました。元の内容が残っていない箇所は空として表示されます。`
          );
        }
      } else if (
        (useStore.getState().chats?.length ?? 0) > 0 ||
        Object.keys(useStore.getState().contentStore ?? {}).length > 0 ||
        useStore.getState().branchClipboard
      ) {
        // First launch with IndexedDB: move existing chat data to IndexedDB
        const chatDataState = createPersistedChatDataState(useStore.getState());
        try {
          setChatDataWritesBlocked(false);
          await saveChatData(chatDataState);
          setIndexedDbMigrationComplete(true);
          storageHealthy = true;
        } catch (error) {
          setChatDataWritesBlocked(true);
          useStore.getState().setMigrationUiState({
            visible: true,
            status: 'storage-recovery-required',
            details: [error instanceof Error ? error.message : String(error)],
          });
          notifyStorageError(error);
        }
      } else if (!indexedDbLoadFailed) {
        setIndexedDbMigrationComplete(true);
        setChatDataWritesBlocked(false);
        storageHealthy = true;
      }

      // Remove the legacy fallback only after a complete, validated load or a
      // confirmed migration. On degraded/failed loads it remains recoverable.
      if (storageHealthy) {
        localStorage.removeItem('chats');
        // A previous StrictMode/HMR bootstrap attempt may have failed before
        // this successful attempt completed. Do not leave a stale recovery
        // banner visible once the committed snapshot has loaded safely.
        if (
          useStore.getState().migrationUiState?.status ===
          'storage-recovery-required'
        ) {
          useStore.getState().setMigrationUiState(null);
        }
      }

      setBootPhase('finalizing');

      // Check if persisted data needs schema migration
      if (storageHealthy && needsDataMigration()) {
        useStore.getState().setMigrationUiState({
          visible: true,
          status: 'needs-export-import',
        });
      }

      const { chats, currentChatIndex } = useStore.getState();

      const missingChatDataWhileFoldersRemain =
        persistedFolderCount > 0 &&
        (!chats || chats.length === 0) &&
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

      if (!storageHealthy) return;

      // Register streaming snapshot flush callback only after validated load.
      registerSnapshotFlushCallback(() => void flushChatDataSave());

      // Initialize compression scheduler
      const activeChatId = useStore.getState().chats?.[useStore.getState().currentChatIndex]?.id;
      cleanupCompression = initCompressionScheduler(activeChatId);

      unsubscribe = useStore.subscribe((state, prev) => {
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
