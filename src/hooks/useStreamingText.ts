import { useCallback, useSyncExternalStore } from 'react';
import {
  peekBufferedContent,
  subscribeToStreaming,
} from '@utils/streamingBuffer';
import { isTextContent } from '@type/chat';

const EMPTY_UNSUB = () => {};

/**
 * Subscribe to live streaming text for a specific node.
 *
 * Returns the latest text from the streaming buffer when the node is actively
 * streaming, or `undefined` when no buffer exists (not streaming / finalized).
 *
 * Uses `useSyncExternalStore` so that ONLY the component calling this hook
 * re-renders on each chunk — the Zustand store is not involved.
 */
export function useStreamingText(
  nodeId: string | undefined
): string | undefined {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!nodeId) return EMPTY_UNSUB;
      return subscribeToStreaming(nodeId, callback);
    },
    [nodeId]
  );

  const getSnapshot = useCallback(() => {
    if (!nodeId) return undefined;
    const content = peekBufferedContent(nodeId);
    if (!content || content.length === 0) return undefined;
    const first = content[0];
    return isTextContent(first) ? first.text : undefined;
  }, [nodeId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
