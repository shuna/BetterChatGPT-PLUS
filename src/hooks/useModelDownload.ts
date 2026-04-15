import { useCallback, useRef, useState } from 'react';
import useStore from '@store/store';
import type { DownloadProgress, DownloadCallbacks } from '@src/local-llm/download';

export interface StartDownloadOpts {
  /** Files list for onComplete storedFiles update (if known ahead of time) */
  storedFiles?: string[];
  /** Called after successful completion (e.g. to clear sticky downloads) */
  onComplete?: (totalBytes: number) => void;
  /** Called on error */
  onError?: () => void;
  /** True when resuming a partial download — preserves existing storedBytes/storedFiles */
  resume?: boolean;
  /** Translation function for resume fallback message */
  resumeFallbackMsg?: string;
  /** Called whenever OPFS-backed storage may have changed */
  onStorageChanged?: () => void;
}

export function useModelDownload(onStorageChanged?: () => void) {
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, DownloadProgress>>({});
  const [resumeFallbacks, setResumeFallbacks] = useState<Record<string, string>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  const clearProgress = useCallback((modelId: string) => {
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearResumeFallback = useCallback((modelId: string) => {
    setResumeFallbacks((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
  }, [onStorageChanged]);

  /**
   * Build unified download callbacks and invoke the download function.
   * Callers provide the actual download fn; this hook manages all the state tracking.
   */
  const startDownload = useCallback((
    modelId: string,
    downloadFn: (callbacks: DownloadCallbacks, signal: AbortSignal) => void,
    opts?: StartDownloadOpts,
  ) => {
    // Prevent duplicate downloads
    if (abortControllers.current[modelId]) return;

    const controller = new AbortController();
    abortControllers.current[modelId] = controller;

    const store = useStore.getState();
    store.updateSavedModelMeta(modelId, {
      storageState: 'downloading',
      lastError: undefined,
      // Reset byte/file counters for fresh (non-resume) downloads so
      // onFileComplete doesn't accumulate on top of stale partial state.
      ...(!opts?.resume ? { storedBytes: 0, storedFiles: [] } : {}),
    });
    onStorageChanged?.();
    opts?.onStorageChanged?.();

    const callbacks: DownloadCallbacks = {
      onProgress: (p) => {
        setDownloadProgresses((prev) => ({ ...prev, [modelId]: p }));
      },
      onFileComplete: (_fileName, fileSize) => {
        const currentMeta = useStore.getState().savedModelMeta[modelId];
        useStore.getState().updateSavedModelMeta(modelId, {
          storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
          storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
        });
        onStorageChanged?.();
        opts?.onStorageChanged?.();
      },
      onComplete: (totalBytes) => {
        useStore.getState().updateSavedModelMeta(modelId, {
          storageState: 'saved',
          storedBytes: totalBytes,
          storedFiles: opts?.storedFiles ?? useStore.getState().savedModelMeta[modelId]?.storedFiles ?? [],
          lastVerifiedAt: Date.now(),
        });
        setDownloadProgresses((prev) => {
          const { [modelId]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[modelId];
        onStorageChanged?.();
        opts?.onStorageChanged?.();
        opts?.onComplete?.(totalBytes);
      },
      onError: (error) => {
        useStore.getState().updateSavedModelMeta(modelId, {
          storageState: 'partial',
          lastError: error.message,
        });
        setDownloadProgresses((prev) => {
          const { [modelId]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[modelId];
        onStorageChanged?.();
        opts?.onStorageChanged?.();
        opts?.onError?.();
      },
    };

    if (opts?.resumeFallbackMsg) {
      callbacks.onResumeFallback = () => {
        setResumeFallbacks((prev) => ({
          ...prev,
          [modelId]: opts.resumeFallbackMsg!,
        }));
      };
    }

    downloadFn(callbacks, controller.signal);
  }, []);

  const cancelDownload = useCallback((modelId: string) => {
    abortControllers.current[modelId]?.abort();
    delete abortControllers.current[modelId];
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    useStore.getState().updateSavedModelMeta(modelId, {
      storageState: 'partial',
      lastError: undefined,
    });
    onStorageChanged?.();
  }, [onStorageChanged]);

  return {
    downloadProgresses,
    resumeFallbacks,
    abortControllers,
    startDownload,
    cancelDownload,
    clearProgress,
    clearResumeFallback,
  };
}
