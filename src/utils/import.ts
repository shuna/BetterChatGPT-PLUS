import { v4 as uuidv4 } from 'uuid';

import {
  ChatInterface,
  ConfigInterface,
  ContentInterface,
  FolderCollection,
  isImageContent,
  isTextContent,
  MessageInterface,
  strToTextContent,
} from '@type/chat';
import { roles } from '@type/chat';
import {
  defaultModel,
  _defaultChatConfig,
  _defaultImageDetail,
} from '@constants/chat';
import { ExportV1, ExportV2, OpenAIChat, OpenAIPlaygroundJSON } from '@type/export';
import { BranchNode, BranchTree } from '@type/chat';
import { ContentStoreData, addContent, resolveContent } from '@utils/contentStore';
import { ensureUniqueChatIds } from '@utils/chatIdentity';
import i18next from 'i18next';

type UnknownRecord = Record<string, unknown>;
type MutableChatCandidate = Partial<ChatInterface> &
  UnknownRecord & {
    messages?: unknown;
    config?: unknown;
  };
type OpenAIMessageNode = {
  id: string;
  parent: string | null;
  children: string[];
  message?: {
    author: {
      role: string;
    };
    content: unknown;
  };
};

type OpenAIConfigCarrier = Partial<
  Pick<
    ConfigInterface,
    | 'temperature'
    | 'max_tokens'
    | 'top_p'
    | 'frequency_penalty'
    | 'presence_penalty'
  >
> & {
  model?: unknown;
};

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): key is keyof T => Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const asConfigCarrier = (value: unknown): OpenAIConfigCarrier =>
  (isRecord(value) ? value : {}) as OpenAIConfigCarrier;

const extractConfigOverrides = (value: unknown): Partial<ConfigInterface> => {
  const source = asConfigCarrier(value);
  const overrides: Partial<ConfigInterface> = {};

  if (typeof source.temperature === 'number') overrides.temperature = source.temperature;
  if (typeof source.max_tokens === 'number') overrides.max_tokens = source.max_tokens;
  if (typeof source.top_p === 'number') overrides.top_p = source.top_p;
  if (typeof source.frequency_penalty === 'number') {
    overrides.frequency_penalty = source.frequency_penalty;
  }
  if (typeof source.presence_penalty === 'number') {
    overrides.presence_penalty = source.presence_penalty;
  }
  if (typeof source.model === 'string' && source.model.length > 0) {
    overrides.model = source.model;
  }

  return overrides;
};

const buildImportedConfig = (value: unknown): ConfigInterface => ({
  ..._defaultChatConfig,
  ...extractConfigOverrides(value),
});

const isOpenAIMessageContentParts = (
  value: unknown
): value is { parts: string[] } =>
  isRecord(value) &&
  hasOwn(value, 'parts') &&
  Array.isArray(value.parts) &&
  value.parts.every((part) => typeof part === 'string');

const isRole = (value: unknown): value is MessageInterface['role'] =>
  typeof value === 'string' && roles.includes(value as MessageInterface['role']);

export const validateAndFixChats = (chats: unknown): chats is ChatInterface[] => {
  if (!Array.isArray(chats)) return false;

  for (const chat of chats) {
    if (!isRecord(chat)) return false;

    const mutableChat = chat as MutableChatCandidate;

    if (!(typeof mutableChat.id === 'string')) mutableChat.id = uuidv4();
    if (!(typeof mutableChat.title === 'string') || mutableChat.title === '') return false;

    if (mutableChat.titleSet === undefined) mutableChat.titleSet = false;
    if (!(typeof mutableChat.titleSet === 'boolean')) return false;

    if (!validateMessage(mutableChat.messages)) return false;
    if (!validateAndFixChatConfig(mutableChat.config)) return false;
  }

  ensureUniqueChatIds(chats as ChatInterface[]);

  return true;
};

const validateMessage = (messages: unknown): messages is MessageInterface[] => {
  if (!Array.isArray(messages)) return false;
  for (const message of messages) {
    if (!isRecord(message)) return false;

    if (typeof message.content === 'string') {
      // Convert string content to an array containing that string
      // Ensure the TextContent format
      message.content = [strToTextContent(message.content)];
    } else if (!Array.isArray(message.content)) {
      return false;
    }

    if (!(typeof message.role === 'string')) return false;
    if (!roles.includes(message.role as MessageInterface['role'])) return false;
  }
  return true;
};

const validateAndFixChatConfig = (config: unknown): config is ConfigInterface => {
  if (config === undefined) return true;
  if (!isRecord(config)) return false;

  if (config.temperature === undefined) config.temperature = _defaultChatConfig.temperature;
  if (!(typeof config.temperature === 'number')) return false;

  if (config.presence_penalty === undefined)
    config.presence_penalty = _defaultChatConfig.presence_penalty;
  if (!(typeof config.presence_penalty === 'number')) return false;

  if (config.top_p === undefined) config.top_p = _defaultChatConfig.top_p;
  if (!(typeof config.top_p === 'number')) return false;

  if (config.frequency_penalty === undefined)
    config.frequency_penalty = _defaultChatConfig.frequency_penalty;
  if (!(typeof config.frequency_penalty === 'number')) return false;

  config.model =
    typeof config.model === 'string' && config.model.length > 0
      ? config.model
      : defaultModel;

  return true;
};

export const isLegacyImport = (importedData: unknown): importedData is unknown[] =>
  Array.isArray(importedData);

export const isSingleChatImport = (importedData: unknown): importedData is ChatInterface =>
  isRecord(importedData) &&
  hasOwn(importedData, 'messages') &&
  Array.isArray(importedData.messages) &&
  hasOwn(importedData, 'config') &&
  isRecord(importedData.config);

export const validateFolders = (
  folders: FolderCollection
): folders is FolderCollection => {
  if (typeof folders !== 'object') return false;

  for (const folderId in folders) {
    if (typeof folders[folderId].id !== 'string') return false;
    if (typeof folders[folderId].name !== 'string') return false;
    if (typeof folders[folderId].order !== 'number') return false;
    if (typeof folders[folderId].expanded !== 'boolean') return false;
  }

  return true;
};

export const validateExportV1 = (data: ExportV1): data is ExportV1 => {
  return validateAndFixChats(data.chats) && validateFolders(data.folders);
};

export const validateExportV2 = (data: ExportV2): data is ExportV2 => {
  if (!validateAndFixChats(data.chats) || !validateFolders(data.folders))
    return false;
  // branchTree is optional on each chat; if present, validate basic structure
  if (data.chats) {
    for (const chat of data.chats) {
      if (chat.branchTree) {
        const bt = chat.branchTree;
        if (typeof bt.nodes !== 'object' || !Array.isArray(bt.activePath))
          return false;
      }
    }
  }
  return true;
};

// Type guard to check if content is ContentInterface
const isContentInterface = (content: unknown): content is ContentInterface => {
  if (!isRecord(content) || typeof content.type !== 'string') return false;
  if (content.type === 'text') {
    return typeof content.text === 'string';
  }
  if (content.type === 'image_url') {
    return (
      isRecord(content.image_url) &&
      typeof content.image_url.url === 'string' &&
      typeof content.image_url.detail === 'string'
    );
  }
  return false;
};

export const isOpenAIContent = (
  content: unknown
): content is OpenAIChat | OpenAIPlaygroundJSON | OpenAIChat[] => {
  return (
    isOpenAIChat(content) ||
    isOpenAIPlaygroundJSON(content) ||
    isOpenAIDataExport(content)
  );
};

const isOpenAIChat = (content: unknown): content is OpenAIChat => {
  return isRecord(content) && hasOwn(content, 'mapping') && isRecord(content.mapping);
};
const isOpenAIDataExport = (content: unknown): content is OpenAIChat[] => {
  return (
    Array.isArray(content) && content.length > 0 && isOpenAIChat(content[0])
  );
};
const isOpenAIPlaygroundJSON = (
  content: unknown
): content is OpenAIPlaygroundJSON => {
  return (
    isRecord(content) &&
    hasOwn(content, 'messages') &&
    Array.isArray(content.messages) &&
    !hasOwn(content, 'config')
  );
};

// Define the custom error class
export class PartialImportError extends Error {
  constructor(message: string, public result: ChatInterface) {
    super(message);
    this.name = 'PartialImportError';
  }
}

export const convertOpenAIToConversationFormatPartialOK = (
  openAIChatExport: OpenAIChat | OpenAIPlaygroundJSON
): ChatInterface => {
  return convertOpenAIToConversationFormat(openAIChatExport, true);
};

export const convertOpenAIToConversationFormatPartialNTY = (
  openAIChatExport: OpenAIChat | OpenAIPlaygroundJSON
): ChatInterface => {
  return convertOpenAIToConversationFormat(openAIChatExport, false);
};
// Convert OpenAI chat exports into the app's conversation format.
export const convertOpenAIToConversationFormat = (
  openAIChatExport: OpenAIChat | OpenAIPlaygroundJSON,
  shouldAllowPartialImport: boolean
): ChatInterface => {
  const messages: MessageInterface[] = [];
  let maxDepth = -1;
  const deepestPathIds: string[] = []; // To record IDs traveled for the deepest part
  const upwardPathIds: string[] = []; // To record IDs traveled upwards
  const messageIds: string[] = []; // To record IDs that go into messages
  const emptyOrNullMessageIds: string[] = []; // To record IDs with empty or null messages
  let emptyOrNullMessagesCount = 0; // Counter for empty or null messages

  if (isOpenAIChat(openAIChatExport)) {
    let deepestNode: OpenAIMessageNode | null = null;

    // Traverse the chat tree and find the deepest node
    const traverseTree = (id: string, currentDepth: number) => {
      const node = openAIChatExport.mapping[id] as OpenAIMessageNode;

      // If the current depth is greater than maxDepth, update deepestNode and maxDepth
      if (currentDepth > maxDepth) {
        deepestNode = node;
        maxDepth = currentDepth;
      }

      // Traverse all child nodes
      for (const childId of node.children) {
        traverseTree(childId, currentDepth + 1);
      }
    };

    // Start traversing the tree from the root node
    const rootNode =
      openAIChatExport.mapping[Object.keys(openAIChatExport.mapping)[0]];
    traverseTree(rootNode.id, 0);

    // Now backtrack from the deepest node to the root and collect messages
    let currentDepth = 0;
    while (deepestNode) {
      deepestPathIds.push(deepestNode.id); // Record the ID of the deepest part

      if (deepestNode.message) {
        const { role } = deepestNode.message.author;
        const content = deepestNode.message.content;

        if (isOpenAIMessageContentParts(content)) {
          const textContent = content.parts.join('') || '';
          if (textContent.length > 0) {
            if (!isRole(role)) {
              emptyOrNullMessagesCount++;
              emptyOrNullMessageIds.push(deepestNode.id);
              continue;
            }
            // Insert each message at the beginning of the array to maintain order from root to deepest node
            messages.unshift({
              role,
              content: [{ type: 'text', text: textContent }],
            });
            messageIds.push(deepestNode.id);
          } else {
            emptyOrNullMessagesCount++;
            emptyOrNullMessageIds.push(deepestNode.id);
          }
        } else if (isContentInterface(content)) {
          if (!isRole(role)) {
            emptyOrNullMessagesCount++;
            emptyOrNullMessageIds.push(deepestNode.id);
            continue;
          }
          // Insert each message at the beginning of the array
          messages.unshift({ role, content: [content] });
          messageIds.push(deepestNode.id);
        } else {
          emptyOrNullMessagesCount++;
          emptyOrNullMessageIds.push(deepestNode.id);
        }
      } else {
        emptyOrNullMessagesCount++;
        emptyOrNullMessageIds.push(deepestNode.id);
      }

      // Move up to the parent node
      const parentNodeId: string | null = deepestNode.parent ? deepestNode.parent : null;
      deepestNode = parentNodeId
        ? (openAIChatExport.mapping[parentNodeId] as OpenAIMessageNode)
        : null;
      currentDepth++;
    }

    // Record the upward path IDs in reverse order to match the order from root to end
    for (let i = deepestPathIds.length - 1; i >= 0; i--) {
      upwardPathIds.push(deepestPathIds[i]);
    }

    // Show differences
    const diffDeepestToMessages = deepestPathIds.filter(id => !messageIds.includes(id));

    // Check if the difference between diffDeepestToMessages and emptyOrNullMessageIds is empty
    const diffDeepestToMessagesAndEmpty = diffDeepestToMessages.filter(id => !emptyOrNullMessageIds.includes(id));

    if (!shouldAllowPartialImport) {
      // If the difference between diffDeepestToMessages and emptyOrNullMessageIds is not empty, throw PartialImportError
      if (diffDeepestToMessagesAndEmpty.length > 0) {
        const config = buildImportedConfig(openAIChatExport);

        const result: ChatInterface = {
          id: uuidv4(),
          title: openAIChatExport.title || 'Untitled Chat',
          messages,
          config,
          titleSet: true,
          imageDetail: _defaultImageDetail,
        };
        throw new PartialImportError(
          i18next.t('partialImportMessages', {
            ns: 'import',
            total: deepestPathIds.length,
            count: messageIds.length,
          }),
          result
        );
      }
    }
  } else if (isOpenAIPlaygroundJSON(openAIChatExport)) {
    // Handle the playground export format
    openAIChatExport.messages.forEach((message) => {
      const { role, content } = message;
      if (Array.isArray(content)) {
        const contentElements: ContentInterface[] = content
          .map((part) => {
            if (isTextContent(part)) {
              return { type: 'text', text: part.text };
            } else if (isImageContent(part)) {
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url.url,
                  detail: part.image_url.detail || 'auto',
                },
              };
            }
            return null;
          })
          .filter((part) => part !== null) as ContentInterface[];

        if (contentElements.length > 0) {
          messages.push({
            role,
            content: contentElements,
          });
        }
      }
    });
  }

  // Extend or override _defaultChatConfig with values from openAIChat
  const config = buildImportedConfig(openAIChatExport);

  // Return the chat interface object
  return {
    id: uuidv4(),
    title:
      'title' in openAIChatExport && typeof openAIChatExport.title === 'string'
        ? openAIChatExport.title
        : 'Untitled Chat',
    messages,
    config,
    titleSet: true,
    imageDetail: _defaultImageDetail,
  };
};

// Convert OpenAI mapping tree to BranchTree, preserving all branches
export const convertOpenAIToBranchTree = (
  openAIChat: OpenAIChat,
  contentStore: ContentStoreData
): { branchTree: BranchTree; messages: MessageInterface[] } | null => {
  const mapping = openAIChat.mapping;
  if (!mapping) return null;

  const nodes: Record<string, BranchNode> = {};
  const idMap: Record<string, string> = {}; // openai id -> our uuid

  // First pass: create nodes for all mapping entries that have valid messages
  for (const [oaiId, entry] of Object.entries(mapping)) {
    const newId = uuidv4();
    idMap[oaiId] = newId;

    let role: 'user' | 'assistant' | 'system' = 'system';
      let content: ContentInterface[] = [{ type: 'text', text: '' }];

    if (entry.message) {
      role = isRole(entry.message.author.role)
        ? entry.message.author.role
        : 'system';

      const msgContent = entry.message.content;
      if (isOpenAIMessageContentParts(msgContent)) {
        const text = msgContent.parts.join('') || '';
        content = [{ type: 'text', text }];
      } else if (isContentInterface(msgContent)) {
        content = [msgContent];
      }
    }

    const contentHash = addContent(contentStore, content);
    nodes[newId] = {
      id: newId,
      parentId: null, // will be set in second pass
      role,
      contentHash,
      createdAt: Date.now(),
    };
  }

  // Second pass: set parent IDs
  for (const [oaiId, entry] of Object.entries(mapping)) {
    if (entry.parent && idMap[entry.parent]) {
      nodes[idMap[oaiId]].parentId = idMap[entry.parent];
    }
  }

  // Find root (no parent)
  const rootId = Object.values(nodes).find((n) => n.parentId === null)?.id;
  if (!rootId) return null;

  // Build active path from current_node
  const activePath: string[] = [];
  if (openAIChat.current_node && idMap[openAIChat.current_node]) {
    let cur: string | null = idMap[openAIChat.current_node];
    while (cur) {
      activePath.unshift(cur);
      cur = nodes[cur]?.parentId ?? null;
    }
  } else {
    // Fallback: find deepest path
    let cur = rootId;
    activePath.push(cur);
    while (true) {
      const children = Object.values(nodes).filter(
        (n) => n.parentId === cur
      );
      if (children.length === 0) break;
      cur = children[0].id;
      activePath.push(cur);
    }
  }

  const branchTree: BranchTree = { nodes, rootId, activePath };

  // Materialize messages from active path
  const messages: MessageInterface[] = activePath
    .map((id) => nodes[id])
    .filter((n) => {
      const c = resolveContent(contentStore, n.contentHash);
      return c.some((ci) => isTextContent(ci) && ci.text.length > 0);
    })
    .map((n) => ({
      role: n.role,
      content: resolveContent(contentStore, n.contentHash),
    }));

  return { branchTree, messages };
};

// Import OpenAI chat data and convert it into the app's conversation format.
export const importOpenAIChatExport = (
  openAIChatExport: OpenAIChat | OpenAIPlaygroundJSON | OpenAIChat[],
  shouldAllowPartialImport: boolean
) => {
  if (Array.isArray(openAIChatExport)) {
    if (shouldAllowPartialImport) {
      return openAIChatExport.map(convertOpenAIToConversationFormatPartialOK);
    } else {
      return openAIChatExport.map(convertOpenAIToConversationFormatPartialNTY);
    }
  } else {
    return [
      convertOpenAIToConversationFormat(
        openAIChatExport,
        shouldAllowPartialImport
      ),
    ];
  }
  return [];
};

// Backward-compatible aliases for older imports.
export const convertOpenAIToBetterChatGPTFormatPartialOK =
  convertOpenAIToConversationFormatPartialOK;
export const convertOpenAIToBetterChatGPTFormatPartialNTY =
  convertOpenAIToConversationFormatPartialNTY;
export const convertOpenAIToBetterChatGPTFormat = convertOpenAIToConversationFormat;
