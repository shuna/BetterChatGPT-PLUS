import { create } from 'zustand';

export type DebugStatus = 'idle' | 'active' | 'error' | 'done';

export interface DebugEntry {
  id: string;
  label: string;
  status: DebugStatus;
  detail?: string;
  updatedAt: number;
}

export interface DebugLogLine {
  id: string;
  timestamp: number;
  source: string;
  level: string;
  message: string;
}

interface DebugStore {
  entries: Record<string, DebugEntry>;
  logs: DebugLogLine[];
  update: (id: string, patch: Partial<Omit<DebugEntry, 'id'>>) => void;
  appendLog: (line: Omit<DebugLogLine, 'id' | 'timestamp'> & { timestamp?: number }) => void;
  clearLogs: () => void;
  remove: (id: string) => void;
}

const DONE_TTL = 30_000;
const MAX_LOG_LINES = 500;

export const useDebugStore = create<DebugStore>((set, get) => ({
  entries: {},
  logs: [],
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
  appendLog: (line) => {
    const timestamp = line.timestamp ?? Date.now();
    const id = `${timestamp}:${Math.random().toString(36).slice(2)}`;
    const next: DebugLogLine = {
      id,
      timestamp,
      source: line.source,
      level: line.level,
      message: line.message,
    };
    set({ logs: [...get().logs, next].slice(-MAX_LOG_LINES) });
  },
  clearLogs: () => {
    const entries = get().entries;
    const activeEntries = Object.fromEntries(
      Object.entries(entries).filter(([, entry]) => entry.status !== 'done')
    );
    set({ logs: [], entries: activeEntries });
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

export const debugLog = (
  line: Omit<DebugLogLine, 'id' | 'timestamp'> & { timestamp?: number }
) => useDebugStore.getState().appendLog(line);
