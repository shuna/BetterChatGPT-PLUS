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
import {
  appendText as appendStreamText,
  deleteRequest as deleteStreamRecord,
  saveRequest as saveStreamRecord,
  setGenerationId as setStreamGenerationId,
} from '@utils/streamDb';
import { sendAck, sendCancel, parseProxySse, type ProxyConfig } from '@utils/proxyClient';
import { cancelGeneration } from '@api/openrouter';
import {
  appendToStreamingBuffer,
  appendReasoningToStreamingBuffer,
  createStreamingContentHash,
  finalizeStreamingBuffer,
  initializeStreamingBuffer,
  isBufferingNode,
  isStreamingContentHash,
  notifyStreamingUpdate,
  setStreamingBufferText,
} from '@utils/streamingBuffer';
import type { EventSourceDataInterface, NonStreamingResponse } from '@type/api';
import { ThinkTagParser } from '@utils/thinkTagParser';
import {
  extractReasoningFromApiContent,
  extractReasoningFromReasoningDetails,
  extractTextFromApiContent,
} from '@utils/apiContent';
import { getEffectiveStreamEnabled } from '@utils/streamSupport';
import { useStreamEndStatusStore, type StreamEndReason } from '@store/stream-end-status-store';
import * as swBridge from '@utils/swBridge';
import {
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import type { ResolvedProvider } from './submitHelpers';
import { debugReport } from '@store/debug-store';
import { cancelActiveRecovery } from './useStreamRecovery';

const abortControllers = new Map<string, AbortController>();
const swCancellers = new Map<string, () => void>();
const sessionChunkTargets = new Map<string, { chatId: string; targetNodeId: string }>();
const sessionRequestIds = new Map<string, string>();
const pendingChunkBuffers = new Map<string, string>();
const pendingChunkTimers = new Map<string, number>();

/** Per-session metadata needed to send provider-level cancel requests on stop. */
interface SessionCancelMeta {
  generationId?: string;
  proxySessionId?: string;
  proxyConfig?: ProxyConfig;
  apiKey?: string;
}
const sessionCancelMetas = new Map<string, SessionCancelMeta>();
const formatDebugTime = (time = Date.now()): string =>
  new Date(time).toISOString().slice(11, 23);

export const setSessionCancelMeta = (
  sessionId: string,
  patch: Partial<SessionCancelMeta>
) => {
  const existing = sessionCancelMetas.get(sessionId) ?? {};
  sessionCancelMetas.set(sessionId, { ...existing, ...patch });
};

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

/**
 * Extract reasoning text from an SSE event delta.
 * Handles three formats:
 *  1. delta.reasoning (simple string — most providers via OpenRouter)
 *  2. delta.reasoning_content (DeepSeek-style)
 *  3. delta.reasoning_details (structured array with type: "reasoning.text")
 */
const extractReasoningFromEvent = (event: EventSourceDataInterface): string => {
  const delta = event.choices?.[0]?.delta;
  if (!delta) return '';

  // Format 1: simple reasoning string
  if (delta.reasoning) return delta.reasoning;

  // Format 2: DeepSeek reasoning_content
  if (delta.reasoning_content) return delta.reasoning_content;

  // Format 3: reasoning_details array
  const detailsText = extractReasoningFromReasoningDetails(delta.reasoning_details);
  if (detailsText) return detailsText;

  // Format 4: content blocks that carry thinking/reasoning items
  const contentReasoning = extractReasoningFromApiContent(delta.content as never);
  if (contentReasoning) return contentReasoning;

  return '';
};

const extractReasoningFromMessage = (
  message: NonStreamingResponse['choices'][number]['message']
): string => {
  if (message.reasoning) return message.reasoning;
  if (message.reasoning_content) return message.reasoning_content;
  const detailsText = extractReasoningFromReasoningDetails(message.reasoning_details);
  if (detailsText) return detailsText;
  const contentReasoning = extractReasoningFromApiContent(message.content as never);
  if (contentReasoning) return contentReasoning;
  return '';
};

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

export const clearSubmitSessionRuntime = (
  sessionId: string,
  options?: { discardQueued?: boolean }
) => {
  const chunkTarget =
    sessionChunkTargets.get(sessionId) ??
    useStore.getState().generatingSessions[sessionId];
  if (chunkTarget) {
    if (options?.discardQueued) {
      discardQueuedChunks(chunkTarget.chatId, chunkTarget.targetNodeId);
    } else {
      flushQueuedChunks(chunkTarget.chatId, chunkTarget.targetNodeId);
    }
    finalizeStreamingNode(chunkTarget.chatId, chunkTarget.targetNodeId);
    sessionChunkTargets.delete(sessionId);
  }
  abortControllers.delete(sessionId);
  swCancellers.delete(sessionId);
  sessionCancelMetas.delete(sessionId);
  sessionRequestIds.delete(sessionId);
};

export const stopSubmitSession = (sessionId: string) => {
  const requestId = sessionRequestIds.get(sessionId);
  // Mark the target node as interrupted before aborting
  const chunkTarget =
    sessionChunkTargets.get(sessionId) ??
    useStore.getState().generatingSessions[sessionId];
  if (chunkTarget) {
    useStreamEndStatusStore.getState().setStatus(chunkTarget.targetNodeId, 'interrupted');
  }

  abortControllers.get(sessionId)?.abort();
  swCancellers.get(sessionId)?.();
  cancelActiveRecovery();
  if (requestId) {
    deleteStreamRecord(requestId).catch(() => {});
    debugReport(`stream:${requestId}`, {
      label: 'SW Stream',
      status: 'done',
      detail: `${formatDebugTime()} stopped by user`,
    });
    debugReport(`sw-pipeline:${requestId}`, {
      label: 'SW Pipeline',
      status: 'done',
      detail: `${formatDebugTime()} stopped by user`,
    });
    debugReport(`recovery-record:${requestId}`, {
      label: 'Recovery Record',
      status: 'done',
      detail: `${formatDebugTime()} stopped by user`,
    });
  }
  debugReport(`submit:${sessionId}`, {
    label: 'Submit Session',
    status: 'done',
    detail: `${formatDebugTime()} stopped by user`,
  });

  // Fire provider-level cancel (best-effort, non-blocking)
  const meta = sessionCancelMetas.get(sessionId);
  if (meta) {
    if (meta.proxyConfig && meta.proxySessionId) {
      // Proxy path: tell the Worker to abort upstream + call provider cancel
      sendCancel(
        meta.proxyConfig,
        meta.proxySessionId,
        meta.generationId && meta.apiKey
          ? { generationId: meta.generationId, apiKey: meta.apiKey }
          : undefined
      );
    } else if (meta.generationId && meta.apiKey) {
      // Direct path: call provider cancel API from the client
      cancelGeneration(meta.generationId, meta.apiKey);
    }
  }

  clearSubmitSessionRuntime(sessionId, { discardQueued: true });
  useStore.getState().removeSession(sessionId);
  if (Object.keys(useStore.getState().generatingSessions).length === 0) {
    debugReport('streaming', {
      label: 'Streaming',
      status: 'done',
      detail: requestId ?? sessionId,
    });
  }
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

const ensureStreamingBufferForNode = (
  chatId: string,
  targetNodeId: string
): boolean => {
  let initialized = false;

  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;

    const chatIndex = chats.findIndex((chat) => chat.id === chatId);
    if (chatIndex < 0) return state;

    const updatedChats = cloneChatAt(chats, chatIndex);
    const updatedChat = updatedChats[chatIndex];
    const tree = updatedChat.branchTree;

    if (!tree?.nodes[targetNodeId]) {
      return state;
    }

    let updatedContentStore = state.contentStore;
    const node = tree.nodes[targetNodeId];

    if (!isStreamingContentHash(node.contentHash)) {
      updatedContentStore = { ...state.contentStore };
      initializeStreamingBuffer(
        targetNodeId,
        resolveContent(updatedContentStore, node.contentHash),
        chatId
      );
      releaseContent(updatedContentStore, node.contentHash);
      tree.nodes[targetNodeId] = {
        ...node,
        contentHash: createStreamingContentHash(targetNodeId),
      };
      initialized = true;
    } else if (!isBufferingNode(targetNodeId)) {
      initializeStreamingBuffer(targetNodeId, [], chatId);
      initialized = true;
    }

    if (!initialized) return state;

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
  });

  return initialized || isBufferingNode(targetNodeId);
};

/** Write reasoning chunk to the streaming buffer (not the Zustand store). */
const writeReasoningChunk = (
  chatId: string,
  targetNodeId: string,
  text: string
): void => {
  if (!text) return;
  if (!isBufferingNode(targetNodeId) && !ensureStreamingBufferForNode(chatId, targetNodeId)) {
    return;
  }
  appendReasoningToStreamingBuffer(targetNodeId, text);
  notifyStreamingUpdate(targetNodeId);
};

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

/** Resolve proxy config from store, returns undefined if not configured or disabled */
function getProxyConfig(): ProxyConfig | undefined {
  const { proxyEnabled, proxyEndpoint, proxyAuthToken } = useStore.getState();
  if (!proxyEnabled || !proxyEndpoint) return undefined;
  return {
    endpoint: proxyEndpoint.replace(/\/+$/, ''),
    authToken: proxyAuthToken || undefined,
  };
}

export interface ExecuteSubmitStreamResult {
  generationId?: string;
}

class SubmitStreamError extends Error {
  generationId?: string;
}

const withCapturedGenerationId = (
  error: unknown,
  generationId?: string
): Error => {
  if (!generationId) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const wrapped = new SubmitStreamError(
    error instanceof Error ? error.message : String(error)
  );
  wrapped.name = error instanceof Error ? error.name : 'SubmitStreamError';
  wrapped.stack = error instanceof Error ? error.stack : wrapped.stack;
  wrapped.generationId = generationId;
  return wrapped;
};

export const getGenerationIdFromSubmitError = (
  error: unknown
): string | undefined =>
  error instanceof SubmitStreamError ? error.generationId : undefined;

// ---------------------------------------------------------------------------
// Local model submit (wllama generation)
// ---------------------------------------------------------------------------

export interface ExecuteLocalSubmitParams {
  sessionId: string;
  chatId: string;
  chatIndex: number;
  messageIndex: number;
  targetNodeId: string;
  messages: MessageInterface[];
  config: ConfigInterface;
  mode: 'append' | 'midchat';
  abortController: AbortController;
  t: (key: string) => string;
}

export const executeLocalSubmit = async ({
  sessionId,
  chatId,
  chatIndex,
  messageIndex,
  targetNodeId,
  messages,
  config,
  mode,
  abortController,
}: ExecuteLocalSubmitParams): Promise<ExecuteSubmitStreamResult> => {
  // Lazy imports to keep submitRuntime lightweight
  const { localModelRuntime } = await import('@src/local-llm/runtime');
  const { buildLocalPromptFromContext } = await import('./submitHelpers');

  await localModelRuntime.ensureLoaded(config.model);
  const engine = localModelRuntime.getWllamaEngine(config.model);
  if (!engine) throw new Error('Local model engine not available');

  // `messages` is already the token-limited submit context from useSubmit.
  // Reusing the original chat messageIndex here would slice that context again
  // and can drop the latest user turn on local generation.
  const prompt = buildLocalPromptFromContext(
    messages, mode, messages.length, config.model,
    undefined, config.systemPrompt,
  );

  // Initialize streaming buffer for the target node (same pattern as handleStreamEvent)
  sessionChunkTargets.set(sessionId, { chatId, targetNodeId });

  useStore.setState((state) => {
    const chats = state.chats;
    if (!chats) return state;
    const chat = chats[chatIndex];
    if (!chat?.branchTree) return state;

    const updatedChats = [...chats];
    const updatedChat = { ...chat, branchTree: { ...chat.branchTree, nodes: { ...chat.branchTree.nodes } } };
    updatedChats[chatIndex] = updatedChat;
    const tree = updatedChat.branchTree;
    const node = tree.nodes[targetNodeId];
    if (!node) return state;

    let updatedContentStore = state.contentStore;
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

    return {
      ...state,
      chats: updatedChats,
      ...(updatedContentStore !== state.contentStore ? { contentStore: updatedContentStore } : {}),
    };
  });

  // Wire up the abort signal so that stopping the session also stops the
  // wllama worker.  Without this the worker keeps generating tokens (wasting
  // CPU) and the model stays in 'busy' status, blocking subsequent requests.
  const onAbort = () => engine.abort();
  abortController.signal.addEventListener('abort', onAbort);

  let fullText = '';
  try {
    // If already aborted before generation starts, bail out immediately.
    if (abortController.signal.aborted) {
      return {};
    }

    await engine.generate(
      prompt,
      {
        maxTokens: config.max_tokens,
        temperature: config.temperature,
      },
      (text) => {
        if (abortController.signal.aborted) return;
        fullText = text;
        // wllama sends currentText (full text-so-far), not deltas —
        // use setStreamingBufferText to replace rather than append
        setStreamingBufferText(targetNodeId, text);
        notifyStreamingUpdate(targetNodeId);
      },
      'chat',
    );
  } catch (e) {
    if ((e as Error).name === 'AbortError' || abortController.signal.aborted) {
      // User cancelled — finalize what we have
    } else {
      throw e;
    }
  } finally {
    abortController.signal.removeEventListener('abort', onAbort);
  }

  // Do NOT call finalizeStreamingBuffer here — the session cleanup
  // (clearSubmitSessionRuntime → finalizeStreamingNode) handles
  // committing the buffer to the content store and chat tree.

  return {};
};

// ---------------------------------------------------------------------------
// Remote submit stream
// ---------------------------------------------------------------------------

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
  let lastFinishReason: string | undefined;

  // Parser for <think>...</think> tags in content (used by open-source models
  // on Together AI, Fireworks, Groq, etc.)
  const thinkTagParser = new ThinkTagParser();

  // Seed cancel metadata so stopSubmitSession can reach the provider.
  // Only store apiKey when the provider is OpenRouter — sending keys
  // to openrouter.ai for non-OpenRouter providers would be a leak.
  const isOpenRouter = config.providerId === 'openrouter';
  setSessionCancelMeta(sessionId, {
    apiKey: isOpenRouter ? (resolvedProvider.key || undefined) : undefined,
    proxyConfig,
  });
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
      if (
        !capturedGenerationId &&
        data &&
        typeof data.id === 'string' &&
        data.id.startsWith('gen-')
      ) {
        capturedGenerationId = data.id;
        setSessionCancelMeta(sessionId, { generationId: capturedGenerationId });
      }

      const nonStreamData = data as NonStreamingResponse;
      lastFinishReason = nonStreamData.choices[0].finish_reason ?? 'stop';
      // Extract reasoning from non-streaming response
      const msg = nonStreamData.choices[0].message;
      const reasoningText = extractReasoningFromMessage(msg);
      // Parse <think> tags from content
      const rawMessageText = extractTextFromApiContent(msg.content as never);
      const parsedContent = thinkTagParser.process(rawMessageText);
      const flushedContent = thinkTagParser.flush();
      const finalContent = parsedContent.content + flushedContent.content;
      const thinkReasoning = parsedContent.reasoning + flushedContent.reasoning;
      writeChunkToStore(chatId, targetNodeId, finalContent || rawMessageText);
      if (reasoningText || thinkReasoning) {
        writeReasoningChunk(chatId, targetNodeId, reasoningText + thinkReasoning);
      }
      return;
    }

    if (
      (!resolvedProvider.key || resolvedProvider.key.length === 0) &&
      resolvedProvider.endpoint === officialAPIEndpoint
    ) {
      throw new Error(t('noApiKeyWarning'));
    }

    const onChunk = (text: string, meta?: { generationId?: string; reasoning?: string }) => {
      if (meta?.generationId && !capturedGenerationId) {
        capturedGenerationId = meta.generationId;
        setSessionCancelMeta(sessionId, { generationId: capturedGenerationId });
      }
      // Handle reasoning from SW path (already extracted by SW)
      if (meta?.reasoning) {
        writeReasoningChunk(chatId, targetNodeId, meta.reasoning);
      }
      if (text) {
        // Parse <think> tags from content stream
        const parsed = thinkTagParser.process(text);
        if (parsed.reasoning) {
          writeReasoningChunk(chatId, targetNodeId, parsed.reasoning);
        }
        if (parsed.content) {
          queueChunkToStore(chatId, targetNodeId, parsed.content);
        }
      }
    };

    const onReasoningChunk = (text: string) => {
      writeReasoningChunk(chatId, targetNodeId, text);
    };

    // --- Path 1: SW available (with optional proxy) ---
    // Debug option: set localStorage.setItem('disableSW', '1') to bypass SW
    const swDisabled = typeof localStorage !== 'undefined' && localStorage.getItem('disableSW') === '1';
    if (!swDisabled && await swBridge.waitForController()) {
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
      const swProxySessionId = proxyConfig ? `${chatId}:${requestId}` : undefined;
      const swProxyConfig = proxyConfig
        ? {
            endpoint: proxyConfig.endpoint,
            authToken: proxyConfig.authToken,
            sessionId: swProxySessionId!,
          }
        : undefined;

      if (swProxySessionId) {
        setSessionCancelMeta(sessionId, { proxySessionId: swProxySessionId });
      }

      // Track whether the SW resolved due to user cancel (session removed) vs normal completion
      let swCancelledByUser = false;

      await new Promise<void>((resolve, reject) => {
        let swHandle: swBridge.SwStreamHandle | undefined;
        sessionRequestIds.set(sessionId, requestId);

        const cleanup = () => {
          clearInterval(checkStop);
          deleteStreamRecord(requestId).catch(() => {});
          debugReport(`submit:${sessionId}`, {
            label: 'Submit Session',
            status: 'active',
            detail: `${formatDebugTime()} cleanup ${requestId.slice(0, 8)}`,
          });
        };

        const checkStop = setInterval(() => {
          if (!useStore.getState().generatingSessions[sessionId]) {
            swCancelledByUser = true;
            swHandle?.cancel();
            cleanup();
            debugReport(`submit:${sessionId}`, {
              status: 'done',
              detail: `${formatDebugTime()} session removed before sw-done`,
            });
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
            if (meta?.finishReason) lastFinishReason = meta.finishReason;
            debugReport(`submit:${sessionId}`, {
              status: 'done',
              detail: `${formatDebugTime()} onDone ${requestId.slice(0, 8)}`,
            });
            // ACK proxy to free KV cache
            if (meta?.proxySessionId && proxyConfig) {
              sendAck(proxyConfig, meta.proxySessionId);
            }
            resolve();
          },
          onError: (error, meta) => {
            cleanup();
            if (meta?.generationId) {
              capturedGenerationId = meta.generationId;
            }
            debugReport(`submit:${sessionId}`, {
              status: 'error',
              detail: `${formatDebugTime()} onError ${error}`,
            });
            reject(new Error(error));
          },
          proxyConfig: swProxyConfig,
        }).then((handle) => {
          swHandle = handle;
          swCancellers.set(sessionId, () => handle.cancel());
          debugReport(`submit:${sessionId}`, {
            label: 'Submit Session',
            status: 'active',
            detail: `${formatDebugTime()} sw handle ready`,
          });
        }).catch((error) => {
          cleanup();
          debugReport(`submit:${sessionId}`, {
            status: 'error',
            detail: `${formatDebugTime()} startStream failed`,
          });
          reject(error);
        });
      });

      // If user cancelled, signal the caller not to overwrite 'interrupted' status
      if (swCancelledByUser) {
        lastFinishReason = '__cancelled__';
      }
      return;
    }

    // --- Path 2: Proxy without SW (fetch proxy SSE directly) ---
    if (proxyConfig) {
      const requestId = crypto.randomUUID();
      const proxySessionId = `${chatId}:${requestId}`;
      setSessionCancelMeta(sessionId, { proxySessionId });
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
          .then(() =>
            appendStreamText(
              requestId,
              snapshot,
              eventIdSnapshot,
              capturedGenerationId
            )
          )
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
                    setSessionCancelMeta(sessionId, { generationId: capturedGenerationId });
                    void setStreamGenerationId(requestId, capturedGenerationId);
                    break;
                  }
                }
              }
              let reasoningString = '';
              const resultString = llmParsed.events.reduce(
                (output: string, current) => {
                  if (!current.choices?.[0]?.delta) return output;
                  if (current.choices[0]?.finish_reason) {
                    lastFinishReason = current.choices[0].finish_reason;
                  }
                  const reasoning = extractReasoningFromEvent(current);
                  if (reasoning) reasoningString += reasoning;
                  const content = extractTextFromApiContent(
                    current.choices[0]?.delta?.content as never
                  );
                  if (content) output += content;
                  return output;
                },
                ''
              );
              if (reasoningString) onReasoningChunk(reasoningString);
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
          let flushReasoningString = '';
          const resultString = llmFlushed.events.reduce(
            (output: string, current) => {
              if (!current.choices?.[0]?.delta) return output;
              const reasoning = extractReasoningFromEvent(current);
              if (reasoning) flushReasoningString += reasoning;
              const content = extractTextFromApiContent(
                current.choices[0]?.delta?.content as never
              );
              if (content) output += content;
              return output;
            },
            ''
          );
          if (flushReasoningString) onReasoningChunk(flushReasoningString);
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
              setSessionCancelMeta(sessionId, { generationId: capturedGenerationId });
              break;
            }
          }
        }
        if (parsed.done || done) reading = false;

        let reasoningString = '';
        const resultString = parsed.events.reduce((output: string, current) => {
          if (!current.choices?.[0]?.delta) return output;
          if (current.choices[0]?.finish_reason) {
            lastFinishReason = current.choices[0].finish_reason;
          }
          const reasoning = extractReasoningFromEvent(current);
          if (reasoning) reasoningString += reasoning;
          const content = extractTextFromApiContent(
            current.choices[0]?.delta?.content as never
          );
          if (content) output += content;
          return output;
        }, '');

        if (reasoningString) onReasoningChunk(reasoningString);
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
      // Determine end reason from the error type
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const endReason: StreamEndReason = isAbort ? 'interrupted' : 'error';
      useStreamEndStatusStore.getState().setStatus(targetNodeId, endReason);
      throw withCapturedGenerationId(error, capturedGenerationId);
    }
    try {
      await runRequest(removeSystemMessages(messages));
    } catch (retryError) {
      const isAbort = retryError instanceof Error && retryError.name === 'AbortError';
      const endReason: StreamEndReason = isAbort ? 'interrupted' : 'error';
      useStreamEndStatusStore.getState().setStatus(targetNodeId, endReason);
      throw withCapturedGenerationId(retryError, capturedGenerationId);
    }
  } finally {
    // Flush any remaining <think> tag buffer before finalizing
    const remaining = thinkTagParser.flush();
    if (remaining.reasoning) writeReasoningChunk(chatId, targetNodeId, remaining.reasoning);
    if (remaining.content) queueChunkToStore(chatId, targetNodeId, remaining.content);
    flushQueuedChunks(chatId, targetNodeId);
    finalizeStreamingNode(chatId, targetNodeId);
  }

  // Stream completed successfully — determine the reason
  // Skip if the SW path resolved due to user cancel (status already set by stopSubmitSession)
  if (lastFinishReason !== '__cancelled__') {
    const endReason: StreamEndReason = lastFinishReason === 'length' ? 'max_tokens' : 'completed';
    useStreamEndStatusStore.getState().setStatus(targetNodeId, endReason);
  }

  return { generationId: capturedGenerationId };
};
