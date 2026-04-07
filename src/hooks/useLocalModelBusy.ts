import { useSyncExternalStore, useCallback, useRef } from 'react';
import { localModelRuntime } from '@src/local-llm/runtime';
import type { LocalModelBusyReason } from '@src/local-llm/types';

interface LocalModelBusyState {
  isBusy: boolean;
  busyReason?: LocalModelBusyReason;
}

const NOT_BUSY: LocalModelBusyState = { isBusy: false };

/**
 * Subscribe to the busy state of a specific local model by ID.
 *
 * Uses `useSyncExternalStore` to efficiently track changes from `localModelRuntime`.
 * If modelId is null, always returns `{ isBusy: false }`.
 */
export function useLocalModelBusy(modelId: string | null): LocalModelBusyState {
  const subscribe = useCallback(
    (onStoreChange: () => void) => localModelRuntime.subscribe(onStoreChange),
    [],
  );

  const lastRef = useRef<LocalModelBusyState>(NOT_BUSY);

  const getSnapshot = useCallback(() => {
    if (!modelId) return NOT_BUSY;
    const busy = localModelRuntime.isBusy(modelId);
    const reason = busy ? localModelRuntime.getBusyReason(modelId) : undefined;
    const prev = lastRef.current;
    if (prev.isBusy === busy && prev.busyReason === reason) return prev;
    const next: LocalModelBusyState = { isBusy: busy, busyReason: reason };
    lastRef.current = next;
    return next;
  }, [modelId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
