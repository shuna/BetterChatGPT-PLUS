import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import {
  ChatInterface,
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import { getChatCompletion, getChatCompletionStream } from '@api/api';
import { parseEventSource } from '@api/helper';
import { limitMessageTokens, updateTotalTokenUsed, loadEncoder } from '@utils/messageUtils';
import { _defaultChatConfig } from '@constants/chat';
import { officialAPIEndpoint } from '@constants/auth';
import { modelStreamSupport } from '@constants/modelLoader';
import { FavoriteModel, ProviderConfig } from '@store/provider-slice';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { cloneChatAtIndex } from '@utils/chatShallowClone';

const useSubmit = () => {
  const { t, i18n } = useTranslation('api');
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const apiKey = useStore((state) => state.apiKey);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};
  const setGenerating = useStore((state) => state.setGenerating);
  const generating = useStore((state) => state.generating);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);

  // Resolve provider endpoint/apiKey for a model
  const resolveProvider = (modelId: string): { endpoint: string; key?: string } => {
    const fav = favoriteModels.find((f) => f.modelId === modelId);
    if (fav && providers[fav.providerId]) {
      const p = providers[fav.providerId];
      return { endpoint: p.endpoint, key: p.apiKey };
    }
    // Fallback to global settings
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
          resolved.endpoint,
          message,
          titleChatConfig,
          undefined,
          undefined,
          useStore.getState().apiVersion
        );
      } else {
        data = await getChatCompletion(
          resolved.endpoint,
          message,
          titleChatConfig,
          resolved.key,
          undefined,
          useStore.getState().apiVersion
        );
      }
    } catch (error: unknown) {
      throw new Error(
        `${t('errors.errorGeneratingTitle')}\n${(error as Error).message}`
      );
    }
    return data.choices[0].message.content;
  };

  const handleSubmit = async () => {
    const chats = useStore.getState().chats;
    if (generating || !chats) return;

    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    const assistantMessage: MessageInterface = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '',
        } as TextContentInterface,
      ],
    };
    updatedChats[currentChatIndex].messages.push(assistantMessage);
    upsertActivePathMessage(
      updatedChats[currentChatIndex],
      updatedChats[currentChatIndex].messages.length - 1,
      assistantMessage,
      useStore.getState().contentStore
    );

    setChats(updatedChats);
    setGenerating(true);

    try {
      const chatConfig = chats[currentChatIndex].config;
      const isStreamSupported =
        chatConfig.stream !== undefined
          ? chatConfig.stream
          : modelStreamSupport[chatConfig.model];
      let data;
      let stream;
      if (chats[currentChatIndex].messages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const messages = limitMessageTokens(
        chats[currentChatIndex].messages,
        chats[currentChatIndex].config.max_tokens,
        chats[currentChatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);
      const resolved = resolveProvider(chats[currentChatIndex].config.model);
      if (!isStreamSupported) {
        if (!resolved.key || resolved.key.length === 0) {
          if (resolved.endpoint === officialAPIEndpoint) {
            throw new Error(t('noApiKeyWarning') as string);
          }
          data = await getChatCompletion(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            undefined,
            undefined,
            useStore.getState().apiVersion
          );
        } else {
          data = await getChatCompletion(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            resolved.key,
            undefined,
            useStore.getState().apiVersion
          );
        }

        if (
          !data ||
          !data.choices ||
          !data.choices[0] ||
          !data.choices[0].message ||
          !data.choices[0].message.content
        ) {
          throw new Error(t('errors.failedToRetrieveData') as string);
        }

        const latestChats = useStore.getState().chats!;
        const updatedChats = cloneChatAtIndex(latestChats, currentChatIndex);
        const updatedMessages = updatedChats[currentChatIndex].messages;
        const oldMsg = updatedMessages[updatedMessages.length - 1];
        const newContent0 = { ...oldMsg.content[0] as TextContentInterface };
        newContent0.text += data.choices[0].message.content;
        const lastMsg = { ...oldMsg, content: [newContent0, ...oldMsg.content.slice(1)] };
        updatedMessages[updatedMessages.length - 1] = lastMsg;
        upsertActivePathMessage(
          updatedChats[currentChatIndex],
          updatedMessages.length - 1,
          lastMsg,
          useStore.getState().contentStore
        );
        setChats(updatedChats);
      } else {
        if (!resolved.key || resolved.key.length === 0) {
          if (resolved.endpoint === officialAPIEndpoint) {
            throw new Error(t('noApiKeyWarning') as string);
          }
          stream = await getChatCompletionStream(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            undefined,
            undefined,
            useStore.getState().apiVersion
          );
        } else {
          stream = await getChatCompletionStream(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            resolved.key,
            undefined,
            useStore.getState().apiVersion
          );
        }

        if (stream) {
          if (stream.locked)
            throw new Error(t('errors.streamLocked') as string);
          const reader = stream.getReader();
          let reading = true;
          let partial = '';
          const decoder = new TextDecoder();
          while (reading && useStore.getState().generating) {
            const { done, value } = await reader.read();
            const result = parseEventSource(
              partial + decoder.decode(value, { stream: true })
            );
            partial = '';

            if (result === '[DONE]' || done) {
              reading = false;
            } else {
              const resultString = result.reduce((output: string, curr) => {
                if (typeof curr === 'string') {
                  partial += curr;
                } else {
                  if (!curr.choices || !curr.choices[0] || !curr.choices[0].delta) {
                    // cover the case where we get some element which doesnt have text data, e.g. usage stats
                    return output;
                  }
                  const content = curr.choices[0]?.delta?.content ?? null;
                  if (content) output += content;
                }
                return output;
              }, '');

              const latestChats2 = useStore.getState().chats!;
              const updatedChats = cloneChatAtIndex(latestChats2, currentChatIndex);
              const updatedMessages = updatedChats[currentChatIndex].messages;
              const oldMsg = updatedMessages[updatedMessages.length - 1];
              const newContent0 = { ...oldMsg.content[0] as TextContentInterface };
              newContent0.text += resultString;
              const lastMsg = { ...oldMsg, content: [newContent0, ...oldMsg.content.slice(1)] };
              updatedMessages[updatedMessages.length - 1] = lastMsg;
              upsertActivePathMessage(
                updatedChats[currentChatIndex],
                updatedMessages.length - 1,
                lastMsg,
                useStore.getState().contentStore
              );
              setChats(updatedChats);
            }
          }
          if (useStore.getState().generating) {
            reader.cancel(t('errors.cancelledByUser') as string);
          } else {
            reader.cancel(t('errors.generationCompleted') as string);
          }
          reader.releaseLock();
          stream.cancel();
        }
      }

      // update tokens used in chatting
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;

      if (currChats && countTotalTokens) {
        const model = currChats[currentChatIndex].config.model;
        const messages = currChats[currentChatIndex].messages;
        updateTotalTokenUsed(
          model,
          messages.slice(0, -1),
          messages[messages.length - 1]
        );
      }

      // generate title for new chats
      if (
        useStore.getState().autoTitle &&
        currChats &&
        !currChats[currentChatIndex]?.titleSet
      ) {
        const messages_length = currChats[currentChatIndex].messages.length;
        const assistant_message =
          currChats[currentChatIndex].messages[messages_length - 1].content;
        const user_message =
          currChats[currentChatIndex].messages[messages_length - 2].content;

        const message: MessageInterface = {
          role: 'user',
          content: [
            ...user_message,
            ...assistant_message,
            {
              type: 'text',
              text: `Generate a title in less than 6 words for the conversation so far (language: ${i18n.language})`,
            } as TextContentInterface,
          ],
        };

        const titleChats = useStore.getState().chats!;
        const updatedChats = cloneChatAtIndex(titleChats, currentChatIndex);
        let title = (
          await generateTitle([message], updatedChats[currentChatIndex].config)
        ).trim();
        if (title.startsWith('"') && title.endsWith('"')) {
          title = title.slice(1, -1);
        }
        updatedChats[currentChatIndex].title = title;
        updatedChats[currentChatIndex].titleSet = true;
        setChats(updatedChats);

        // update tokens used for generating title
        if (countTotalTokens) {
          const model = _defaultChatConfig.model;
          updateTotalTokenUsed(model, [message], {
            role: 'assistant',
            content: [{ type: 'text', text: title } as TextContentInterface],
          });
        }
      }
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      setError(err);
    }
    setGenerating(false);
  };

  const handleSubmitMidChat = async (insertIndex: number) => {
    const chats = useStore.getState().chats;
    if (generating || !chats) return;

    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    const assistantMessage: MessageInterface = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '',
        } as TextContentInterface,
      ],
    };

    // Insert empty assistant message at the specified index
    updatedChats[currentChatIndex].messages.splice(insertIndex, 0, assistantMessage);
    upsertActivePathMessage(
      updatedChats[currentChatIndex],
      insertIndex,
      assistantMessage,
      useStore.getState().contentStore
    );

    setChats(updatedChats);
    setGenerating(true);

    try {
      let data;
      let stream;

      // Use only messages up to insertIndex (exclusive) as context
      const allMessages = updatedChats[currentChatIndex].messages;
      const contextMessages = allMessages.slice(0, insertIndex);

      if (contextMessages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      await loadEncoder();
      const messages = limitMessageTokens(
        contextMessages,
        chats[currentChatIndex].config.max_tokens,
        chats[currentChatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      const resolved = resolveProvider(chats[currentChatIndex].config.model);
      const midChatConfig = chats[currentChatIndex].config;
      const isStreamSupported =
        midChatConfig.stream !== undefined
          ? midChatConfig.stream
          : modelStreamSupport[midChatConfig.model];

      if (!isStreamSupported) {
        if (!resolved.key || resolved.key.length === 0) {
          if (resolved.endpoint === officialAPIEndpoint) {
            throw new Error(t('noApiKeyWarning') as string);
          }
          data = await getChatCompletion(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            undefined,
            undefined,
            useStore.getState().apiVersion
          );
        } else {
          data = await getChatCompletion(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            resolved.key,
            undefined,
            useStore.getState().apiVersion
          );
        }

        if (
          !data ||
          !data.choices ||
          !data.choices[0] ||
          !data.choices[0].message ||
          !data.choices[0].message.content
        ) {
          throw new Error(t('errors.failedToRetrieveData') as string);
        }

        const latestChats3 = useStore.getState().chats!;
        const updatedChats = cloneChatAtIndex(latestChats3, currentChatIndex);
        const updatedMessages = updatedChats[currentChatIndex].messages;
        const oldMsg3 = updatedMessages[insertIndex];
        const newContent03 = { ...oldMsg3.content[0] as TextContentInterface };
        newContent03.text += data.choices[0].message.content;
        const msg = { ...oldMsg3, content: [newContent03, ...oldMsg3.content.slice(1)] };
        updatedMessages[insertIndex] = msg;
        upsertActivePathMessage(
          updatedChats[currentChatIndex],
          insertIndex,
          msg,
          useStore.getState().contentStore
        );
        setChats(updatedChats);
      } else {
        if (!resolved.key || resolved.key.length === 0) {
          if (resolved.endpoint === officialAPIEndpoint) {
            throw new Error(t('noApiKeyWarning') as string);
          }
          stream = await getChatCompletionStream(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            undefined,
            undefined,
            useStore.getState().apiVersion
          );
        } else {
          stream = await getChatCompletionStream(
            resolved.endpoint,
            messages,
            chats[currentChatIndex].config,
            resolved.key,
            undefined,
            useStore.getState().apiVersion
          );
        }

        if (stream) {
          if (stream.locked)
            throw new Error(t('errors.streamLocked') as string);
          const reader = stream.getReader();
          let reading = true;
          let partial = '';
          const decoder = new TextDecoder();
          while (reading && useStore.getState().generating) {
            const { done, value } = await reader.read();
            const result = parseEventSource(
              partial + decoder.decode(value, { stream: true })
            );
            partial = '';

            if (result === '[DONE]' || done) {
              reading = false;
            } else {
              const resultString = result.reduce((output: string, curr) => {
                if (typeof curr === 'string') {
                  partial += curr;
                } else {
                  if (!curr.choices || !curr.choices[0] || !curr.choices[0].delta) {
                    return output;
                  }
                  const content = curr.choices[0]?.delta?.content ?? null;
                  if (content) output += content;
                }
                return output;
              }, '');

              const latestChats4 = useStore.getState().chats!;
              const updatedChats = cloneChatAtIndex(latestChats4, currentChatIndex);
              const updatedMessages = updatedChats[currentChatIndex].messages;
              const oldMsg4 = updatedMessages[insertIndex];
              const newContent04 = { ...oldMsg4.content[0] as TextContentInterface };
              newContent04.text += resultString;
              const msg = { ...oldMsg4, content: [newContent04, ...oldMsg4.content.slice(1)] };
              updatedMessages[insertIndex] = msg;
              upsertActivePathMessage(
                updatedChats[currentChatIndex],
                insertIndex,
                msg,
                useStore.getState().contentStore
              );
              setChats(updatedChats);
            }
          }
          if (useStore.getState().generating) {
            reader.cancel(t('errors.cancelledByUser') as string);
          } else {
            reader.cancel(t('errors.generationCompleted') as string);
          }
          reader.releaseLock();
          stream.cancel();
        }
      }

      // update tokens used
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;

      if (currChats && countTotalTokens) {
        const model = currChats[currentChatIndex].config.model;
        const msgs = currChats[currentChatIndex].messages;
        updateTotalTokenUsed(
          model,
          msgs.slice(0, insertIndex),
          msgs[insertIndex]
        );
      }
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      setError(err);
    }
    setGenerating(false);
  };

  return { handleSubmit, handleSubmitMidChat, error };
};

export default useSubmit;
