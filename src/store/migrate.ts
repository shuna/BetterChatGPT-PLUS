import { v4 as uuidv4 } from 'uuid';

import {
  BranchNodeLegacy,
  Folder,
  FolderCollection,
  LocalStorageInterfaceV0ToV1,
  LocalStorageInterfaceV1ToV2,
  LocalStorageInterfaceV2ToV3,
  LocalStorageInterfaceV3ToV4,
  LocalStorageInterfaceV4ToV5,
  LocalStorageInterfaceV5ToV6,
  LocalStorageInterfaceV6ToV7,
  LocalStorageInterfaceV7oV8,
  LocalStorageInterfaceV8_1ToV8_2,
  LocalStorageInterfaceV8oV8_1,
  TextContentInterface,
  LocalStorageInterfaceV8_2ToV9,
  LocalStorageInterfaceV9ToV10,
  LocalStorageInterfaceV10ToV11,
  LocalStorageInterfaceV11ToV12,
  LocalStorageInterfaceV12ToV13,
  LocalStorageInterfaceV13ToV14,
  ContentInterface,
} from '@type/chat';
import { ContentStoreData, addContent } from '@utils/contentStore';
import { DEFAULT_PROVIDERS } from './provider-config';
import {
  _defaultChatConfig,
  _defaultMenuWidth,
  _defaultDisplayChatSize,
  defaultApiVersion,
  defaultModel,
  defaultUserMaxToken,
  _defaultImageDetail,
} from '@constants/chat';
import { officialAPIEndpoint } from '@constants/auth';
import defaultPrompts from '@constants/prompt';

export const migrateV0 = (persistedState: LocalStorageInterfaceV0ToV1) => {
  persistedState.chats.forEach((chat) => {
    chat.titleSet = false;
    if (!chat.config) chat.config = { ..._defaultChatConfig };
  });
};

export const migrateV1 = (persistedState: LocalStorageInterfaceV1ToV2) => {
  if (persistedState.apiFree) {
    persistedState.apiEndpoint = persistedState.apiFreeEndpoint;
  } else {
    persistedState.apiEndpoint = officialAPIEndpoint;
  }
};

export const migrateV2 = (persistedState: LocalStorageInterfaceV2ToV3) => {
  persistedState.chats.forEach((chat) => {
    chat.config = {
      ...chat.config,
      top_p: _defaultChatConfig.top_p,
      frequency_penalty: _defaultChatConfig.frequency_penalty,
    };
  });
  persistedState.autoTitle = false;
};

export const migrateV3 = (persistedState: LocalStorageInterfaceV3ToV4) => {
  persistedState.prompts = defaultPrompts;
};

export const migrateV4 = (persistedState: LocalStorageInterfaceV4ToV5) => {
  persistedState.chats.forEach((chat) => {
    chat.config = {
      ...chat.config,
      model: defaultModel,
    };
  });
};

export const migrateV5 = (persistedState: LocalStorageInterfaceV5ToV6) => {
  persistedState.chats.forEach((chat) => {
    chat.config = {
      ...chat.config,
      max_tokens: defaultUserMaxToken,
    };
  });
};

export const migrateV6 = (persistedState: LocalStorageInterfaceV6ToV7) => {
  if (
    persistedState.apiEndpoint ===
    'https://sharegpt.churchless.tech/share/v1/chat'
  ) {
    persistedState.apiEndpoint = 'https://chatgpt-api.shn.hk/v1/';
  }
  if (!persistedState.apiKey || persistedState.apiKey.length === 0)
    persistedState.apiKey = '';
};

export const migrateV7 = (persistedState: LocalStorageInterfaceV7oV8) => {
  let folders: FolderCollection = {};
  const folderNameToIdMap: Record<string, string> = {};

  // convert foldersExpanded and foldersName to folders
  persistedState.foldersName.forEach((name, index) => {
    const id = uuidv4();
    const folder: Folder = {
      id,
      name,
      expanded: persistedState.foldersExpanded[index],
      order: index,
    };

    folders = { [id]: folder, ...folders };
    folderNameToIdMap[name] = id;
  });
  persistedState.folders = folders;

  // change the chat.folder from name to id
  persistedState.chats.forEach((chat) => {
    if (chat.folder) chat.folder = folderNameToIdMap[chat.folder];
    chat.id = uuidv4();
  });
};

export const migrateV8_1 = (persistedState: LocalStorageInterfaceV8oV8_1) => {
  persistedState.chats.forEach((chat) => {
    persistedState.apiVersion = defaultApiVersion;
    chat.messages.forEach((msg) => {
      if (typeof msg.content === 'string') {
        const content: TextContentInterface[] = [
          { type: 'text', text: msg.content },
        ];
        msg.content = content;
      }
    });
  });
};

export const migrateV8_1_fix = (persistedState: LocalStorageInterfaceV8_1ToV8_2) => {
  persistedState.menuWidth = _defaultMenuWidth;
  persistedState.displayChatSize = _defaultDisplayChatSize;
};

export const migrateV8_2 = (persistedState: LocalStorageInterfaceV8_2ToV9) => {
  persistedState.chats.forEach((chat) => {
    if (chat.imageDetail == undefined) chat.imageDetail = _defaultImageDetail
  });
};

export const migrateV9 = (persistedState: LocalStorageInterfaceV9ToV10) => {
  const providers = { ...DEFAULT_PROVIDERS };
  const existingEndpoint = persistedState.apiEndpoint || '';
  const existingKey = persistedState.apiKey || '';

  if (existingKey) {
    if (existingEndpoint.includes('openrouter')) {
      providers.openrouter = { ...providers.openrouter, apiKey: existingKey };
    } else if (existingEndpoint.includes('openai.com')) {
      providers.openai = { ...providers.openai, apiKey: existingKey };
    } else {
      // Default: assign to openrouter
      providers.openrouter = { ...providers.openrouter, apiKey: existingKey };
    }
  }

  persistedState.providers = providers;
  persistedState.favoriteModels = [];
};

export const migrateV10 = (_persistedState: LocalStorageInterfaceV10ToV11) => {
  // branchTree is lazily initialized inside ChatInterface when first used.
  // No migration work needed at startup.
};

export const migrateV11 = (persistedState: LocalStorageInterfaceV11ToV12) => {
  // Migrate from inline content to contentHash references.
  // Build a ContentStore and replace BranchNode.content with BranchNode.contentHash.
  const contentStore: ContentStoreData = {};
  type LegacyBranchNodeWithHash = Omit<BranchNodeLegacy, 'content'> & {
    content?: ContentInterface[];
    contentHash?: string;
  };
  type LegacyBranchTree = {
    nodes: Record<string, LegacyBranchNodeWithHash>;
  };
  type LegacyChatWithBranchTree = {
    branchTree?: LegacyBranchTree;
  };

  if (persistedState.chats) {
    for (const chat of persistedState.chats as LegacyChatWithBranchTree[]) {
      if (chat.branchTree && chat.branchTree.nodes) {
        const nodes = chat.branchTree.nodes;
        for (const nodeId of Object.keys(nodes)) {
          const node = nodes[nodeId];
          // Only migrate nodes that still have inline content (no contentHash)
          if (node.content && !node.contentHash) {
            node.contentHash = addContent(contentStore, node.content as ContentInterface[]);
            delete node.content;
          }
        }
      }
    }
  }

  persistedState.contentStore = contentStore;
};

export const migrateV12 = (persistedState: LocalStorageInterfaceV12ToV13) => {
  // Initialize provider model cache
  persistedState.providerModelCache = {};

  // Add modelType and streamSupport defaults to existing favoriteModels
  type LegacyFavorite = { modelId: string; providerId: string; modelType?: string; streamSupport?: boolean };
  const favorites = (persistedState as unknown as { favoriteModels?: LegacyFavorite[] }).favoriteModels;
  if (Array.isArray(favorites)) {
    for (const fav of favorites) {
      if (fav.modelType === undefined) fav.modelType = 'text';
      if (fav.streamSupport === undefined) fav.streamSupport = true;
    }
  }

  // Add providerId to existing chat configs based on favoriteModels lookup
  type LegacyChat = { config?: { model?: string; providerId?: string } };
  const chats = (persistedState as unknown as { chats?: LegacyChat[] }).chats;
  if (Array.isArray(chats) && Array.isArray(favorites)) {
    for (const chat of chats) {
      if (chat.config && !chat.config.providerId && chat.config.model) {
        const match = favorites.find((f) => f.modelId === chat.config!.model);
        if (match) {
          chat.config.providerId = match.providerId;
        }
      }
    }
  }
};

export const migrateV13 = (persistedState: LocalStorageInterfaceV13ToV14) => {
  persistedState.providerCustomModels = {};

  // Legacy customModels have no providerId — cannot auto-migrate.
  // Preserve in _legacyCustomModels so the UI can show model names
  // and guide the user to manually re-register under the correct provider.
  const legacy = (persistedState as unknown as { customModels?: unknown[] }).customModels;
  if (Array.isArray(legacy) && legacy.length > 0) {
    persistedState._legacyCustomModels = legacy;
  }
  delete (persistedState as unknown as { customModels?: unknown }).customModels;
};
