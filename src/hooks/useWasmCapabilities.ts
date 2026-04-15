import { useSyncExternalStore, useCallback, useRef } from 'react';
import { localModelRuntime } from '@src/local-llm/runtime';
import type { WasmCapabilities } from '@src/local-llm/runtime';

/**
 * Read WASM capabilities for a loaded local model.
 *
 * Returns null when the model has not been loaded yet (capabilities are
 * detected during worker initialisation, i.e. at model-load time).
 */
export function useWasmCapabilities(modelId: string | null): WasmCapabilities | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => localModelRuntime.subscribe(onStoreChange),
    [],
  );

  const lastRef = useRef<WasmCapabilities | null>(null);

  const getSnapshot = useCallback(() => {
    if (!modelId) return null;
    const caps = localModelRuntime.getWasmCapabilities(modelId);
    const prev = lastRef.current;
    if (
      prev !== null &&
      caps !== null &&
      prev.webgpu === caps.webgpu &&
      prev.memory64 === caps.memory64 &&
      prev.multiThread === caps.multiThread
    ) {
      return prev;
    }
    lastRef.current = caps;
    return caps;
  }, [modelId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
