import { StoreSlice } from './store';
import type {
  EvaluationSettings,
  EvaluationTriggerMode,
  EvaluationResult,
  EvaluationResultMap,
  SafetyThresholds,
  QualityThresholds,
  QualityScores,
  QualityAxisThreshold,
  ModerationCategories,
  SafetyCategoryThreshold,
  SafetyEngineMode,
  AxisProgressMap,
} from '@type/evaluation';
import { defaultQualityThresholds, defaultSafetyThresholds } from '@type/evaluation';

export interface EvaluationSlice {
  evaluationSettings: EvaluationSettings;
  safetyThresholds: SafetyThresholds;
  qualityThresholds: QualityThresholds;
  evaluationResults: EvaluationResultMap;
  /** Currently running evaluation keys (for loading indicators) */
  evaluationPending: Record<string, boolean>;
  /** Per-axis progress for local quality evaluation (keyed same as evaluationPending) */
  evaluationAxisProgress: Record<string, AxisProgressMap>;
  setEvaluationSetting: (
    key: keyof EvaluationSettings,
    mode: EvaluationTriggerMode
  ) => void;
  setQualityThreshold: (
    axis: keyof QualityScores,
    threshold: QualityAxisThreshold
  ) => void;
  setSafetyThreshold: (
    category: keyof ModerationCategories,
    threshold: SafetyCategoryThreshold
  ) => void;
  setEvaluationResult: (key: string, result: EvaluationResult) => void;
  clearEvaluationResult: (key: string) => void;
  setEvaluationPending: (key: string, pending: boolean) => void;
  setSafetyEngine: (mode: SafetyEngineMode) => void;
  setHybridRemoteOnSafe: (enabled: boolean) => void;
  setEvaluationAxisProgress: (key: string, progress: AxisProgressMap) => void;
  clearEvaluationAxisProgress: (key: string) => void;
}

const defaultSettings: EvaluationSettings = {
  safetyPreSend: 'manual',
  safetyPostReceive: 'manual',
  qualityPreSend: 'manual',
  qualityPostReceive: 'manual',
  safetyEngine: 'remote',
  hybridRemoteOnSafe: true,
};

export const createEvaluationSlice: StoreSlice<EvaluationSlice> = (set, get) => ({
  evaluationSettings: defaultSettings,
  safetyThresholds: defaultSafetyThresholds,
  qualityThresholds: defaultQualityThresholds,
  evaluationResults: {},
  evaluationPending: {},
  evaluationAxisProgress: {},

  setSafetyThreshold: (category, threshold) => {
    set((prev: EvaluationSlice) => ({
      safetyThresholds: { ...prev.safetyThresholds, [category]: threshold },
    }));
  },

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

  setSafetyEngine: (mode) => {
    set((prev: EvaluationSlice) => ({
      evaluationSettings: { ...prev.evaluationSettings, safetyEngine: mode },
    }));
  },

  setHybridRemoteOnSafe: (enabled) => {
    set((prev: EvaluationSlice) => ({
      evaluationSettings: { ...prev.evaluationSettings, hybridRemoteOnSafe: enabled },
    }));
  },

  setEvaluationAxisProgress: (key, progress) => {
    set((prev: EvaluationSlice) => ({
      evaluationAxisProgress: {
        ...prev.evaluationAxisProgress,
        [key]: { ...(prev.evaluationAxisProgress[key] ?? {}), ...progress },
      },
    }));
  },

  clearEvaluationAxisProgress: (key) => {
    set((prev: EvaluationSlice) => {
      const next = { ...prev.evaluationAxisProgress };
      delete next[key];
      return { evaluationAxisProgress: next };
    });
  },
});
