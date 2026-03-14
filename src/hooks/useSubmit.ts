import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import { countTokens, limitMessageTokens, loadEncoder } from '@utils/messageUtils';
import { hasMeaningfulMessageContent } from '@utils/contentValidation';
import { getModelContextInfo } from '@utils/modelLookup';
import { fitsContextWindow, getPromptBudgetForContext } from '@utils/tokenBudget';
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
  const applyBranchState = useStore((state) => state.applyBranchState);
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

    const { updatedChats, messageIndex, targetNodeId, contentStore } = insertAssistantPlaceholder(
      chats,
      chatIndex,
      mode,
      useStore.getState().contentStore,
      insertIndex
    );
    applyBranchState(updatedChats, contentStore);

    const session = buildGeneratingSession(
      sessionId,
      chatId,
      chatIndex,
      messageIndex,
      targetNodeId,
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
      if (!hasMeaningfulMessageContent(contextMessages))
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const { contextLength: modelContextLength } = getModelContextInfo(
        chats[chatIndex].config.model,
        chats[chatIndex].config.providerId
      );
      const completionBudget = chats[chatIndex].config.max_tokens;
      const promptBudget = getPromptBudgetForContext(modelContextLength, completionBudget);
      const messages = await limitMessageTokens(
        contextMessages,
        promptBudget,
        chats[chatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      const promptTokens = await countTokens(messages, chats[chatIndex].config.model);
      if (!fitsContextWindow(promptTokens, modelContextLength, completionBudget))
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
        targetNodeId,
        messages,
        config: chats[chatIndex].config,
        resolvedProvider: resolved,
        abortController,
        apiVersion: useStore.getState().apiVersion,
        t: (key: string) => t(key) as string,
      });

      await applySubmitTokenUsage(chatId, targetNodeId);

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

    if (lastSubmitMode === 'append') {
      const chat = chats[currentChatIndex];
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg?.role === 'assistant') {
        useStore.getState().removeMessageAtIndex(currentChatIndex, chat.messages.length - 1);
      }
      setError('');
      handleSubmit();
    } else if (lastSubmitMode === 'midchat' && lastSubmitIndex !== null) {
      const chat = chats[currentChatIndex];
      const targetMsg = chat.messages[lastSubmitIndex];
      if (targetMsg?.role === 'assistant') {
        useStore.getState().removeMessageAtIndex(currentChatIndex, lastSubmitIndex);
      }
      setError('');
      handleSubmitMidChat(lastSubmitIndex);
    }
  };

  return { handleSubmit, handleSubmitMidChat, handleRetry, error };
};

export default useSubmit;
