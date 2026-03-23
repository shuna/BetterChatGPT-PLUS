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

export type OpenRouterChat = {
  title: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  messages: {
    role: Role;
    content: string;
  }[];
};

export interface OpenAIPlaygroundJSON extends ConfigInterface {
  messages: MessageInterface[];
}

export default ExportV1;
