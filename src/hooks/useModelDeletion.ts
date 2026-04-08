import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { localModelRuntime } from '@src/local-llm/runtime';
import { deleteModel } from '@src/local-llm/storage';
import { ASSIGNABLE_TASKS } from '@src/components/SettingsMenu/localModelConstants';

export interface DeleteModelOpts {
  /** Abort controller map — will abort + clean up if an active download exists */
  abortControllers?: React.MutableRefObject<Record<string, AbortController>>;
  /** Called to clear download progress state */
  clearProgress?: (modelId: string) => void;
  /** Called after successful deletion (e.g. to clear sticky downloads) */
  onDeleted?: () => void;
}

export function useModelDeletion() {
  const { t } = useTranslation('main');

  const deleteWithConfirm = useCallback(async (modelId: string, opts?: DeleteModelOpts): Promise<boolean> => {
    if (!window.confirm(t('localModel.confirmDelete') as string)) return false;

    // Abort active download if any
    if (opts?.abortControllers) {
      opts.abortControllers.current[modelId]?.abort();
      delete opts.abortControllers.current[modelId];
    }

    // Clear download progress
    opts?.clearProgress?.(modelId);

    // Unload from runtime if loaded
    if (localModelRuntime.isLoaded(modelId)) {
      await localModelRuntime.unloadModel(modelId);
    }

    // Clear task assignments pointing to this model
    const store = useStore.getState();
    for (const task of ASSIGNABLE_TASKS) {
      if (store.activeLocalModels[task] === modelId) {
        store.setActiveLocalModel(task, null);
      }
    }

    // Delete from storage and store
    await deleteModel(modelId);
    store.removeSavedModelMeta(modelId);
    store.removeLocalModel(modelId);

    opts?.onDeleted?.();
    return true;
  }, [t]);

  return { deleteWithConfirm };
}
