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

export type OpenAIChat = {
  title: string;
  mapping: {
    [key: string]: {
      id: string;
      message?: {
        author: {
          role: Role;
        };
        content:
          | {
              parts?: string[];
            }
          | ContentInterface;
      } | null;
      parent: string | null;
      children: string[];
    };
  };
  current_node: string;
};

export interface OpenAIPlaygroundJSON extends ConfigInterface {
  messages: MessageInterface[];
}

export default ExportV1;
