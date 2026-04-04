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

/** Evaluation result attached to a message */
export interface EvaluationResult {
  /** Which phase this evaluation was for */
  phase: 'pre-send' | 'post-receive';
  safety?: SafetyCheckResult;
  quality?: QualityEvaluationResult;
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
