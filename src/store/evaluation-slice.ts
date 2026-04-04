import { StoreSlice } from './store';
import type {
  EvaluationSettings,
  EvaluationTriggerMode,
  EvaluationResult,
  EvaluationResultMap,
} from '@type/evaluation';

export interface EvaluationSlice {
  evaluationSettings: EvaluationSettings;
  evaluationResults: EvaluationResultMap;
  /** Currently running evaluation keys (for loading indicators) */
  evaluationPending: Record<string, boolean>;
  setEvaluationSetting: (
    key: keyof EvaluationSettings,
    mode: EvaluationTriggerMode
  ) => void;
  setEvaluationResult: (key: string, result: EvaluationResult) => void;
  clearEvaluationResult: (key: string) => void;
  setEvaluationPending: (key: string, pending: boolean) => void;
}

const defaultSettings: EvaluationSettings = {
  safetyPreSend: 'off',
  safetyPostReceive: 'off',
  qualityPreSend: 'off',
  qualityPostReceive: 'off',
};

export const createEvaluationSlice: StoreSlice<EvaluationSlice> = (set, get) => ({
  evaluationSettings: defaultSettings,
  evaluationResults: {},
  evaluationPending: {},

  setEvaluationSetting: (key, mode) => {
    const current = get().evaluationSettings[key];
    if (current === mode) return;
    set((prev: EvaluationSlice) => ({
      ...prev,
      evaluationSettings: { ...prev.evaluationSettings, [key]: mode },
    }));
  },

  setEvaluationResult: (key, result) => {
    set((prev: EvaluationSlice) => ({
      ...prev,
      evaluationResults: { ...prev.evaluationResults, [key]: result },
    }));
  },

  clearEvaluationResult: (key) => {
    const results = get().evaluationResults;
    if (!(key in results)) return;
    const next = { ...results };
    delete next[key];
    set((prev: EvaluationSlice) => ({
      ...prev,
      evaluationResults: next,
    }));
  },

  setEvaluationPending: (key, pending) => {
    set((prev: EvaluationSlice) => ({
      ...prev,
      evaluationPending: { ...prev.evaluationPending, [key]: pending },
    }));
  },
});
