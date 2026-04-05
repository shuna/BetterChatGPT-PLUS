import type { StoreSlice } from './store';
import type {
  LocalModelDefinition,
  LocalModelTask,
} from '@src/local-llm/types';

export interface LocalModelSlice {
  localModelEnabled: boolean;
  localModels: LocalModelDefinition[];
  /** Task → model ID mapping (which model is active for each task) */
  activeLocalModels: Partial<Record<LocalModelTask, string>>;

  setLocalModelEnabled: (enabled: boolean) => void;
  addLocalModel: (def: LocalModelDefinition) => void;
  removeLocalModel: (id: string) => void;
  updateLocalModel: (id: string, patch: Partial<LocalModelDefinition>) => void;
  setActiveLocalModel: (task: LocalModelTask, modelId: string | null) => void;
}

export const createLocalModelSlice: StoreSlice<LocalModelSlice> = (set, get) => ({
  localModelEnabled: false,
  localModels: [],
  activeLocalModels: {},

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
    set({ localModels: models, activeLocalModels: active });
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
});
