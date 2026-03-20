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
import { appendText as appendStreamText, deleteRequest as deleteStreamRecord, saveRequest as saveStreamRecord } from '@utils/streamDb';
import { sendAck, parseProxySse, type ProxyConfig } from '@utils/proxyClient';
import {
  appendToStreamingBuffer,
  createStreamingContentHash,
  finalizeStreamingBuffer,
  initializeStreamingBuffer,
  isBufferingNode,
  isStreamingContentHash,
  notifyStreamingUpdate,
} from '@utils/streamingBuffer';
import { getEffectiveStreamEnabled } from '@utils/streamSupport';
import * as swBridge from '@utils/swBridge';
import {
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import type { ResolvedProvider } from './submitHelpers';

const abortControllers = new Map<string, AbortController>();
const swCancellers = new Map<string, () => void>();
const sessionChunkTargets = new Map<string, { chatId: string; targetNodeId: string }>();
const pendingChunkBuffers = new Map<string, string>();
const pendingChunkTimers = new Map<string, number>();

// Align chunk flushes with the display refresh rate (VSync).
// Falls back to ~16ms setTimeout for environments without rAF (tests / SSR).
const scheduleFlush: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16) as unknown as number;
const cancelFlush: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id);
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

const discardQueuedChunks = (chatId: string, targetNodeId: string) => {
  const key = getChunkBufferKey(chatId, targetNodeId);
  const handle = pendingChunkTimers.get(key);
  if (handle != null) {
    cancelFlush(handle);
    pendingChunkTimers.delete(key);
  }
  pendingChunkBuffers.delete(key);
};

export const clearSubmitSessionRuntime = (sessionId: string) => {
  const chunkTarget =
    sessionChunkTargets.get(sessionId) ??
    useStore.getState().generatingSessions[sessionId];
  if (chunkTarget) {
    discardQueuedChunks(chunkTarget.chatId, chunkTarget.targetNodeId);
    finalizeStreamingNode(chunkTarget.chatId, chunkTarget.targetNodeId);
    sessionChunkTargets.delete(sessionId);
  }
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

const getChunkBufferKey = (chatId: string, targetNodeId: string) =>
  `${chatId}::${targetNodeId}`;

export const writeChunkToStore = (
  chatId: string,
  targetNodeId: string,
  text: string
) => {
  // Fast path: buffer already exists — update buffer only, skip Zustand.
  // Only the component subscribing via useStreamingText will re-render.
  if (isBufferingNode(targetNodeId)) {
    appendToStreamingBuffer(targetNodeId, text);
    notifyStreamingUpdate(targetNodeId);
    return;
  }

  // Slow path: first chunk — need to set streaming hash in the store.
  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;

    const chatIndex = chats.findIndex((chat) => chat.id === chatId);
    if (chatIndex < 0) return state;

    const updatedChats = cloneChatAt(chats, chatIndex);
    const updatedChat = updatedChats[chatIndex];
    const tree = updatedChat.branchTree;

    if (tree?.nodes[targetNodeId]) {
      let updatedContentStore = state.contentStore;
      const node = tree.nodes[targetNodeId];

      if (!isStreamingContentHash(node.contentHash)) {
        updatedContentStore = { ...state.contentStore };
        initializeStreamingBuffer(
          targetNodeId,
          resolveContent(updatedContentStore, node.contentHash),
          chatId,
        );
        releaseContent(updatedContentStore, node.contentHash);
        tree.nodes[targetNodeId] = {
          ...node,
          contentHash: createStreamingContentHash(targetNodeId),
        };
      } else if (!isBufferingNode(targetNodeId)) {
        initializeStreamingBuffer(targetNodeId, [], chatId);
      }

      appendToStreamingBuffer(targetNodeId, text);

      const pathIndex = tree.activePath.indexOf(targetNodeId);
      if (pathIndex >= 0) {
        updatedChat.messages[pathIndex] = {
          role: tree.nodes[targetNodeId].role,
          content: resolveContent(updatedContentStore, tree.nodes[targetNodeId].contentHash),
        };
      }

      return {
        ...state,
        chats: updatedChats,
        ...(updatedContentStore !== state.contentStore
          ? { contentStore: updatedContentStore }
          : {}),
      };
    }

    const updatedContentStore = { ...state.contentStore };

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

export const finalizeStreamingNode = (chatId: string, targetNodeId: string) => {
  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;

    const chatIndex = chats.findIndex((chat) => chat.id === chatId);
    if (chatIndex < 0) return state;

    const chat = chats[chatIndex];
    const tree = chat.branchTree;
    const node = tree?.nodes[targetNodeId];
    if (!tree || !node || !isStreamingContentHash(node.contentHash)) {
      return state;
    }

    const updatedChats = cloneChatAt(chats, chatIndex);
    const updatedChat = updatedChats[chatIndex];
    const updatedTree = updatedChat.branchTree!;
    const updatedContentStore = { ...state.contentStore };
    const finalizedContent = finalizeStreamingBuffer(targetNodeId);

    updatedTree.nodes[targetNodeId] = {
      ...updatedTree.nodes[targetNodeId],
      contentHash: addContent(updatedContentStore, finalizedContent),
    };

    if (updatedTree.activePath.includes(targetNodeId)) {
      updatedChat.messages = materializeActivePath(updatedTree, updatedContentStore);
    }

    return {
      ...state,
      chats: updatedChats,
      contentStore: updatedContentStore,
    };
  });
};

export const flushQueuedChunks = (chatId: string, targetNodeId: string) => {
  const key = getChunkBufferKey(chatId, targetNodeId);
  const buffered = pendingChunkBuffers.get(key);
  const handle = pendingChunkTimers.get(key);

  if (handle != null) {
    cancelFlush(handle);
    pendingChunkTimers.delete(key);
  }

  if (!buffered) return;
  pendingChunkBuffers.delete(key);
  writeChunkToStore(chatId, targetNodeId, buffered);
};

export const queueChunkToStore = (
  chatId: string,
  targetNodeId: string,
  text: string
) => {
  if (!text) return;

  const key = getChunkBufferKey(chatId, targetNodeId);
  pendingChunkBuffers.set(key, (pendingChunkBuffers.get(key) ?? '') + text);

  if (pendingChunkTimers.has(key)) return;

  pendingChunkTimers.set(
    key,
    scheduleFlush(() => {
      pendingChunkTimers.delete(key);
      flushQueuedChunks(chatId, targetNodeId);
    })
  );
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

/** Resolve proxy config from store, returns undefined if not configured */
function getProxyConfig(): ProxyConfig | undefined {
  const { proxyEndpoint, proxyAuthToken } = useStore.getState();
  if (!proxyEndpoint) return undefined;
  return {
    endpoint: proxyEndpoint.replace(/\/+$/, ''),
    authToken: proxyAuthToken || undefined,
  };
}

export interface ExecuteSubmitStreamResult {
  generationId?: string;
}

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
}: ExecuteSubmitStreamParams): Promise<ExecuteSubmitStreamResult> => {
  sessionChunkTargets.set(sessionId, { chatId, targetNodeId });
  const isStreamSupported = getEffectiveStreamEnabled(config);
  const proxyConfig = getProxyConfig();
  let capturedGenerationId: string | undefined;
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
      queueChunkToStore(chatId, targetNodeId, text);
    };

    // --- Path 1: SW available (with optional proxy) ---
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

      // Build proxy bridge config for SW if proxy is configured
      const swProxyConfig = proxyConfig
        ? {
            endpoint: proxyConfig.endpoint,
            authToken: proxyConfig.authToken,
            sessionId: `${chatId}:${requestId}`,
          }
        : undefined;

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
          onDone: (meta) => {
            cleanup();
            if (meta?.generationId) capturedGenerationId = meta.generationId;
            // ACK proxy to free KV cache
            if (meta?.proxySessionId && proxyConfig) {
              sendAck(proxyConfig, meta.proxySessionId);
            }
            resolve();
          },
          onError: (error) => {
            cleanup();
            reject(new Error(error));
          },
          proxyConfig: swProxyConfig,
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

    // --- Path 2: Proxy without SW (fetch proxy SSE directly) ---
    if (proxyConfig) {
      const requestId = crypto.randomUUID();
      const proxySessionId = `${chatId}:${requestId}`;
      const prepared = prepareStreamRequest(
        resolvedProvider.endpoint,
        requestMessages,
        config,
        resolvedProvider.key,
        undefined,
        apiVersion
      );

      // Write initial streamDb record so useStreamRecovery can find this session
      await saveStreamRecord({
        requestId,
        chatIndex,
        messageIndex,
        bufferedText: '',
        status: 'streaming',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        acknowledged: false,
        proxySessionId,
        lastProxyEventId: 0,
      });

      const res = await fetch(`${proxyConfig.endpoint}/api/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(proxyConfig.authToken
            ? { Authorization: `Bearer ${proxyConfig.authToken}` }
            : {}),
        },
        body: JSON.stringify({
          endpoint: prepared.endpoint,
          headers: prepared.headers,
          body: prepared.body,
          sessionId: proxySessionId,
          intermediateCache: true,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        // Cloudflare platform errors (e.g. 530/1016 DNS failure) return HTML,
        // not JSON. Detect these and provide a user-friendly message.
        const isCloudflareError =
          res.status >= 520 ||
          (errBody.includes('error code:') && !errBody.startsWith('{'));
        if (isCloudflareError) {
          const codeMatch = errBody.match(/error code:\s*(\d+)/);
          const code = codeMatch ? codeMatch[1] : String(res.status);
          throw new Error(
            `Proxy error (${code}): The LLM API endpoint is unreachable. Check the URL and try again.`
          );
        }
        throw new Error(errBody);
      }

      if (!res.body) throw new Error('Proxy returned no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';
      let llmPartial = '';
      let reading = true;
      const CHUNK_TIMEOUT_MS = 45_000;

      // Periodic streamDb flush (mirrors SW's FLUSH_INTERVAL_MS = 800)
      const DB_FLUSH_INTERVAL_MS = 800;
      let dbBuffered = '';
      let dbLastProxyEventId = 0;
      let dbFlushTimer: ReturnType<typeof setTimeout> | null = null;
      let dbFlushChain = Promise.resolve();

      function flushDbBuffer() {
        if (dbFlushTimer) { clearTimeout(dbFlushTimer); dbFlushTimer = null; }
        const snapshot = dbBuffered;
        const eventIdSnapshot = dbLastProxyEventId;
        if (!snapshot) return;
        dbBuffered = '';
        dbFlushChain = dbFlushChain
          .then(() => appendStreamText(requestId, snapshot, eventIdSnapshot))
          .catch(() => {});
      }

      function scheduleDbFlush() {
        if (dbFlushTimer) return;
        dbFlushTimer = setTimeout(flushDbBuffer, DB_FLUSH_INTERVAL_MS);
      }

      function readWithTimeout() {
        let timer: ReturnType<typeof setTimeout>;
        return Promise.race([
          reader.read().finally(() => clearTimeout(timer)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Chunk timeout: no data received for 45s')),
              CHUNK_TIMEOUT_MS
            );
          }),
        ]);
      }

      try {
        while (reading && !abortController.signal.aborted) {
          const { done, value } = await readWithTimeout();
          const chunk = partial + decoder.decode(done ? undefined : value, { stream: !done });
          const proxySse = parseProxySse(chunk, done);
          partial = proxySse.partial;

          for (const evt of proxySse.events) {
            if (evt.id > dbLastProxyEventId) dbLastProxyEventId = evt.id;
            if (evt.eventType === 'done') {
              reading = false;
              break;
            }
            if (evt.eventType === 'error' || evt.eventType === 'interrupted') {
              throw new Error(evt.meta?.error || 'Proxy stream error');
            }
            if (evt.rawText) {
              const llmChunk = llmPartial + evt.rawText;
              const llmParsed = parseEventSource(llmChunk, false);
              llmPartial = llmParsed.partial;

              if (!capturedGenerationId) {
                for (const e of llmParsed.events) {
                  if (e.id && typeof e.id === 'string' && e.id.startsWith('gen-')) {
                    capturedGenerationId = e.id;
                    break;
                  }
                }
              }
              const resultString = llmParsed.events.reduce(
                (output: string, current) => {
                  if (!current.choices?.[0]?.delta) return output;
                  const content = current.choices[0]?.delta?.content ?? null;
                  if (content) output += content;
                  return output;
                },
                ''
              );
              if (resultString) {
                onChunk(resultString);
                dbBuffered += resultString;
                scheduleDbFlush();
              }
              if (llmParsed.done) {
                reading = false;
                break;
              }
            }
          }

          if (done) reading = false;
        }

        // Flush remaining LLM partial
        if (llmPartial) {
          const llmFlushed = parseEventSource(llmPartial, true);
          const resultString = llmFlushed.events.reduce(
            (output: string, current) => {
              if (!current.choices?.[0]?.delta) return output;
              const content = current.choices[0]?.delta?.content ?? null;
              if (content) output += content;
              return output;
            },
            ''
          );
          if (resultString) {
            onChunk(resultString);
            dbBuffered += resultString;
          }
        }
      } finally {
        reader.cancel();
        reader.releaseLock();
        // Final streamDb flush
        flushDbBuffer();
        await dbFlushChain;
        // ACK proxy to free KV cache (best-effort, even on error/abort)
        sendAck(proxyConfig, proxySessionId);
        deleteStreamRecord(requestId).catch(() => {});
      }

      return;
    }

    // --- Path 3: Direct fetch (no SW, no proxy) ---
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
        const chunk = partial + decoder.decode(done ? undefined : value, { stream: !done });
        const parsed = parseEventSource(chunk, done);
        partial = parsed.partial;

        if (!capturedGenerationId) {
          for (const e of parsed.events) {
            if (e.id && typeof e.id === 'string' && e.id.startsWith('gen-')) {
              capturedGenerationId = e.id;
              break;
            }
          }
        }
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
  } finally {
    flushQueuedChunks(chatId, targetNodeId);
    finalizeStreamingNode(chatId, targetNodeId);
  }
  return { generationId: capturedGenerationId };
};
