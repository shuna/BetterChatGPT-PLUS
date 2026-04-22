import { StoreSlice } from './store';
import { Role } from '@type/chat';

/** Key used for the sticky (new-message) composer. */
export const STICKY_PREFILL_KEY = '__sticky__';

export interface InputSlice {
  inputRole: Role;
  setInputRole: (inputRole: Role) => void;
  /** Per-node assistant prefill drafts. Key is nodeId or STICKY_PREFILL_KEY. */
  assistantPrefillMap: Record<string, string>;
  setAssistantPrefill: (nodeId: string, text: string) => void;
  clearAssistantPrefill: (nodeId: string) => void;
}

export const createInputSlice: StoreSlice<InputSlice> = (set, _get) => ({
  inputRole: 'user',
  setInputRole: (inputRole: Role) => {
    set((prev: InputSlice) => ({ ...prev, inputRole }));
  },
  assistantPrefillMap: {},
  setAssistantPrefill: (nodeId: string, text: string) => {
    set((prev: InputSlice) => ({
      ...prev,
      assistantPrefillMap: { ...(prev.assistantPrefillMap ?? {}), [nodeId]: text },
    }));
  },
  clearAssistantPrefill: (nodeId: string) => {
    set((prev: InputSlice) => {
      const next = { ...(prev.assistantPrefillMap ?? {}) };
      delete next[nodeId];
      return { ...prev, assistantPrefillMap: next };
    });
  },
});
