import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import { limitMessageTokens, loadEncoder } from '@utils/messageUtils';
import {
  applySubmitTokenUsage,
  buildGeneratingSession,
  getSubmitContextMessages,
  insertAssistantPlaceholder,
  maybeGenerateAutoTitle,
  resolveProviderForModel,
  SubmitMode,
  type ResolvedProvider,
} from './submitHelpers';
import {
  clearSubmitSessionRuntime,
  createSubmitAbortController,
  executeSubmitStream,
  isChatGenerating,
  stopSubmitSession,
  stopSubmitSessionsForChat,
} from './submitRuntime';

export function stopSession(sessionId: string) {
  stopSubmitSession(sessionId);
}

export function stopSessionsForChat(chatId: string) {
  stopSubmitSessionsForChat(chatId);
}

const useSubmit = () => {
  const { t, i18n } = useTranslation('api');
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const apiKey = useStore((state) => state.apiKey);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);
  const fallbackProvider: ResolvedProvider = { endpoint: apiEndpoint, key: apiKey };

  const runSubmit = async (mode: SubmitMode, insertIndex: number | null = null) => {
    const chats = useStore.getState().chats;
    if (!chats) return;

    const chatIndex = currentChatIndex;
    const chatId = chats[chatIndex]?.id;
    if (!chatId) return;

    // Same-chat guard
    if (isChatGenerating(chatId)) return;

    const sessionId = crypto.randomUUID();
    const abortController = createSubmitAbortController(sessionId);

    const { updatedChats, messageIndex } = insertAssistantPlaceholder(
      chats,
      chatIndex,
      mode,
      useStore.getState().contentStore,
      insertIndex
    );
    setChats(updatedChats);

    const session = buildGeneratingSession(
      sessionId,
      chatId,
      chatIndex,
      messageIndex,
      mode,
      mode === 'midchat' ? messageIndex : null
    );
    useStore.getState().addSession(session);
    useStore.getState().setLastSubmitContext(
      mode,
      mode === 'midchat' ? messageIndex : null,
      chatIndex,
      chatId
    );

    try {
      const contextMessages = getSubmitContextMessages(
        updatedChats[chatIndex].messages,
        mode,
        messageIndex,
        chats[chatIndex].config.model
      );

      if (contextMessages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const messages = await limitMessageTokens(
        contextMessages,
        chats[chatIndex].config.max_tokens,
        chats[chatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      const resolved = resolveProviderForModel(
        chats[chatIndex].config.model,
        favoriteModels,
        providers,
        fallbackProvider,
        chats[chatIndex].config.providerId
      );

      await executeSubmitStream({
        sessionId,
        chatId,
        chatIndex,
        messageIndex,
        messages,
        config: chats[chatIndex].config,
        resolvedProvider: resolved,
        abortController,
        apiVersion: useStore.getState().apiVersion,
        t: (key: string) => t(key) as string,
      });

      await applySubmitTokenUsage(chatId, messageIndex);

      if (mode === 'append') {
        await maybeGenerateAutoTitle({
          chatId,
          language: i18n.language,
          setChats,
          apiVersion: useStore.getState().apiVersion,
          titleModel: useStore.getState().titleModel,
          titleProviderId: useStore.getState().titleProviderId,
          t: (key: string) => t(key) as string,
          favoriteModels,
          providers,
          fallbackProvider,
        });
      }
      useStore.getState().setLastSubmitContext(null, null, null, null);
    } catch (e: unknown) {
      const err = (e as Error).message;
      setError(err);
    } finally {
      useStore.getState().removeSession(sessionId);
      clearSubmitSessionRuntime(sessionId);
    }
  };

  const handleSubmit = async () => {
    await runSubmit('append');
  };

  const handleSubmitMidChat = async (insertIndex: number) => {
    await runSubmit('midchat', insertIndex);
  };

  const handleRetry = async () => {
    const { lastSubmitMode, lastSubmitIndex, lastSubmitChatIndex, lastSubmitChatId } = useStore.getState();
    if (!lastSubmitMode || lastSubmitChatIndex === null || !lastSubmitChatId) return;

    if (currentChatIndex !== lastSubmitChatIndex) return;
    if (isChatGenerating(lastSubmitChatId)) return;

    const chats = useStore.getState().chats;
    if (!chats) return;

    const updatedChats = chats.slice();
    const chat = { ...chats[currentChatIndex], messages: [...chats[currentChatIndex].messages] };
    updatedChats[currentChatIndex] = chat;

    if (lastSubmitMode === 'append') {
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg?.role === 'assistant') {
        chat.messages.pop();
        setChats(updatedChats);
      }
      setError('');
      handleSubmit();
    } else if (lastSubmitMode === 'midchat' && lastSubmitIndex !== null) {
      const targetMsg = chat.messages[lastSubmitIndex];
      if (targetMsg?.role === 'assistant') {
        chat.messages.splice(lastSubmitIndex, 1);
        setChats(updatedChats);
      }
      setError('');
      handleSubmitMidChat(lastSubmitIndex);
    }
  };

  return { handleSubmit, handleSubmitMidChat, handleRetry, error };
};

export default useSubmit;
