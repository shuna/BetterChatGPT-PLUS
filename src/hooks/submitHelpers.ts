import { getChatCompletion } from '@api/api';
import { officialAPIEndpoint } from '@constants/auth';
import useStore from '@store/store';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { ContentStoreData } from '@utils/contentStore';
import { updateTotalTokenUsed } from '@utils/messageUtils';
import {
  appendNodeToActivePathState,
  insertMessageAtIndexState,
} from '@store/branch-domain';
import {
  ChatInterface,
  ConfigInterface,
  ContentInterface,
  GeneratingSession,
  MessageInterface,
  ModelOptions,
  TextContentInterface,
  isImageContent,
  isTextContent,
  isToolCallContent,
  isToolResultContent,
} from '@type/chat';
import { FavoriteModel, ProviderConfig, ProviderId } from '@type/provider';
import { normalizeProviderConfig } from '@store/provider-helpers';

type ProviderMap = Partial<Record<ProviderId, ProviderConfig>>;

export type ResolvedProvider = {
  endpoint: string;
  key?: string;
};
export type SubmitMode = 'append' | 'midchat';

export const createAssistantPlaceholder = (): MessageInterface => ({
  role: 'assistant',
  content: [{ type: 'text', text: '' }],
});

export const insertAssistantPlaceholder = (
  chats: ChatInterface[],
  chatIndex: number,
  mode: SubmitMode,
  contentStore: ContentStoreData,
  insertIndex: number | null
): {
  updatedChats: ChatInterface[];
  messageIndex: number;
  targetNodeId: string;
  contentStore: ContentStoreData;
} => {
  const assistantMessage = createAssistantPlaceholder();
  const messageIndex =
    mode === 'append' ? chats[chatIndex].messages.length : insertIndex ?? 0;

  if (mode === 'append') {
    const appended = appendNodeToActivePathState(
      chats,
      chatIndex,
      'assistant',
      assistantMessage.content,
      contentStore
    );
    return {
      updatedChats: appended.chats,
      messageIndex,
      targetNodeId: appended.newId,
      contentStore: appended.contentStore,
    };
  }

  const inserted = insertMessageAtIndexState(
    chats,
    chatIndex,
    messageIndex,
    assistantMessage,
    contentStore
  );
  return {
    updatedChats: inserted.chats,
    messageIndex,
    targetNodeId: inserted.newId,
    contentStore: inserted.contentStore,
  };
};

export const buildGeneratingSession = (
  sessionId: string,
  chatId: string,
  chatIndex: number,
  messageIndex: number,
  targetNodeId: string,
  mode: 'append' | 'midchat',
  insertIndex: number | null
): GeneratingSession => ({
  sessionId,
  chatId,
  chatIndex,
  messageIndex,
  targetNodeId,
  mode,
  insertIndex,
  requestPath: 'sw',
  startedAt: Date.now(),
});

export const resolveProviderForModel = (
  modelId: string,
  favoriteModels: FavoriteModel[],
  providers: ProviderMap,
  fallback: ResolvedProvider,
  providerId?: ProviderId
): ResolvedProvider => {
  // If providerId is specified, resolve directly
  if (providerId) {
    const provider = normalizeProviderConfig(providerId, providers[providerId]);
    return { endpoint: provider.endpoint, key: provider.apiKey };
  }

  // Fallback to favoriteModels lookup
  const favorite = favoriteModels.find((entry) => entry.modelId === modelId);
  if (!favorite) return fallback;

  const provider = normalizeProviderConfig(
    favorite.providerId,
    providers[favorite.providerId]
  );

  return {
    endpoint: provider.endpoint,
    key: provider.apiKey,
  };
};

/** Check if model supports system role (reasoning models don't) */
const modelSupportsSystemRole = (modelId: string): boolean => {
  return !isReasoningModel(modelId);
};

const isReasoningModel = (modelId: string): boolean =>
  modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o1 ');

const sanitizeMessageContent = (
  content: ContentInterface[]
): ContentInterface[] =>
  content.filter((part) => {
    if (part.type === 'reasoning') return false;
    if (isImageContent(part)) return true;
    if (isToolCallContent(part) || isToolResultContent(part)) return true;
    return isTextContent(part) && part.text.trim().length > 0;
  });

const hasToolContent = (message: MessageInterface): boolean =>
  message.content.some((c) => isToolCallContent(c) || isToolResultContent(c));

const ensureRoleAlternation = (
  messages: MessageInterface[]
): MessageInterface[] => {
  const result: MessageInterface[] = [];
  for (const msg of messages) {
    if (
      result.length > 0 &&
      result[result.length - 1].role === msg.role &&
      !hasToolContent(result[result.length - 1]) &&
      !hasToolContent(msg)
    ) {
      // Merge consecutive same-role messages
      const prev = result[result.length - 1];
      result[result.length - 1] = {
        ...prev,
        content: [...prev.content, ...msg.content],
      };
    } else {
      result.push(msg);
    }
  }
  return result;
};

export const filterOmittedMessages = (
  messages: MessageInterface[],
  chatIndex: number
): MessageInterface[] => {
  const state = useStore.getState();
  const chat = state.chats?.[chatIndex];
  const omittedNodes =
    state.omittedNodeMaps[String(chatIndex)] ?? chat?.omittedNodes ?? {};
  if (Object.keys(omittedNodes).length === 0) return messages;

  return messages.filter((_, idx) => {
    const nodeId = chat?.branchTree?.activePath?.[idx] ?? String(idx);
    if (!omittedNodes[nodeId]) return true;
    // Never omit messages containing tool_call/tool_result
    if (hasToolContent(messages[idx])) return true;
    return false;
  });
};

export const sanitizeMessagesForSubmit = (
  messages: MessageInterface[]
): MessageInterface[] =>
  ensureRoleAlternation(
    messages
      .map((message) => ({
        ...message,
        content: sanitizeMessageContent(message.content),
      }))
      .filter((message) => message.content.length > 0)
  );

export const getSubmitContextMessages = (
  messages: MessageInterface[],
  _mode: SubmitMode,
  messageIndex: number,
  modelId?: string,
  chatIndex?: number,
  systemPrompt?: string
): MessageInterface[] => {
  const sliced = messages.slice(0, messageIndex);
  const filtered = chatIndex !== undefined
    ? filterOmittedMessages(sliced, chatIndex)
    : sliced;

  // Strip ALL system-role messages from the message array (config is the source of truth)
  const withoutSystem = filtered.filter((m) => m.role !== 'system');

  // Sanitize (clean content, merge consecutive same-role, etc.)
  const sanitized = sanitizeMessagesForSubmit(withoutSystem);

  // Prepend config system prompt if non-empty and model supports it
  const supportsSystem = modelId ? modelSupportsSystemRole(modelId) : true;
  if (systemPrompt && supportsSystem) {
    return [
      { role: 'system', content: [{ type: 'text', text: systemPrompt } as TextContentInterface] },
      ...sanitized,
    ];
  }
  return sanitized;
};

export const applySubmitTokenUsage = async (
  chatId: string,
  targetNodeId: string
): Promise<void> => {
  const state = useStore.getState();
  if (!state.countTotalTokens || !state.chats) return;

  const chatIndex = state.chats.findIndex((chat) => chat.id === chatId);
  if (chatIndex < 0) return;

  const chat = state.chats[chatIndex];
  const assistantMessageIndex = chat.branchTree?.activePath.indexOf(targetNodeId) ?? -1;
  if (assistantMessageIndex < 0) return;

  const config = chat.config;
  const messages = chat.messages;
  const assistantMessage = messages[assistantMessageIndex];
  if (!assistantMessage) return;

  let promptMessages = filterOmittedMessages(
    messages.slice(0, assistantMessageIndex),
    chatIndex
  ).filter((m) => m.role !== 'system');

  // Include config systemPrompt in token counting
  if (config.systemPrompt && modelSupportsSystemRole(config.model)) {
    promptMessages = [
      { role: 'system', content: [{ type: 'text', text: config.systemPrompt } as TextContentInterface] },
      ...promptMessages,
    ];
  }

  await updateTotalTokenUsed(
    config.model,
    promptMessages,
    assistantMessage,
    config.providerId
  );
};

type TitleGenerationDeps = {
  apiVersion?: string;
  titleModel?: string;
  titleProviderId?: ProviderId;
  t: (key: string) => string;
  favoriteModels: FavoriteModel[];
  providers: ProviderMap;
  fallbackProvider: ResolvedProvider;
};

export const generateTitleForChat = async (
  messages: MessageInterface[],
  modelConfig: ConfigInterface,
  deps: TitleGenerationDeps
): Promise<string> => {
  try {
    const titleModel = deps.titleModel ?? modelConfig.model;
    const titleProviderId = deps.titleModel ? deps.titleProviderId : modelConfig.providerId;
    const titleChatConfig = { ...modelConfig, model: titleModel, providerId: titleProviderId };
    const resolved = resolveProviderForModel(
      titleModel,
      deps.favoriteModels,
      deps.providers,
      deps.fallbackProvider,
      titleProviderId
    );

    if ((!resolved.key || resolved.key.length === 0) && resolved.endpoint === officialAPIEndpoint) {
      throw new Error(deps.t('noApiKeyWarning'));
    }

    const data = await getChatCompletion(
      resolved.endpoint,
      messages,
      titleChatConfig,
      resolved.key,
      undefined,
      deps.apiVersion
    );
    return data.choices[0].message.content;
  } catch (error: unknown) {
    throw new Error(
      `${deps.t('errors.errorGeneratingTitle')}\n${(error as Error).message}`
    );
  }
};

export const buildTitlePromptMessage = (
  userMessage: MessageInterface['content'],
  assistantMessage: MessageInterface['content'],
  language: string
): MessageInterface => ({
  role: 'user',
  content: [
    ...userMessage,
    ...assistantMessage,
    {
      type: 'text',
      text: `Generate a title in less than 6 words for the conversation so far (language: ${language})`,
    } as TextContentInterface,
  ],
});

export const setGeneratedTitle = (
  chats: { title: string; titleSet: boolean }[],
  chatIndex: number,
  title: string
) => {
  chats[chatIndex].title = title;
  chats[chatIndex].titleSet = true;
};

type AutoTitleDeps = TitleGenerationDeps & {
  chatId: string;
  language: string;
  setChats: (chats: ChatInterface[]) => void;
};

export const maybeGenerateAutoTitle = async ({
  chatId,
  language,
  setChats,
  ...deps
}: AutoTitleDeps) => {
  const state = useStore.getState();
  if (!state.autoTitle || !state.chats) return;

  const chatIndex = state.chats.findIndex((chat) => chat.id === chatId);
  if (chatIndex < 0 || state.chats[chatIndex]?.titleSet) return;

  const messages = state.chats[chatIndex].messages;
  const assistantMessage = messages[messages.length - 1];
  const userMessage = messages[messages.length - 2];
  if (!assistantMessage || !userMessage) return;

  const promptMessage = buildTitlePromptMessage(
    userMessage.content,
    assistantMessage.content,
    language
  );

  const titleChats = useStore.getState().chats;
  if (!titleChats) return;

  const titleChatIndex = titleChats.findIndex((chat) => chat.id === chatId);
  if (titleChatIndex < 0) return;

  const updatedChats = cloneChatAtIndex(titleChats, titleChatIndex);
  let title = (
    await generateTitleForChat([promptMessage], updatedChats[titleChatIndex].config, deps)
  ).trim();
  if (title.startsWith('"') && title.endsWith('"')) title = title.slice(1, -1);
  setGeneratedTitle(updatedChats, titleChatIndex, title);
  setChats(updatedChats);

  if (useStore.getState().countTotalTokens) {
    const titleConfig = updatedChats[titleChatIndex].config;
    const titleTokenModel = deps.titleModel ?? titleConfig.model;
    const titleTokenProviderId = deps.titleModel ? deps.titleProviderId : titleConfig.providerId;
    await updateTotalTokenUsed(titleTokenModel as ModelOptions, [promptMessage], {
      role: 'assistant',
      content: [{ type: 'text', text: title }],
    }, titleTokenProviderId);
  }
};

// ---------------------------------------------------------------------------
// Local model helpers
// ---------------------------------------------------------------------------

/**
 * Check if a chat config is targeting a local model.
 */
export function isLocalModelConfig(config: ConfigInterface): boolean {
  return config.modelSource === 'local';
}

/**
 * Build a structured messages array for local wllama generation.
 * Returns WllamaChatMessage-compatible objects that the worker will pass
 * directly to wllama.formatChat(), enabling proper chat-template expansion.
 */
export function buildLocalChatMessages(
  messages: MessageInterface[],
  mode: SubmitMode,
  messageIndex: number,
  modelId?: string,
  chatIndex?: number,
  systemPrompt?: string,
): { role: string; content: string }[] {
  const contextMessages = getSubmitContextMessages(
    messages, mode, messageIndex, modelId, chatIndex, systemPrompt,
  );
  return contextMessages.map((m) => ({
    role: m.role,
    content: m.content
      .filter((c): c is TextContentInterface => c.type === 'text')
      .map((c) => c.text)
      .join('\n'),
  }));
}

/**
 * Build a text prompt from submit context for local wllama generation.
 * Reuses getSubmitContextMessages() for omission, sanitization, and system prompt,
 * then converts the structured messages to a generic text prompt.
 *
 * Note: This uses a generic System:/User:/Assistant: format, not model-specific
 * prompt templates (ChatML, Alpaca, etc.). Quality may vary by model architecture.
 */
export function buildLocalPromptFromContext(
  messages: MessageInterface[],
  mode: SubmitMode,
  messageIndex: number,
  modelId?: string,
  chatIndex?: number,
  systemPrompt?: string,
): string {
  const contextMessages = getSubmitContextMessages(
    messages, mode, messageIndex, modelId, chatIndex, systemPrompt,
  );
  return contextMessages
    .map((m) => {
      const text = m.content
        .filter((c): c is TextContentInterface => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      if (m.role === 'system') return `System: ${text}`;
      if (m.role === 'user') return `User: ${text}`;
      return `Assistant: ${text}`;
    })
    .join('\n\n') + '\n\nAssistant:';
}
