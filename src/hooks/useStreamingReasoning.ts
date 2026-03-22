import { useCallback, useSyncExternalStore } from 'react';
import {
  peekBufferedReasoning,
  subscribeToStreaming,
} from '@utils/streamingBuffer';

const EMPTY_UNSUB = () => {};

/**
 * Subscribe to live streaming reasoning text for a specific node.
 *
 * Returns the latest reasoning text from the streaming buffer when the node
 * is actively streaming, or `undefined` when no buffer exists.
 *
 * Uses `useSyncExternalStore` so that ONLY the component calling this hook
 * re-renders on each chunk — the Zustand store is not involved.
 */
export function useStreamingReasoning(
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
    return peekBufferedReasoning(nodeId);
  }, [nodeId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
