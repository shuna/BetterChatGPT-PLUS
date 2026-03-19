import type { ChatInterface, ContentInterface, TextContentInterface } from '@type/chat';
import { isTextContent } from '@type/chat';
import { cloneChatAt } from '@store/branch-domain';
import type { ContentStoreData } from './contentStore';
import { addContent } from './contentStore';
import { materializeActivePath } from './branchUtils';

const STREAMING_CONTENT_HASH_PREFIX = '__streaming:';

interface StreamingBufferEntry {
  content: ContentInterface[];
}

const streamingBuffers = new Map<string, StreamingBufferEntry>();

const cloneContentItem = (content: ContentInterface): ContentInterface =>
  content.type === 'text'
    ? { ...content }
    : { ...content, image_url: { ...content.image_url } };

const cloneContent = (content: ContentInterface[]): ContentInterface[] =>
  content.map(cloneContentItem);

const upsertTextContent = (
  content: ContentInterface[],
  updater: (text: string) => string
): ContentInterface[] => {
  if (content.length === 0) {
    return [{ type: 'text', text: updater('') }];
  }

  const [first, ...rest] = content;
  if (isTextContent(first)) {
    const updatedFirst: TextContentInterface = {
      ...first,
      text: updater(first.text),
    };
    return [updatedFirst, ...rest.map(cloneContentItem)];
  }

  return [{ type: 'text', text: updater('') }, ...content.map(cloneContentItem)];
};

export const createStreamingContentHash = (nodeId: string): string =>
  `${STREAMING_CONTENT_HASH_PREFIX}${nodeId}`;

export const isStreamingContentHash = (hash: string): boolean =>
  hash.startsWith(STREAMING_CONTENT_HASH_PREFIX);

export const getStreamingNodeIdFromHash = (hash: string): string | null =>
  isStreamingContentHash(hash) ? hash.slice(STREAMING_CONTENT_HASH_PREFIX.length) : null;

export const initializeStreamingBuffer = (
  nodeId: string,
  content: ContentInterface[]
): void => {
  streamingBuffers.set(nodeId, { content: cloneContent(content) });
  ensureSnapshotFlushRunning();
};

export const appendToStreamingBuffer = (nodeId: string, text: string): void => {
  const current = streamingBuffers.get(nodeId)?.content ?? [];
  streamingBuffers.set(nodeId, {
    content: upsertTextContent(current, (existing) => existing + text),
  });
};

export const getBufferedContent = (nodeId: string): ContentInterface[] | undefined => {
  const entry = streamingBuffers.get(nodeId);
  return entry ? cloneContent(entry.content) : undefined;
};

/** Read-only reference to buffered content. Caller must NOT mutate the result. */
export const peekBufferedContent = (nodeId: string): ContentInterface[] | undefined => {
  return streamingBuffers.get(nodeId)?.content;
};

export const finalizeStreamingBuffer = (nodeId: string): ContentInterface[] => {
  const content = getBufferedContent(nodeId) ?? [];
  streamingBuffers.delete(nodeId);
  streamingListeners.delete(nodeId);
  return content;
};

export const hasActiveStreamingBuffers = (): boolean => streamingBuffers.size > 0;

export const isBufferingNode = (nodeId: string): boolean => streamingBuffers.has(nodeId);

export const clearStreamingBuffersForTest = (): void => {
  streamingBuffers.clear();
  streamingListeners.clear();
  stopSnapshotFlush();
};

// ---------------------------------------------------------------------------
// Periodic snapshot flush — persists streaming buffer to IndexedDB every N seconds
// ---------------------------------------------------------------------------

const SNAPSHOT_FLUSH_INTERVAL_MS = 5_000;

let snapshotFlushTimer: ReturnType<typeof setInterval> | null = null;
let snapshotFlushCallback: (() => void) | null = null;

/**
 * Register a callback to be invoked on each snapshot flush tick.
 * Call once at app bootstrap.  The timer auto-starts/stops based on
 * whether there are active streaming buffers.
 */
export const registerSnapshotFlushCallback = (onFlush: () => void): void => {
  snapshotFlushCallback = onFlush;
};

/** Called internally when a streaming buffer is first created. */
export const ensureSnapshotFlushRunning = (): void => {
  if (snapshotFlushTimer != null || !snapshotFlushCallback) return;
  snapshotFlushTimer = setInterval(() => {
    if (streamingBuffers.size === 0) {
      stopSnapshotFlush();
      return;
    }
    snapshotFlushCallback?.();
  }, SNAPSHOT_FLUSH_INTERVAL_MS);
};

export const stopSnapshotFlush = (): void => {
  if (snapshotFlushTimer != null) {
    clearInterval(snapshotFlushTimer);
    snapshotFlushTimer = null;
  }
};

// ---------------------------------------------------------------------------
// Streaming subscription (useSyncExternalStore support)
// ---------------------------------------------------------------------------

const streamingListeners = new Map<string, Set<() => void>>();

export const notifyStreamingUpdate = (nodeId: string): void => {
  streamingListeners.get(nodeId)?.forEach((cb) => cb());
};

export const subscribeToStreaming = (
  nodeId: string,
  callback: () => void
): (() => void) => {
  let listeners = streamingListeners.get(nodeId);
  if (!listeners) {
    listeners = new Set();
    streamingListeners.set(nodeId, listeners);
  }
  listeners.add(callback);
  return () => {
    listeners!.delete(callback);
    if (listeners!.size === 0) streamingListeners.delete(nodeId);
  };
};

export const finalizeStreamingSnapshotState = (
  chats: ChatInterface[] | undefined,
  contentStore: ContentStoreData
): {
  chats: ChatInterface[] | undefined;
  contentStore: ContentStoreData;
  changed: boolean;
} => {
  if (!chats || chats.length === 0) {
    return { chats, contentStore, changed: false };
  }

  let updatedChats = chats;
  let updatedContentStore = contentStore;
  let changed = false;
  const rematerializedChatIndexes = new Set<number>();

  chats.forEach((chat, chatIndex) => {
    const tree = chat.branchTree;
    if (!tree) return;

    Object.values(tree.nodes).forEach((node) => {
      if (!isStreamingContentHash(node.contentHash)) return;

      const nodeId = getStreamingNodeIdFromHash(node.contentHash) ?? node.id;
      const bufferedContent = getBufferedContent(nodeId) ?? [];

      if (!changed) {
        updatedChats = chats.slice();
        updatedContentStore = { ...contentStore };
        changed = true;
      }

      if (updatedChats[chatIndex] === chats[chatIndex]) {
        updatedChats = cloneChatAt(updatedChats, chatIndex);
      }

      const updatedChat = updatedChats[chatIndex];
      const updatedTree = updatedChat.branchTree!;
      updatedTree.nodes[node.id] = {
        ...updatedTree.nodes[node.id],
        contentHash: addContent(updatedContentStore, bufferedContent),
      };
      rematerializedChatIndexes.add(chatIndex);
    });
  });

  rematerializedChatIndexes.forEach((chatIndex) => {
    const chat = updatedChats![chatIndex];
    if (!chat.branchTree) return;
    chat.messages = materializeActivePath(chat.branchTree, updatedContentStore);
  });

  return { chats: updatedChats, contentStore: updatedContentStore, changed };
};
