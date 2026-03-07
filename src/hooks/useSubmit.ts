import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import {
  ConfigInterface,
  GeneratingSession,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import { getChatCompletion, getChatCompletionStream, prepareStreamRequest } from '@api/api';
import { parseEventSource } from '@api/helper';
import * as swBridge from '@utils/swBridge';
import { deleteRequest as deleteStreamRecord } from '@utils/streamDb';
import { limitMessageTokens, updateTotalTokenUsed, loadEncoder } from '@utils/messageUtils';
import { _defaultChatConfig } from '@constants/chat';
import { officialAPIEndpoint } from '@constants/auth';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { getEffectiveStreamEnabled } from '@utils/streamSupport';

// ── Runtime maps (NOT in store – non-serializable) ──
const abortControllers = new Map<string, AbortController>();
const swCancellers = new Map<string, () => void>();

export function stopSession(sessionId: string) {
  abortControllers.get(sessionId)?.abort();
  swCancellers.get(sessionId)?.();
  abortControllers.delete(sessionId);
  swCancellers.delete(sessionId);
  // Remove from store immediately so SW polling fallback can detect the stop
  useStore.getState().removeSession(sessionId);
}

export function stopSessionsForChat(chatId: string) {
  const sessions = useStore.getState().generatingSessions;
  Object.values(sessions)
    .filter((s) => s.chatId === chatId)
    .forEach((s) => stopSession(s.sessionId));
}

// ── Atomic chunk writer ──
function writeChunk(chatId: string, messageIndex: number, text: string) {
  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;
    const ci = chats.findIndex((c) => c.id === chatId);
    if (ci < 0) return state;
    const uc = cloneChatAtIndex(chats, ci);
    const msg = uc[ci].messages[messageIndex];
    if (!msg) return state;
    const text0 = msg.content[0] as TextContentInterface;
    const updated = { ...msg, content: [{ ...text0, text: text0.text + text }, ...msg.content.slice(1)] };
    uc[ci].messages[messageIndex] = updated;
    upsertActivePathMessage(uc[ci], messageIndex, updated, state.contentStore);
    return { ...state, chats: uc };
  });
}

// ── Helper: check if chat is already generating ──
function isChatGenerating(chatId: string): boolean {
  return Object.values(useStore.getState().generatingSessions).some(
    (s) => s.chatId === chatId
  );
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

  const resolveProvider = (modelId: string): { endpoint: string; key?: string } => {
    const fav = favoriteModels.find((f) => f.modelId === modelId);
    if (fav && providers[fav.providerId]) {
      const p = providers[fav.providerId];
      return { endpoint: p.endpoint, key: p.apiKey };
    }
    return { endpoint: apiEndpoint, key: apiKey };
  };

  const generateTitle = async (
    message: MessageInterface[],
    modelConfig: ConfigInterface
  ): Promise<string> => {
    let data;
    try {
      const titleModel = useStore.getState().titleModel ?? modelConfig.model;
      const titleChatConfig = { ...modelConfig, model: titleModel };
      const resolved = resolveProvider(titleModel);

      if (!resolved.key || resolved.key.length === 0) {
        if (resolved.endpoint === officialAPIEndpoint) {
          throw new Error(t('noApiKeyWarning') as string);
        }
        data = await getChatCompletion(
          resolved.endpoint, message, titleChatConfig, undefined, undefined,
          useStore.getState().apiVersion
        );
      } else {
        data = await getChatCompletion(
          resolved.endpoint, message, titleChatConfig, resolved.key, undefined,
          useStore.getState().apiVersion
        );
      }
    } catch (error: unknown) {
      throw new Error(`${t('errors.errorGeneratingTitle')}\n${(error as Error).message}`);
    }
    return data.choices[0].message.content;
  };

  // ── Stream execution (shared by append & midchat) ──
  const executeStream = async (
    sessionId: string,
    chatId: string,
    chatIndex: number,
    messageIndex: number,
    messages: MessageInterface[],
    config: ConfigInterface,
    resolved: { endpoint: string; key?: string },
    abortController: AbortController
  ) => {
    const isStreamSupported = getEffectiveStreamEnabled(config);

    if (!isStreamSupported) {
      // Non-streaming – pass AbortSignal so stopSession() can cancel the fetch
      let data;
      const signal = abortController.signal;
      if (!resolved.key || resolved.key.length === 0) {
        if (resolved.endpoint === officialAPIEndpoint) {
          throw new Error(t('noApiKeyWarning') as string);
        }
        data = await getChatCompletion(
          resolved.endpoint, messages, config, undefined, undefined,
          useStore.getState().apiVersion, signal
        );
      } else {
        data = await getChatCompletion(
          resolved.endpoint, messages, config, resolved.key, undefined,
          useStore.getState().apiVersion, signal
        );
      }

      // Guard: if session was stopped while awaiting, discard the result
      if (!useStore.getState().generatingSessions[sessionId]) return;

      if (!data?.choices?.[0]?.message?.content) {
        throw new Error(t('errors.failedToRetrieveData') as string);
      }

      writeChunk(chatId, messageIndex, data.choices[0].message.content);
      return;
    }

    // Streaming
    if (!resolved.key || resolved.key.length === 0) {
      if (resolved.endpoint === officialAPIEndpoint) {
        throw new Error(t('noApiKeyWarning') as string);
      }
    }

    const onChunk = (text: string) => {
      if (text) writeChunk(chatId, messageIndex, text);
    };

    if (await swBridge.waitForController()) {
      // ── Service Worker path ──
      const requestId = crypto.randomUUID();
      const prepared = prepareStreamRequest(
        resolved.endpoint, messages, config, resolved.key, undefined,
        useStore.getState().apiVersion
      );

      await new Promise<void>((resolve, reject) => {
        let swHandle: swBridge.SwStreamHandle;

        // Fallback polling: if stopSession was called before swHandle resolved
        const checkStop = setInterval(() => {
          if (!useStore.getState().generatingSessions[sessionId]) {
            swHandle?.cancel();
            clearInterval(checkStop);
            deleteStreamRecord(requestId).catch(() => {});
            resolve();
          }
        }, 500);

        swBridge.startStream({
          requestId,
          endpoint: prepared.endpoint,
          headers: prepared.headers,
          body: prepared.body,
          chatIndex,
          messageIndex,
          onChunk,
          onDone: () => {
            clearInterval(checkStop);
            deleteStreamRecord(requestId).catch(() => {});
            resolve();
          },
          onError: (error) => {
            clearInterval(checkStop);
            deleteStreamRecord(requestId).catch(() => {});
            reject(new Error(error));
          },
        }).then((handle) => {
          swHandle = handle;
          swCancellers.set(sessionId, () => handle.cancel());
        }).catch((err) => {
          clearInterval(checkStop);
          deleteStreamRecord(requestId).catch(() => {});
          reject(err);
        });
      });
    } else {
      // ── Direct fetch path ──
      const stream = await getChatCompletionStream(
        resolved.endpoint, messages, config,
        resolved.key || undefined, undefined,
        useStore.getState().apiVersion,
        abortController.signal
      );

      if (stream) {
        if (stream.locked) throw new Error(t('errors.streamLocked') as string);
        const reader = stream.getReader();
        let reading = true;
        let partial = '';
        const decoder = new TextDecoder();

        try {
          while (reading && !abortController.signal.aborted) {
            const { done, value } = await reader.read();
            const chunk = partial + decoder.decode(value, { stream: !done });
            const parsed = parseEventSource(chunk, done);
            partial = parsed.partial;

            if (parsed.done || done) reading = false;

            const resultString = parsed.events.reduce((output: string, curr) => {
              if (!curr.choices?.[0]?.delta) return output;
              const content = curr.choices[0]?.delta?.content ?? null;
              if (content) output += content;
              return output;
            }, '');

            if (resultString) onChunk(resultString);
          }
        } finally {
          if (!abortController.signal.aborted) {
            reader.cancel(t('errors.generationCompleted') as string);
          } else {
            reader.cancel(t('errors.cancelledByUser') as string);
          }
          reader.releaseLock();
          stream.cancel();
        }
      }
    }
  };

  const handleSubmit = async () => {
    const chats = useStore.getState().chats;
    if (!chats) return;

    const chatIndex = currentChatIndex;
    const chatId = chats[chatIndex]?.id;
    if (!chatId) return;

    // Same-chat guard
    if (isChatGenerating(chatId)) return;

    const sessionId = crypto.randomUUID();
    const abortController = new AbortController();
    abortControllers.set(sessionId, abortController);

    const updatedChats = cloneChatAtIndex(chats, chatIndex);
    const assistantMessage: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'text', text: '' } as TextContentInterface],
    };
    updatedChats[chatIndex].messages.push(assistantMessage);
    const messageIndex = updatedChats[chatIndex].messages.length - 1;
    upsertActivePathMessage(
      updatedChats[chatIndex], messageIndex, assistantMessage,
      useStore.getState().contentStore
    );
    setChats(updatedChats);

    const session: GeneratingSession = {
      sessionId, chatId, chatIndex, messageIndex,
      mode: 'append', insertIndex: null,
      requestPath: 'sw', startedAt: Date.now(),
    };
    useStore.getState().addSession(session);
    useStore.getState().setLastSubmitContext('append', null, chatIndex, chatId);

    try {
      if (chats[chatIndex].messages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const messages = limitMessageTokens(
        chats[chatIndex].messages,
        chats[chatIndex].config.max_tokens,
        chats[chatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      const resolved = resolveProvider(chats[chatIndex].config.model);

      await executeStream(
        sessionId, chatId, chatIndex, messageIndex,
        messages, chats[chatIndex].config, resolved, abortController
      );

      // Token accounting
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;
      if (currChats && countTotalTokens) {
        const ci = currChats.findIndex((c) => c.id === chatId);
        if (ci >= 0) {
          const model = currChats[ci].config.model;
          const msgs = currChats[ci].messages;
          updateTotalTokenUsed(model, msgs.slice(0, -1), msgs[msgs.length - 1]);
        }
      }

      // Auto title
      if (useStore.getState().autoTitle) {
        const currChats2 = useStore.getState().chats;
        if (currChats2) {
          const ci = currChats2.findIndex((c) => c.id === chatId);
          if (ci >= 0 && !currChats2[ci]?.titleSet) {
            const msgs = currChats2[ci].messages;
            const messages_length = msgs.length;
            const assistant_message = msgs[messages_length - 1].content;
            const user_message = msgs[messages_length - 2].content;

            const message: MessageInterface = {
              role: 'user',
              content: [
                ...user_message, ...assistant_message,
                { type: 'text', text: `Generate a title in less than 6 words for the conversation so far (language: ${i18n.language})` } as TextContentInterface,
              ],
            };

            const titleChats = useStore.getState().chats!;
            const tci = titleChats.findIndex((c) => c.id === chatId);
            if (tci >= 0) {
              const uc = cloneChatAtIndex(titleChats, tci);
              let title = (await generateTitle([message], uc[tci].config)).trim();
              if (title.startsWith('"') && title.endsWith('"')) title = title.slice(1, -1);
              uc[tci].title = title;
              uc[tci].titleSet = true;
              setChats(uc);

              if (countTotalTokens) {
                const model = _defaultChatConfig.model;
                updateTotalTokenUsed(model, [message], {
                  role: 'assistant',
                  content: [{ type: 'text', text: title } as TextContentInterface],
                });
              }
            }
          }
        }
      }
      useStore.getState().setLastSubmitContext(null, null, null, null);
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      setError(err);
    } finally {
      useStore.getState().removeSession(sessionId);
      abortControllers.delete(sessionId);
      swCancellers.delete(sessionId);
    }
  };

  const handleSubmitMidChat = async (insertIndex: number) => {
    const chats = useStore.getState().chats;
    if (!chats) return;

    const chatIndex = currentChatIndex;
    const chatId = chats[chatIndex]?.id;
    if (!chatId) return;

    if (isChatGenerating(chatId)) return;

    const sessionId = crypto.randomUUID();
    const abortController = new AbortController();
    abortControllers.set(sessionId, abortController);

    const updatedChats = cloneChatAtIndex(chats, chatIndex);
    const assistantMessage: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'text', text: '' } as TextContentInterface],
    };
    updatedChats[chatIndex].messages.splice(insertIndex, 0, assistantMessage);
    upsertActivePathMessage(
      updatedChats[chatIndex], insertIndex, assistantMessage,
      useStore.getState().contentStore
    );
    setChats(updatedChats);

    const session: GeneratingSession = {
      sessionId, chatId, chatIndex, messageIndex: insertIndex,
      mode: 'midchat', insertIndex,
      requestPath: 'sw', startedAt: Date.now(),
    };
    useStore.getState().addSession(session);
    useStore.getState().setLastSubmitContext('midchat', insertIndex, chatIndex, chatId);

    try {
      const allMessages = updatedChats[chatIndex].messages;
      const contextMessages = allMessages.slice(0, insertIndex);

      if (contextMessages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const messages = limitMessageTokens(
        contextMessages,
        chats[chatIndex].config.max_tokens,
        chats[chatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      const resolved = resolveProvider(chats[chatIndex].config.model);

      await executeStream(
        sessionId, chatId, chatIndex, insertIndex,
        messages, chats[chatIndex].config, resolved, abortController
      );

      // Token accounting
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;
      if (currChats && countTotalTokens) {
        const ci = currChats.findIndex((c) => c.id === chatId);
        if (ci >= 0) {
          const model = currChats[ci].config.model;
          const msgs = currChats[ci].messages;
          updateTotalTokenUsed(model, msgs.slice(0, insertIndex), msgs[insertIndex]);
        }
      }
      useStore.getState().setLastSubmitContext(null, null, null, null);
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      setError(err);
    } finally {
      useStore.getState().removeSession(sessionId);
      abortControllers.delete(sessionId);
      swCancellers.delete(sessionId);
    }
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
