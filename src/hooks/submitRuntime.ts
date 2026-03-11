import useStore from '@store/store';
import {
  getChatCompletion,
  getChatCompletionStream,
  prepareStreamRequest,
} from '@api/api';
import { parseEventSource } from '@api/helper';
import { officialAPIEndpoint } from '@constants/auth';
import { cloneChatAt } from '@store/branch-domain';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { materializeActivePath } from '@utils/branchUtils';
import { addContent, releaseContent, resolveContent } from '@utils/contentStore';
import { deleteRequest as deleteStreamRecord } from '@utils/streamDb';
import { getEffectiveStreamEnabled } from '@utils/streamSupport';
import * as swBridge from '@utils/swBridge';
import {
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
  isTextContent,
} from '@type/chat';
import type { ResolvedProvider } from './submitHelpers';

const abortControllers = new Map<string, AbortController>();
const swCancellers = new Map<string, () => void>();
const SYSTEM_MESSAGE_UNSUPPORTED_PATTERNS = [
  /does not support.*system/i,
  /system.*not supported/i,
  /unsupported.*system/i,
  /messages?\[\d+\]\.role.*system/i,
  /developer.*message.*not supported/i,
];

const hasSystemMessages = (messages: MessageInterface[]): boolean =>
  messages.some((message) => message.role === 'system');

const removeSystemMessages = (
  messages: MessageInterface[]
): MessageInterface[] => messages.filter((message) => message.role !== 'system');

const shouldRetryWithoutSystemMessages = (
  error: unknown,
  messages: MessageInterface[]
): boolean => {
  if (!hasSystemMessages(messages)) return false;
  const message = error instanceof Error ? error.message : String(error);
  return SYSTEM_MESSAGE_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(message));
};

export const createSubmitAbortController = (sessionId: string) => {
  const abortController = new AbortController();
  abortControllers.set(sessionId, abortController);
  return abortController;
};

export const clearSubmitSessionRuntime = (sessionId: string) => {
  abortControllers.delete(sessionId);
  swCancellers.delete(sessionId);
};

export const stopSubmitSession = (sessionId: string) => {
  abortControllers.get(sessionId)?.abort();
  swCancellers.get(sessionId)?.();
  clearSubmitSessionRuntime(sessionId);
  useStore.getState().removeSession(sessionId);
};

export const stopSubmitSessionsForChat = (chatId: string) => {
  const sessions = useStore.getState().generatingSessions;
  Object.values(sessions)
    .filter((session) => session.chatId === chatId)
    .forEach((session) => stopSubmitSession(session.sessionId));
};

export const isChatGenerating = (chatId: string): boolean =>
  Object.values(useStore.getState().generatingSessions).some(
    (session) => session.chatId === chatId
  );

export const writeChunkToStore = (
  chatId: string,
  targetNodeId: string,
  text: string
) => {
  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;

    const chatIndex = chats.findIndex((chat) => chat.id === chatId);
    if (chatIndex < 0) return state;

    const updatedChats = cloneChatAt(chats, chatIndex);
    const updatedContentStore = { ...state.contentStore };
    const updatedChat = updatedChats[chatIndex];
    const tree = updatedChat.branchTree;

    if (tree?.nodes[targetNodeId]) {
      const node = tree.nodes[targetNodeId];
      const currentContent = resolveContent(updatedContentStore, node.contentHash);
      const currentText = isTextContent(currentContent[0]) ? currentContent[0].text : '';
      const nextContent = [
        { type: 'text', text: currentText + text } as TextContentInterface,
        ...currentContent.slice(1),
      ];

      releaseContent(updatedContentStore, node.contentHash);
      tree.nodes[targetNodeId] = {
        ...node,
        contentHash: addContent(updatedContentStore, nextContent),
      };

      if (tree.activePath.includes(targetNodeId)) {
        updatedChat.messages = materializeActivePath(tree, updatedContentStore);
      }

      return {
        ...state,
        chats: updatedChats,
        contentStore: updatedContentStore,
      };
    }

    const messageIndex = updatedChat.messages.findIndex(
      (_, index) => updatedChat.branchTree?.activePath?.[index] === targetNodeId
    );
    const message = messageIndex >= 0 ? updatedChat.messages[messageIndex] : undefined;
    if (!message) return state;

    const textContent = message.content[0] as TextContentInterface;
    const updatedMessage = {
      ...message,
      content: [
        { ...textContent, text: textContent.text + text },
        ...message.content.slice(1),
      ],
    };

    updatedChat.messages[messageIndex] = updatedMessage;
    upsertActivePathMessage(updatedChat, messageIndex, updatedMessage, updatedContentStore);

    return {
      ...state,
      chats: updatedChats,
      contentStore: updatedContentStore,
    };
  });
};

type ExecuteSubmitStreamParams = {
  sessionId: string;
  chatId: string;
  chatIndex: number;
  messageIndex: number;
  targetNodeId: string;
  messages: MessageInterface[];
  config: ConfigInterface;
  resolvedProvider: ResolvedProvider;
  abortController: AbortController;
  apiVersion?: string;
  t: (key: string) => string;
};

export const executeSubmitStream = async ({
  sessionId,
  chatId,
  chatIndex,
  messageIndex,
  targetNodeId,
  messages,
  config,
  resolvedProvider,
  abortController,
  apiVersion,
  t,
}: ExecuteSubmitStreamParams) => {
  const isStreamSupported = getEffectiveStreamEnabled(config);
  const runRequest = async (requestMessages: MessageInterface[]) => {
    if (!isStreamSupported) {
      let data;
      const signal = abortController.signal;

      if (!resolvedProvider.key || resolvedProvider.key.length === 0) {
        if (resolvedProvider.endpoint === officialAPIEndpoint) {
          throw new Error(t('noApiKeyWarning'));
        }
        data = await getChatCompletion(
          resolvedProvider.endpoint,
          requestMessages,
          config,
          undefined,
          undefined,
          apiVersion,
          signal
        );
      } else {
        data = await getChatCompletion(
          resolvedProvider.endpoint,
          requestMessages,
          config,
          resolvedProvider.key,
          undefined,
          apiVersion,
          signal
        );
      }

      if (!useStore.getState().generatingSessions[sessionId]) return;
      if (!data?.choices?.[0]?.message?.content) {
        throw new Error(t('errors.failedToRetrieveData'));
      }

      writeChunkToStore(chatId, targetNodeId, data.choices[0].message.content);
      return;
    }

    if (
      (!resolvedProvider.key || resolvedProvider.key.length === 0) &&
      resolvedProvider.endpoint === officialAPIEndpoint
    ) {
      throw new Error(t('noApiKeyWarning'));
    }

    const onChunk = (text: string) => {
      if (text) writeChunkToStore(chatId, targetNodeId, text);
    };

    if (await swBridge.waitForController()) {
      const requestId = crypto.randomUUID();
      const prepared = prepareStreamRequest(
        resolvedProvider.endpoint,
        requestMessages,
        config,
        resolvedProvider.key,
        undefined,
        apiVersion
      );

      await new Promise<void>((resolve, reject) => {
        let swHandle: swBridge.SwStreamHandle | undefined;

        const cleanup = () => {
          clearInterval(checkStop);
          deleteStreamRecord(requestId).catch(() => {});
        };

        const checkStop = setInterval(() => {
          if (!useStore.getState().generatingSessions[sessionId]) {
            swHandle?.cancel();
            cleanup();
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
            cleanup();
            resolve();
          },
          onError: (error) => {
            cleanup();
            reject(new Error(error));
          },
        }).then((handle) => {
          swHandle = handle;
          swCancellers.set(sessionId, () => handle.cancel());
        }).catch((error) => {
          cleanup();
          reject(error);
        });
      });
      return;
    }

    const stream = await getChatCompletionStream(
      resolvedProvider.endpoint,
      requestMessages,
      config,
      resolvedProvider.key || undefined,
      undefined,
      apiVersion,
      abortController.signal
    );

    if (!stream) return;
    if (stream.locked) throw new Error(t('errors.streamLocked'));

    const reader = stream.getReader();
    let reading = true;
    let partial = '';
    const decoder = new TextDecoder();
    const CHUNK_TIMEOUT_MS = 45_000;

    function readWithTimeout() {
      let timer: ReturnType<typeof setTimeout>;
      return Promise.race([
        reader.read().finally(() => clearTimeout(timer)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Chunk timeout: no data received for 45s')), CHUNK_TIMEOUT_MS);
        }),
      ]);
    }

    try {
      while (reading && !abortController.signal.aborted) {
        const { done, value } = await readWithTimeout();
        const chunk = partial + decoder.decode(value, { stream: !done });
        const parsed = parseEventSource(chunk, done);
        partial = parsed.partial;

        if (parsed.done || done) reading = false;

        const resultString = parsed.events.reduce((output: string, current) => {
          if (!current.choices?.[0]?.delta) return output;
          const content = current.choices[0]?.delta?.content ?? null;
          if (content) output += content;
          return output;
        }, '');

        if (resultString) onChunk(resultString);
      }
    } finally {
      if (!abortController.signal.aborted) {
        reader.cancel(t('errors.generationCompleted'));
      } else {
        reader.cancel(t('errors.cancelledByUser'));
      }
      reader.releaseLock();
      stream.cancel();
    }
  };

  try {
    await runRequest(messages);
  } catch (error) {
    if (!shouldRetryWithoutSystemMessages(error, messages)) {
      throw error;
    }
    await runRequest(removeSystemMessages(messages));
  }
};
