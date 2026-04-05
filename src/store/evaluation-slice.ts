import { StoreSlice } from './store';
import type {
  EvaluationSettings,
  EvaluationTriggerMode,
  EvaluationResult,
  EvaluationResultMap,
  QualityThresholds,
  QualityScores,
  QualityAxisThreshold,
} from '@type/evaluation';
import { defaultQualityThresholds } from '@type/evaluation';

export interface EvaluationSlice {
  evaluationSettings: EvaluationSettings;
  qualityThresholds: QualityThresholds;
  evaluationResults: EvaluationResultMap;
  /** Currently running evaluation keys (for loading indicators) */
  evaluationPending: Record<string, boolean>;
  setEvaluationSetting: (
    key: keyof EvaluationSettings,
    mode: EvaluationTriggerMode
  ) => void;
  setQualityThreshold: (
    axis: keyof QualityScores,
    threshold: QualityAxisThreshold
  ) => void;
  setEvaluationResult: (key: string, result: EvaluationResult) => void;
  clearEvaluationResult: (key: string) => void;
  setEvaluationPending: (key: string, pending: boolean) => void;
}

const defaultSettings: EvaluationSettings = {
  safetyPreSend: 'manual',
  safetyPostReceive: 'manual',
  qualityPreSend: 'manual',
  qualityPostReceive: 'manual',
};

export const createEvaluationSlice: StoreSlice<EvaluationSlice> = (set, get) => ({
  evaluationSettings: defaultSettings,
  qualityThresholds: defaultQualityThresholds,
  evaluationResults: {},
  evaluationPending: {},

  setQualityThreshold: (axis, threshold) => {
    set((prev: EvaluationSlice) => ({
      qualityThresholds: { ...prev.qualityThresholds, [axis]: threshold },
    }));
  },

  setEvaluationSetting: (key, mode) => {
    const current = get().evaluationSettings[key];
    if (current === mode) return;
    set((prev: EvaluationSlice) => ({
      evaluationSettings: { ...prev.evaluationSettings, [key]: mode },
    }));
  },

  setEvaluationResult: (key, result) => {
    set((prev: EvaluationSlice) => ({
      evaluationResults: { ...prev.evaluationResults, [key]: result },
    }));
  },

  clearEvaluationResult: (key) => {
    const results = get().evaluationResults;
    if (!(key in results)) return;
    const next = { ...results };
    delete next[key];
    set((prev: EvaluationSlice) => ({
      evaluationResults: next,
    }));
  },

  setEvaluationPending: (key, pending) => {
    set((prev: EvaluationSlice) => ({
      evaluationPending: { ...prev.evaluationPending, [key]: pending },
    }));
  },
});
