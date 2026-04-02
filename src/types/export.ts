import {
  ChatInterface,
  ConfigInterface,
  ContentInterface,
  FolderCollection,
  MessageInterface,
  Role,
} from './chat';
import { ContentStoreData } from '@utils/contentStore';

export interface ExportBase {
  version: number;
}

export interface ExportV1 extends ExportBase {
  chats?: ChatInterface[];
  folders: FolderCollection;
}

export interface ExportV2 extends ExportBase {
  chats?: ChatInterface[];
  folders: FolderCollection;
  version: 2;
}

export interface ExportV3 extends ExportBase {
  chats?: ChatInterface[];
  contentStore: ContentStoreData;
  folders: FolderCollection;
  version: 3;
}

export type OpenAIChatMessage = {
  author: {
    role: Role;
  };
  content:
    | {
        parts?: string[];
      }
    | ContentInterface;
  metadata?: {
    model_slug?: string;
    [key: string]: unknown;
  };
};

export type OpenAIChat = {
  title: string;
  create_time?: number;
  mapping: {
    [key: string]: {
      id: string;
      message?: OpenAIChatMessage | null;
      parent: string | null;
      children: string[];
    };
  };
  current_node: string;
};

export type OpenRouterCharacter = {
  id: string;
  model: string;
  modelInfo: {
    slug: string;
    name: string;
  };
  description: string;
  includeDefaultSystemPrompt: boolean;
  isStreaming: boolean;
  samplingParameters: Record<string, unknown>;
  chatMemory: number;
  isDisabled: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
  plugins: unknown[];
};

export type OpenRouterItem = {
  id: string;
  messageId: string;
  data: {
    type: 'message';
    role: 'user' | 'assistant' | 'system';
    content: { type: string; text: string }[];
    [key: string]: unknown;
  };
};

export type OpenRouterMessage = {
  id: string;
  characterId: string;
  contentType: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  parentMessageId?: string;
  isRetrying: boolean;
  isEdited: boolean;
  isCollapsed: boolean;
  type: 'user' | 'assistant' | 'system';
  isGenerating?: boolean;
  metadata?: Record<string, unknown>;
  items: { id: string; type: string; [key: string]: unknown }[];
};

export type OpenRouterChat = {
  version: string;
  title: string;
  characters: Record<string, OpenRouterCharacter>;
  messages: Record<string, OpenRouterMessage>;
  items: Record<string, OpenRouterItem>;
  artifacts: Record<string, unknown>;
  artifactFiles: Record<string, unknown>;
  artifactVersions: Record<string, unknown>;
  artifactFileContents: Record<string, unknown>;
};

export type LMStudioTextContent = {
  type: 'text';
  text: string;
  fromDraftModel?: boolean;
  tokensCount?: number;
  isStructural?: boolean;
};

export type LMStudioContentBlock = {
  type: 'contentBlock';
  stepIdentifier: string;
  content: LMStudioTextContent[];
  genInfo?: {
    indexedModelIdentifier: string;
    identifier: string;
    loadModelConfig?: { fields: { key: string; value: unknown }[] };
    predictionConfig?: { fields: { key: string; value: unknown }[] };
    stats?: Record<string, unknown>;
  };
  defaultShouldIncludeInContext?: boolean;
  shouldIncludeInContext?: boolean;
};

export type LMStudioUserVersion = {
  type: 'singleStep';
  role: 'user';
  content: { type: 'text'; text: string }[];
};

export type LMStudioSystemVersion = {
  type: 'singleStep';
  role: 'system';
  content: { type: 'text'; text: string }[];
};

export type LMStudioAssistantVersion = {
  type: 'multiStep';
  role: 'assistant';
  senderInfo: { senderName: string };
  steps: LMStudioContentBlock[];
};

export type LMStudioMessage = {
  versions: (LMStudioUserVersion | LMStudioSystemVersion | LMStudioAssistantVersion)[];
  currentlySelected: number;
};

export type LMStudioChat = {
  name: string;
  pinned: boolean;
  createdAt: number;
  preset: string;
  tokenCount: number;
  userLastMessagedAt?: number;
  assistantLastMessagedAt?: number;
  systemPrompt: string;
  messages: LMStudioMessage[];
  usePerChatPredictionConfig: boolean;
  perChatPredictionConfig: { fields: unknown[] };
  clientInput: string;
  clientInputFiles: unknown[];
  userFilesSizeBytes: number;
  lastUsedModel?: {
    identifier: string;
    indexedModelIdentifier: string;
    instanceLoadTimeConfig: { fields: { key: string; value: unknown }[] };
    instanceOperationTimeConfig: { fields: unknown[] };
  };
  notes: unknown[];
  plugins: unknown[];
  pluginConfigs: Record<string, unknown>;
  disabledPluginTools: unknown[];
  looseFiles: unknown[];
};

export interface OpenAIPlaygroundJSON extends ConfigInterface {
  messages: MessageInterface[];
}

export default ExportV1;
