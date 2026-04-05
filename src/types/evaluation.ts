/** Evaluation feature types */

/** Trigger mode for each evaluation dimension */
export type EvaluationTriggerMode = 'manual' | 'auto';

/**
 * Safety evaluation engine.
 * - remote: OpenAI Moderation API only (default)
 * - local: local classifier screening only
 * - hybrid: local screening first + remote verification
 *   (hybrid shows local results immediately, not a speed optimization)
 */
export type SafetyEngineMode = 'remote' | 'local' | 'hybrid';

/** The 4 evaluation slots: safety/quality × pre-send/post-receive */
export interface EvaluationSettings {
  safetyPreSend: EvaluationTriggerMode;
  safetyPostReceive: EvaluationTriggerMode;
  qualityPreSend: EvaluationTriggerMode;
  qualityPostReceive: EvaluationTriggerMode;
  /** Which engine(s) to use for safety checks */
  safetyEngine: SafetyEngineMode;
  /** In hybrid mode: run remote even when local says safe (default: true for false-negative safety) */
  hybridRemoteOnSafe: boolean;
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

/** Per-category safety thresholds: score < review → safe, score < block → review, else → block */
export interface SafetyCategoryThreshold {
  review: number;
  block: number;
}

export type SafetyThresholds = Record<keyof ModerationCategories, SafetyCategoryThreshold>;

export const defaultSafetyThresholds: SafetyThresholds = {
  sexual: { review: 0.8, block: 0.95 },
  hate: { review: 0.7, block: 0.9 },
  harassment: { review: 0.75, block: 0.92 },
  'self-harm': { review: 0.55, block: 0.85 },
  'sexual/minors': { review: 0.08, block: 0.2 },
  'hate/threatening': { review: 0.35, block: 0.7 },
  'violence/graphic': { review: 0.55, block: 0.82 },
  violence: { review: 0.75, block: 0.93 },
  'harassment/threatening': { review: 0.45, block: 0.75 },
  'self-harm/intent': { review: 0.35, block: 0.7 },
  'self-harm/instructions': { review: 0.2, block: 0.45 },
  illicit: { review: 0.7, block: 0.9 },
  'illicit/violent': { review: 0.25, block: 0.55 },
};

export type SafetyStatus = 'safe' | 'review' | 'block';

export function getSafetyStatus(
  score: number,
  threshold: SafetyCategoryThreshold
): SafetyStatus {
  if (score >= threshold.block) return 'block';
  if (score >= threshold.review) return 'review';
  return 'safe';
}

export function summarizeSafetyScores(
  scores: Partial<ModerationCategoryScores>,
  thresholds: SafetyThresholds
): {
  status: SafetyStatus;
  reviewCategories: (keyof ModerationCategories)[];
  blockCategories: (keyof ModerationCategories)[];
} {
  const reviewCategories: (keyof ModerationCategories)[] = [];
  const blockCategories: (keyof ModerationCategories)[] = [];

  for (const category of moderationCategoryKeys) {
    const score = scores[category];
    if (typeof score !== 'number') continue;
    const status = getSafetyStatus(score, thresholds[category]);
    if (status === 'block') {
      blockCategories.push(category);
    } else if (status === 'review') {
      reviewCategories.push(category);
    }
  }

  return {
    status: blockCategories.length > 0 ? 'block' : reviewCategories.length > 0 ? 'review' : 'safe',
    reviewCategories,
    blockCategories,
  };
}

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

/** Quality evaluation mode determines which prompt/axes set to use */
export type QualityEvaluationMode = 'user' | 'assistant' | 'system';

/** System-specific quality evaluation axes */
export interface SystemQualityScores {
  /** Clarity of role definition */
  roleClarity: number;
  /** Consistency of constraints and priorities */
  constraintConsistency: number;
  /** Adequacy of safety constraints */
  safetyAdequacy: number;
  /** Brevity vs verbosity */
  conciseness: number;
  /** Practical usability */
  operability: number;
}

export const systemQualityAxisKeys: (keyof SystemQualityScores)[] = [
  'roleClarity',
  'constraintConsistency',
  'safetyAdequacy',
  'conciseness',
  'operability',
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

/** Standard quality result (user/assistant evaluation) */
export interface StandardQualityEvaluationResult {
  kind: 'standard';
  scores: QualityScores;
  reasoning: Partial<Record<keyof QualityScores, string>>;
  promptSuggestions: string[];
  configSuggestions: string[];
  timestamp: number;
}

/** System role quality result */
export interface SystemQualityEvaluationResult {
  kind: 'system';
  scores: SystemQualityScores;
  reasoning: Partial<Record<keyof SystemQualityScores, string>>;
  promptSuggestions: string[];
  configSuggestions: string[];
  timestamp: number;
}

/** Result from quality evaluation (LLM-as-Judge) */
export type QualityEvaluationResult =
  | StandardQualityEvaluationResult
  | SystemQualityEvaluationResult;

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

// ---------------------------------------------------------------------------
// Local evaluation types (supplementary, not replacing remote evaluation)
// ---------------------------------------------------------------------------

/**
 * Local moderation screening result.
 * NOT a replacement for remote 13-category moderation.
 * Used as a lightweight first-pass triage.
 */
export interface LocalModerationResult {
  screening: 'safe' | 'warn' | 'block-candidate';
  rawScores: { label: string; score: number }[];
  source: 'local';
  timestamp: number;
}

/**
 * Local quality hint (experimental).
 * Coarse 3-level grade from a small local model.
 * Should be displayed as a reference hint, not authoritative scoring.
 */
export interface LocalQualityHint {
  grade: 'good' | 'fair' | 'poor';
  comment: string;
  source: 'local';
  timestamp: number;
}

/** Evaluation result attached to a message */
export interface EvaluationResult {
  /** Which phase this evaluation was for */
  phase: 'pre-send' | 'post-receive';
  safety?: SafetyCheckResult;
  quality?: QualityEvaluationResult;
  /** Local moderation screening (supplementary) */
  localSafety?: LocalModerationResult;
  /** Local quality hint (experimental, supplementary) */
  localQualityHint?: LocalQualityHint;
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
