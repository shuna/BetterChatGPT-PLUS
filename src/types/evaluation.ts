/** Evaluation feature types */

/** Trigger mode for each evaluation dimension */
export type EvaluationTriggerMode = 'manual' | 'auto';

/** The 4 evaluation slots: safety/quality × pre-send/post-receive */
export interface EvaluationSettings {
  safetyPreSend: EvaluationTriggerMode;
  safetyPostReceive: EvaluationTriggerMode;
  qualityPreSend: EvaluationTriggerMode;
  qualityPostReceive: EvaluationTriggerMode;
}

/** OpenAI Moderation API category flags */
export interface ModerationCategories {
  sexual: boolean;
  hate: boolean;
  harassment: boolean;
  'self-harm': boolean;
  'sexual/minors': boolean;
  'hate/threatening': boolean;
  'violence/graphic': boolean;
  violence: boolean;
  'harassment/threatening': boolean;
  'self-harm/intent': boolean;
  'self-harm/instructions': boolean;
  illicit: boolean;
  'illicit/violent': boolean;
}

/** All moderation category keys in API order */
export const moderationCategoryKeys: (keyof ModerationCategories)[] = [
  'sexual', 'hate', 'harassment', 'self-harm', 'sexual/minors',
  'hate/threatening', 'violence/graphic', 'violence',
  'harassment/threatening', 'self-harm/intent', 'self-harm/instructions',
  'illicit', 'illicit/violent',
];

/** Convert API category key (e.g. "self-harm/intent") to i18n key (e.g. "selfHarmIntent") */
export function categoryToI18nKey(cat: string): string {
  return cat.replace(/[/-](\w)/g, (_, c) => c.toUpperCase());
}

/** OpenAI Moderation API category scores */
export type ModerationCategoryScores = Record<keyof ModerationCategories, number>;

/** Result from safety check (moderation API) */
export interface SafetyCheckResult {
  flagged: boolean;
  categories: Partial<ModerationCategories>;
  categoryScores: Partial<ModerationCategoryScores>;
  timestamp: number;
}

/** G-Eval style quality evaluation axes */
export interface QualityScores {
  /** Whether the response addresses the prompt's requests */
  taskCompletion: number;
  /** Factual correctness and grounding */
  faithfulness: number;
  /** Logical coherence */
  coherence: number;
  /** Brevity — lack of unnecessary content */
  conciseness: number;
  /** Adherence to explicit instructions (format, language, constraints) */
  instructionFollowing: number;
}

export const qualityAxisKeys: (keyof QualityScores)[] = [
  'taskCompletion',
  'faithfulness',
  'coherence',
  'conciseness',
  'instructionFollowing',
];

/** Per-axis quality thresholds: score < red → red, score < green → yellow, else → green */
export interface QualityAxisThreshold {
  red: number;
  green: number;
}

export type QualityThresholds = Record<keyof QualityScores, QualityAxisThreshold>;

export const defaultQualityThresholds: QualityThresholds = {
  taskCompletion: { red: 0.5, green: 0.8 },
  faithfulness: { red: 0.5, green: 0.8 },
  coherence: { red: 0.5, green: 0.8 },
  conciseness: { red: 0.5, green: 0.8 },
  instructionFollowing: { red: 0.5, green: 0.8 },
};

/** Result from quality evaluation (LLM-as-Judge) */
export interface QualityEvaluationResult {
  scores: QualityScores;
  /** Per-axis justification from the judge */
  reasoning: Partial<Record<keyof QualityScores, string>>;
  /** Concrete suggestions for improving the prompt */
  promptSuggestions: string[];
  /** Suggestions for model / parameter changes */
  configSuggestions: string[];
  timestamp: number;
}

/** Evaluation scope: single prompt vs full conversation context */
export type EvaluationScope = 'single' | 'full-context';

/** How omitted messages are handled when scope is full-context */
export type EvaluationOmittedMode = 'respect-omitted' | 'include-omitted';

/** Metadata describing the conditions under which an evaluation was run */
export interface EvaluationContextInfo {
  scope: EvaluationScope;
  /** Only meaningful when scope is 'full-context' */
  omittedMode: EvaluationOmittedMode;
}

/** Evaluation result attached to a message */
export interface EvaluationResult {
  /** Which phase this evaluation was for */
  phase: 'pre-send' | 'post-receive';
  safety?: SafetyCheckResult;
  quality?: QualityEvaluationResult;
  /** Conditions under which the safety evaluation was run */
  safetyContext?: EvaluationContextInfo;
  /** Conditions under which the quality evaluation was run */
  qualityContext?: EvaluationContextInfo;
}

/** Map from "chatId:nodeId:phase" to evaluation result */
export type EvaluationResultMap = Record<string, EvaluationResult>;

export function evaluationResultKey(
  chatId: string,
  nodeId: string,
  phase: 'pre-send' | 'post-receive'
): string {
  return `${chatId}:${nodeId}:${phase}`;
}
