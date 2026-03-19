import { create } from 'zustand';

export type DebugStatus = 'idle' | 'active' | 'error' | 'done';

export interface DebugEntry {
  id: string;
  label: string;
  status: DebugStatus;
  detail?: string;
  updatedAt: number;
}

interface DebugStore {
  entries: Record<string, DebugEntry>;
  update: (id: string, patch: Partial<Omit<DebugEntry, 'id'>>) => void;
  remove: (id: string) => void;
}

const DONE_TTL = 30_000;

export const useDebugStore = create<DebugStore>((set, get) => ({
  entries: {},
  update: (id, patch) => {
    const prev = get().entries[id];
    const entry: DebugEntry = {
      id,
      label: patch.label ?? prev?.label ?? id,
      status: patch.status ?? prev?.status ?? 'idle',
      detail: patch.detail ?? prev?.detail,
      updatedAt: Date.now(),
    };
    set({ entries: { ...get().entries, [id]: entry } });

    if (entry.status === 'done') {
      setTimeout(() => {
        const current = get().entries[id];
        if (current && current.status === 'done') {
          const { [id]: _, ...rest } = get().entries;
          set({ entries: rest });
        }
      }, DONE_TTL);
    }
  },
  remove: (id) => {
    const { [id]: _, ...rest } = get().entries;
    set({ entries: rest });
  },
}));

/** Non-React helper for calling from plain functions */
export const debugReport = (
  id: string,
  patch: Partial<Omit<DebugEntry, 'id'>>
) => useDebugStore.getState().update(id, patch);
