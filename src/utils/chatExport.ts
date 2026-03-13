import { ChatInterface } from '@type/chat';
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
    contentStore[hash] = {
      content: clone(entry.content),
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
