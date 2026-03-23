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

export interface OpenAIPlaygroundJSON extends ConfigInterface {
  messages: MessageInterface[];
}

export default ExportV1;
