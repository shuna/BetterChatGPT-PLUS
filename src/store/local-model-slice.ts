import type { StoreSlice } from './store';
import type {
  LocalModelDefinition,
  LocalModelTask,
} from '@src/local-llm/types';
import type { SavedModelMeta } from '@src/local-llm/storage';

export interface LocalModelSlice {
  localModelEnabled: boolean;
  localModels: LocalModelDefinition[];
  /** Task → model ID mapping (which model is active for each task) */
  activeLocalModels: Partial<Record<LocalModelTask, string>>;
  /** OPFS storage metadata keyed by model ID — separate from definitions */
  savedModelMeta: Record<string, SavedModelMeta>;
  /** IDs of local models marked as favorites (shown in chat model selector) */
  favoriteLocalModelIds: string[];
  /** Execution strategy for multi-model scenarios (gen + eval) */
  localModelExecutionMode: 'sequential' | 'parallel-if-possible';

  setLocalModelEnabled: (enabled: boolean) => void;
  addLocalModel: (def: LocalModelDefinition) => void;
  removeLocalModel: (id: string) => void;
  updateLocalModel: (id: string, patch: Partial<LocalModelDefinition>) => void;
  setActiveLocalModel: (task: LocalModelTask, modelId: string | null) => void;
  updateSavedModelMeta: (id: string, patch: Partial<SavedModelMeta>) => void;
  removeSavedModelMeta: (id: string) => void;
  toggleFavoriteLocalModel: (id: string) => void;
  setLocalModelExecutionMode: (mode: 'sequential' | 'parallel-if-possible') => void;
}

export const createLocalModelSlice: StoreSlice<LocalModelSlice> = (set, get) => ({
  localModelEnabled: false,
  localModels: [],
  activeLocalModels: {},
  savedModelMeta: {},
  favoriteLocalModelIds: [],
  localModelExecutionMode: 'sequential',

  setLocalModelEnabled: (enabled) => {
    set({ localModelEnabled: enabled });
  },

  addLocalModel: (def) => {
    const existing = get().localModels;
    if (existing.some((m) => m.id === def.id)) return;
    set({ localModels: [...existing, def] });
  },

  removeLocalModel: (id) => {
    const models = get().localModels.filter((m) => m.id !== id);
    const active = { ...get().activeLocalModels };
    // Remove from active assignments if this model was active
    for (const task of Object.keys(active) as LocalModelTask[]) {
      if (active[task] === id) {
        delete active[task];
      }
    }
    const favorites = get().favoriteLocalModelIds.filter((fid) => fid !== id);
    set({ localModels: models, activeLocalModels: active, favoriteLocalModelIds: favorites });
  },

  updateLocalModel: (id, patch) => {
    const models = get().localModels.map((m) =>
      m.id === id ? { ...m, ...patch } : m,
    );
    set({ localModels: models });
  },

  setActiveLocalModel: (task, modelId) => {
    const active = { ...get().activeLocalModels };
    if (modelId === null) {
      delete active[task];
    } else {
      active[task] = modelId;
    }
    set({ activeLocalModels: active });
  },

  updateSavedModelMeta: (id, patch) => {
    const current = get().savedModelMeta;
    const existing = current[id] ?? {
      storageState: 'none',
      storedBytes: 0,
      storedFiles: [],
    };
    set({
      savedModelMeta: {
        ...current,
        [id]: { ...existing, ...patch },
      },
    });
  },

  removeSavedModelMeta: (id) => {
    const { [id]: _, ...rest } = get().savedModelMeta;
    set({ savedModelMeta: rest });
  },

  toggleFavoriteLocalModel: (id) => {
    const current = get().favoriteLocalModelIds;
    if (current.includes(id)) {
      set({ favoriteLocalModelIds: current.filter((fid) => fid !== id) });
    } else {
      set({ favoriteLocalModelIds: [...current, id] });
    }
  },

  setLocalModelExecutionMode: (mode) => {
    set({ localModelExecutionMode: mode });
  },
});
