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

const isReasoningModel = (modelId: string): boolean =>
  modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o1 ');

const stripSystemMessages = (
  messages: MessageInterface[],
  modelId: string
): MessageInterface[] => {
  if (!isReasoningModel(modelId)) return messages;
  return messages.filter((m) => m.role !== 'system');
};

const sanitizeMessageContent = (
  content: ContentInterface[]
): ContentInterface[] =>
  content.filter((part) => {
    if (part.type === 'reasoning') return false;
    if (isImageContent(part)) return true;
    return isTextContent(part) && part.text.trim().length > 0;
  });

export const sanitizeMessagesForSubmit = (
  messages: MessageInterface[]
): MessageInterface[] => {
  const filtered = messages
    .map((message) => ({
      ...message,
      content: sanitizeMessageContent(message.content),
    }))
    .filter((message) => message.content.length > 0);

  return ensureRoleAlternation(filtered);
};

const OMITTED_PLACEHOLDER = '...';

/**
 * Insert minimal placeholder messages where consecutive same-role messages
 * would violate the strict user/assistant alternation required by some APIs
 * (e.g. Anthropic). Rather than merging or pair-deleting, this preserves
 * both messages and inserts a lightweight filler with the opposite role.
 */
const ensureRoleAlternation = (
  messages: MessageInterface[]
): MessageInterface[] => {
  if (messages.length <= 1) return messages;
  const result: MessageInterface[] = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];
    if (curr.role === prev.role) {
      const fillerRole = prev.role === 'user' ? 'assistant' : 'user';
      result.push({
        role: fillerRole,
        content: [{ type: 'text', text: OMITTED_PLACEHOLDER } as TextContentInterface],
      });
    }
    result.push(curr);
  }
  return result;
};

const filterOmittedMessages = (
  messages: MessageInterface[],
  chatIndex: number
): MessageInterface[] => {
  const state = useStore.getState();
  const chat = state.chats?.[chatIndex];
  if (!chat) return messages;
  const mapKey = String(chatIndex);
  const omittedNodes = state.omittedNodeMaps[mapKey] ?? chat.omittedNodes ?? {};
  if (Object.keys(omittedNodes).length === 0) return messages;

  const activePath = chat.branchTree?.activePath;
  return messages.filter((_, idx) => {
    const nodeId = activePath?.[idx] ?? String(idx);
    return !omittedNodes[nodeId];
  });
};

export const getSubmitContextMessages = (
  messages: MessageInterface[],
  _mode: SubmitMode,
  messageIndex: number,
  modelId?: string,
  chatIndex?: number
): MessageInterface[] => {
  let sliced = messages.slice(0, messageIndex);
  if (chatIndex !== undefined) {
    sliced = filterOmittedMessages(sliced, chatIndex);
  }
  return modelId ? stripSystemMessages(sliced, modelId) : sliced;
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

  await updateTotalTokenUsed(
    config.model,
    messages.slice(0, assistantMessageIndex),
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
