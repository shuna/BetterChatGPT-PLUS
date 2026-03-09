import { useEffect } from 'react';
import useStore from '@store/store';
import i18n from '../i18n';
import { ChatInterface } from '@type/chat';
import { Theme } from '@type/theme';
import useInitialiseNewChat from './useInitialiseNewChat';

const useAppBootstrap = () => {
  const initialiseNewChat = useInitialiseNewChat();
  const setChats = useStore((state) => state.setChats);
  const setTheme = useStore((state) => state.setTheme);
  const setApiKey = useStore((state) => state.setApiKey);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);

  useEffect(() => {
    // Auto-open provider menu if no favorites and no provider custom models
    const { favoriteModels, providerCustomModels, setShowProviderMenu } = useStore.getState();
    const hasCustomModels = Object.values(providerCustomModels).some((m) => m && m.length > 0);
    if ((!favoriteModels || favoriteModels.length === 0) && !hasCustomModels) {
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

    if (oldChats) {
      try {
        const chats: ChatInterface[] = JSON.parse(oldChats);
        if (chats.length > 0) {
          setChats(chats);
          setCurrentChatIndex(0);
        } else {
          initialiseNewChat();
        }
      } catch {
        initialiseNewChat();
      }
      localStorage.removeItem('chats');
      return;
    }

    const { chats, currentChatIndex } = useStore.getState();
    if (!chats || chats.length === 0) {
      initialiseNewChat();
      return;
    }
    if (!(currentChatIndex >= 0 && currentChatIndex < chats.length)) {
      setCurrentChatIndex(0);
    }
  }, [initialiseNewChat, setApiKey, setChats, setCurrentChatIndex, setTheme]);
};

export default useAppBootstrap;
