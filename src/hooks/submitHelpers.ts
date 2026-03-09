import { getChatCompletion } from '@api/api';
import { officialAPIEndpoint } from '@constants/auth';
import useStore from '@store/store';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { ContentStoreData } from '@utils/contentStore';
import { updateTotalTokenUsed } from '@utils/messageUtils';
import {
  ChatInterface,
  ConfigInterface,
  GeneratingSession,
  MessageInterface,
  ModelOptions,
  TextContentInterface,
} from '@type/chat';
import { FavoriteModel, ProviderConfig, ProviderId } from '@type/provider';

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
): { updatedChats: ChatInterface[]; messageIndex: number } => {
  const updatedChats = cloneChatAtIndex(chats, chatIndex);
  const assistantMessage = createAssistantPlaceholder();
  const messageIndex =
    mode === 'append' ? updatedChats[chatIndex].messages.length : insertIndex ?? 0;

  if (mode === 'append') {
    updatedChats[chatIndex].messages.push(assistantMessage);
  } else {
    updatedChats[chatIndex].messages.splice(messageIndex, 0, assistantMessage);
  }

  upsertActivePathMessage(
    updatedChats[chatIndex],
    messageIndex,
    assistantMessage,
    contentStore
  );

  return { updatedChats, messageIndex };
};

export const buildGeneratingSession = (
  sessionId: string,
  chatId: string,
  chatIndex: number,
  messageIndex: number,
  mode: 'append' | 'midchat',
  insertIndex: number | null
): GeneratingSession => ({
  sessionId,
  chatId,
  chatIndex,
  messageIndex,
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
    const provider = providers[providerId];
    if (provider) {
      return { endpoint: provider.endpoint, key: provider.apiKey };
    }
  }

  // Fallback to favoriteModels lookup
  const favorite = favoriteModels.find((entry) => entry.modelId === modelId);
  if (!favorite) return fallback;

  const provider = providers[favorite.providerId];
  if (!provider) return fallback;

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

export const getSubmitContextMessages = (
  messages: MessageInterface[],
  _mode: SubmitMode,
  messageIndex: number,
  modelId?: string
): MessageInterface[] => {
  const sliced = messages.slice(0, messageIndex);
  return modelId ? stripSystemMessages(sliced, modelId) : sliced;
};

export const applySubmitTokenUsage = async (
  chatId: string,
  assistantMessageIndex: number
): Promise<void> => {
  const state = useStore.getState();
  if (!state.countTotalTokens || !state.chats) return;

  const chatIndex = state.chats.findIndex((chat) => chat.id === chatId);
  if (chatIndex < 0) return;

  const config = state.chats[chatIndex].config;
  const messages = state.chats[chatIndex].messages;
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
