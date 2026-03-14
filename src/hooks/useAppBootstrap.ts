import { useEffect, useState } from 'react';
import useStore from '@store/store';
import i18n from '../i18n';
import { ChatInterface } from '@type/chat';
import { Theme } from '@type/theme';
import useInitialiseNewChat from './useInitialiseNewChat';
import {
  applyPersistedChatDataState,
  createPersistedChatDataState,
} from '@store/persistence';
import { loadChatData, saveChatData } from '@store/storage/IndexedDbStorage';
import { notifyStorageError } from '@store/storage/storageErrors';

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

    const flushChatDataSave = async () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveTimer = undefined;
      }

      try {
        await saveChatData(createPersistedChatDataState(useStore.getState()));
      } catch (error) {
        notifyStorageError(error);
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

      if (indexedDbChatData?.chats || indexedDbChatData?.contentStore) {
        const nextState = { ...useStore.getState() };
        applyPersistedChatDataState(nextState, indexedDbChatData);
        useStore.setState({
          chats: nextState.chats,
          contentStore: nextState.contentStore,
          currentChatIndex: nextState.currentChatIndex,
        });
      } else if (
        useStore.getState().chats ||
        Object.keys(useStore.getState().contentStore ?? {}).length > 0 ||
        useStore.getState().branchClipboard
      ) {
        // First launch after introducing IndexedDB: migrate any existing chat payloads
        // from localStorage-backed zustand state into IndexedDB and keep localStorage slim.
        try {
          await saveChatData(createPersistedChatDataState(useStore.getState()));
        } catch (error) {
          notifyStorageError(error);
        }
      } else if (legacyChats && legacyChats.length > 0) {
        setChats(legacyChats);
        setCurrentChatIndex(0);
        useStore.setState({ contentStore: {} });
        try {
          await saveChatData(createPersistedChatDataState(useStore.getState()));
        } catch (error) {
          notifyStorageError(error);
        }
      }

      localStorage.removeItem('chats');

      const { chats, currentChatIndex } = useStore.getState();
      const missingChatDataWhileFoldersRemain =
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

      unsubscribe = useStore.subscribe((state, prev) => {
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
      unsubscribe?.();
    };
  }, [initialiseNewChat, setApiKey, setChats, setCurrentChatIndex, setTheme]);

  return isBootstrapped;
};

export default useAppBootstrap;
