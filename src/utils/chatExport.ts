import { ChatInterface, ContentInterface, isTextContent } from '@type/chat';
import { OpenAIChat, OpenRouterChat, OpenRouterMessage, OpenRouterItem, OpenRouterCharacter } from '@type/export';
import { ContentStoreData, resolveContent } from './contentStore';

type PrepareChatForExportOptions = {
  visibleBranchOnly?: boolean;
};

type PreparedChatExport = {
  chat: ChatInterface;
  contentStore: ContentStoreData;
};

const clone = <T,>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

export const prepareChatForExport = (
  chat: ChatInterface,
  sourceContentStore: ContentStoreData,
  options: PrepareChatForExportOptions = {}
): PreparedChatExport => {
  const visibleBranchOnly = options.visibleBranchOnly ?? false;

  if (!chat.branchTree) {
    return {
      chat: clone(chat),
      contentStore: {},
    };
  }

  const sourceTree = chat.branchTree;
  const includedNodeIds = visibleBranchOnly
    ? sourceTree.activePath.filter((id) => sourceTree.nodes[id] !== undefined)
    : Object.keys(sourceTree.nodes);
  const includedNodeSet = new Set(includedNodeIds);
  const activePath = sourceTree.activePath.filter((id) => includedNodeSet.has(id));

  const nodes = Object.fromEntries(
    includedNodeIds.map((id) => [id, clone(sourceTree.nodes[id])])
  );

  const hashRefCounts = new Map<string, number>();
  includedNodeIds.forEach((id) => {
    const node = sourceTree.nodes[id];
    hashRefCounts.set(node.contentHash, (hashRefCounts.get(node.contentHash) ?? 0) + 1);
  });

  const contentStore: ContentStoreData = {};
  hashRefCounts.forEach((refCount, hash) => {
    const entry = sourceContentStore[hash];
    if (!entry) return;
    // Resolve deltas to full content for V3-compatible export
    const content = entry.delta
      ? resolveContent(sourceContentStore, hash)
      : entry.content;
    contentStore[hash] = {
      content: clone(content),
      refCount,
    };
  });

  const collapsedNodes = chat.collapsedNodes
    ? Object.fromEntries(
        Object.entries(chat.collapsedNodes).filter(([id]) => includedNodeSet.has(id))
      )
    : undefined;

  return {
    chat: {
      ...clone(chat),
      messages: activePath.map((id) => {
        const node = sourceTree.nodes[id];
        return {
          role: node.role,
          content: clone(resolveContent(sourceContentStore, node.contentHash)),
        };
      }),
      branchTree: {
        nodes,
        rootId: includedNodeSet.has(sourceTree.rootId)
          ? sourceTree.rootId
          : activePath[0] ?? includedNodeIds[0] ?? '',
        activePath,
      },
      collapsedNodes,
    },
    contentStore,
  };
};

const contentToTextParts = (content: ContentInterface[]): string[] => {
  return content
    .filter(isTextContent)
    .map((c) => c.text);
};

const contentToString = (content: ContentInterface[]): string => {
  return contentToTextParts(content).join('\n');
};

export const chatToOpenAIFormat = (
  chat: ChatInterface,
  contentStore: ContentStoreData,
  options: { visibleBranchOnly?: boolean } = {}
): OpenAIChat => {
  const visibleBranchOnly = options.visibleBranchOnly ?? false;
  const modelSlug = chat.config.model;

  const mapping: OpenAIChat['mapping'] = {};

  if (chat.branchTree) {
    const tree = chat.branchTree;
    const nodeIds = visibleBranchOnly
      ? tree.activePath.filter((id) => tree.nodes[id] !== undefined)
      : Object.keys(tree.nodes);
    const nodeSet = new Set(nodeIds);

    // Build children map
    const childrenMap: Record<string, string[]> = {};
    for (const id of nodeIds) {
      childrenMap[id] = [];
    }
    for (const id of nodeIds) {
      const node = tree.nodes[id];
      if (node.parentId && nodeSet.has(node.parentId)) {
        childrenMap[node.parentId].push(id);
      }
    }

    for (const id of nodeIds) {
      const node = tree.nodes[id];
      const content = resolveContent(contentStore, node.contentHash);
      const parts = contentToTextParts(content);
      mapping[id] = {
        id,
        message: {
          author: { role: node.role },
          content: { parts },
          metadata: { model_slug: modelSlug },
        },
        parent: node.parentId && nodeSet.has(node.parentId) ? node.parentId : null,
        children: childrenMap[id] ?? [],
      };
    }

    const activePath = tree.activePath.filter((id) => nodeSet.has(id));
    const currentNode = activePath[activePath.length - 1] ?? tree.rootId;

    return {
      title: chat.title,
      create_time: tree.nodes[tree.rootId]?.createdAt
        ? Math.floor(tree.nodes[tree.rootId].createdAt / 1000)
        : undefined,
      mapping,
      current_node: currentNode,
    };
  }

  // Fallback: flat messages → linear mapping
  let parentId: string | null = null;
  const ids: string[] = [];
  chat.messages.forEach((msg, i) => {
    const id = `msg-${i}`;
    ids.push(id);
    const parts = contentToTextParts(msg.content);
    mapping[id] = {
      id,
      message: {
        author: { role: msg.role },
        content: { parts },
        metadata: { model_slug: modelSlug },
      },
      parent: parentId,
      children: [],
    };
    if (parentId && mapping[parentId]) {
      mapping[parentId].children.push(id);
    }
    parentId = id;
  });

  return {
    title: chat.title,
    mapping,
    current_node: ids[ids.length - 1] ?? '',
  };
};

let _orCounter = 0;
const orId = (prefix: string) => `${prefix}-${Date.now()}-${(++_orCounter).toString(36)}`;

export const chatToOpenRouterFormat = (
  chat: ChatInterface,
  contentStore: ContentStoreData
): OpenRouterChat => {
  const modelSlug = chat.config.model;
  const characterId = orId('char');
  const now = new Date().toISOString();

  const character: OpenRouterCharacter = {
    id: characterId,
    model: modelSlug,
    modelInfo: { slug: modelSlug, name: modelSlug },
    description: '',
    includeDefaultSystemPrompt: true,
    isStreaming: true,
    samplingParameters: {},
    chatMemory: 8,
    isDisabled: false,
    isRemoved: false,
    createdAt: now,
    updatedAt: now,
    plugins: [],
  };

  const characters: Record<string, OpenRouterCharacter> = { [characterId]: character };
  const messages: Record<string, OpenRouterMessage> = {};
  const items: Record<string, OpenRouterItem> = {};

  let prevMsgId: string | undefined;

  const addMessage = (role: string, text: string, timestamp?: number) => {
    const msgId = orId('msg');
    const itemId = orId('item');
    const ts = timestamp ? new Date(timestamp).toISOString() : now;
    const isUser = role === 'user';

    const item: OpenRouterItem = {
      id: itemId,
      messageId: msgId,
      data: {
        type: 'message',
        role: role as 'user' | 'assistant' | 'system',
        content: [{ type: isUser ? 'input_text' : 'output_text', text }],
      },
    };
    items[itemId] = item;

    const msg: OpenRouterMessage = {
      id: msgId,
      characterId: isUser ? 'USER' : characterId,
      contentType: 'text',
      context: 'main-chat',
      createdAt: ts,
      updatedAt: ts,
      isRetrying: false,
      isEdited: false,
      isCollapsed: false,
      type: role as 'user' | 'assistant' | 'system',
      items: [{ id: itemId, type: 'message' }],
    };
    if (prevMsgId) {
      msg.parentMessageId = prevMsgId;
    }
    if (!isUser) {
      msg.isGenerating = false;
    }
    messages[msgId] = msg;
    prevMsgId = msgId;
  };

  if (chat.branchTree) {
    for (const id of chat.branchTree.activePath) {
      const node = chat.branchTree.nodes[id];
      if (!node) continue;
      const content = resolveContent(contentStore, node.contentHash);
      addMessage(node.role, contentToString(content), node.createdAt);
    }
  } else {
    for (const msg of chat.messages) {
      addMessage(msg.role, contentToString(msg.content));
    }
  }

  return {
    version: 'orpg.3.0',
    title: chat.title,
    characters,
    messages,
    items,
    artifacts: {},
    artifactFiles: {},
    artifactVersions: {},
    artifactFileContents: {},
  };
};
