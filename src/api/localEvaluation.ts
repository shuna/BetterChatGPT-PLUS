/**
 * Local evaluation API — browser-side moderation and quality hints.
 *
 * Uses Transformers.js classification for moderation screening
 * and wllama generation for quality hints.
 */

import { localModelRuntime, promptAsInput } from '@src/local-llm/runtime';
import type { LocalModerationResult, StandardQualityEvaluationResult, QualityScores, AxisProgressState } from '@type/evaluation';
import { qualityAxisKeys } from '@type/evaluation';
import type { LocalModelTask } from '@src/local-llm/types';
import useStore from '@store/store';
import i18next from 'i18next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveModelId(task: LocalModelTask): string | null {
  const state = useStore.getState();
  if (!state.localModelEnabled) return null;
  return state.activeLocalModels[task] ?? null;
}

// ---------------------------------------------------------------------------
// Local moderation (Transformers.js classification)
// ---------------------------------------------------------------------------

/** Screening thresholds for classification scores */
const WARN_THRESHOLD = 0.5;
const BLOCK_THRESHOLD = 0.8;

/**
 * Run local moderation screening using a Transformers.js classifier.
 *
 * Returns a 3-level screening result (safe / warn / block-candidate)
 * that is NOT a replacement for remote 13-category moderation.
 */
export async function runLocalModeration(text: string): Promise<LocalModerationResult> {
  const modelId = getActiveModelId('analysis') ?? getActiveModelId('moderation');
  if (!modelId) {
    throw new Error('No local analysis/moderation model configured');
  }

  // Safety net: ensure the model is loaded before attempting to use it
  await localModelRuntime.ensureLoaded(modelId);

  const engine = localModelRuntime.getTransformersEngine(modelId);
  if (!engine) {
    throw new Error('Local moderation model not loaded');
  }

  const labels = await engine.classify(text, 'moderation');

  // Determine screening level from classification scores.
  // The classifier may return labels like "toxic", "hate", "safe", etc.
  // We look for any "negative" label with high confidence.
  const negativeLabels = labels.filter(
    (l) => !isPositiveLabel(l.label),
  );

  const maxNegativeScore = negativeLabels.length > 0
    ? Math.max(...negativeLabels.map((l) => l.score))
    : 0;

  let screening: LocalModerationResult['screening'] = 'safe';
  if (maxNegativeScore >= BLOCK_THRESHOLD) {
    screening = 'block-candidate';
  } else if (maxNegativeScore >= WARN_THRESHOLD) {
    screening = 'warn';
  }

  return {
    screening,
    rawScores: labels.map((l) => ({ label: l.label, score: l.score })),
    source: 'local',
    timestamp: Date.now(),
  };
}

/**
 * Heuristic: labels that indicate safe/acceptable content.
 * Everything else is treated as potentially negative.
 */
function isPositiveLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower === 'safe' ||
    lower === 'not toxic' ||
    lower === 'acceptable' ||
    lower === 'none' ||
    lower === 'ok' ||
    lower.startsWith('not_') ||
    lower.startsWith('non_')
  );
}

// ---------------------------------------------------------------------------
// Local quality evaluation (wllama generation)
// ---------------------------------------------------------------------------

/** Per-axis prompt labels for each UI language */
const AXIS_LABELS: Record<string, Record<keyof QualityScores, { name: string; question: string }>> = {
  ja: {
    taskCompletion: { name: 'タスク達成度', question: 'この文章は求められた内容をどの程度達成していますか？' },
    faithfulness: { name: '正確性', question: 'この文章の内容は正確で事実に基づいていますか？' },
    coherence: { name: '一貫性', question: 'この文章は論理的に一貫していて読みやすいですか？' },
    conciseness: { name: '簡潔性', question: 'この文章は簡潔で無駄がないですか？' },
    instructionFollowing: { name: '指示遵守', question: 'この文章は指示や制約に従っていますか？' },
  },
  en: {
    taskCompletion: { name: 'Task Completion', question: 'Does this text adequately address what was requested?' },
    faithfulness: { name: 'Faithfulness', question: 'Is this text accurate and factually grounded?' },
    coherence: { name: 'Coherence', question: 'Is this text logically coherent and easy to follow?' },
    conciseness: { name: 'Conciseness', question: 'Is this text concise without unnecessary content?' },
    instructionFollowing: { name: 'Instruction Following', question: 'Does this text follow the given instructions and constraints?' },
  },
};

function getAxisLabels(): Record<keyof QualityScores, { name: string; question: string }> {
  const lang = i18next.language;
  if (lang.startsWith('ja')) return AXIS_LABELS.ja;
  return AXIS_LABELS.en;
}

/**
 * Build a per-axis evaluation prompt.
 */
function buildAxisPrompt(text: string, axisQuestion: string, assistantResponse?: string): string {
  const lang = i18next.language;
  if (lang.startsWith('ja')) {
    if (assistantResponse) {
      return `以下の会話コンテキストとアシスタントの応答について答えてください。\n\nコンテキスト: ${text}\n\nアシスタントの応答: ${assistantResponse}\n\n質問: ${axisQuestion}\n\n回答:`;
    }
    return `以下のテキストについて答えてください。\n\nテキスト: ${text}\n\n質問: ${axisQuestion}\n\n回答:`;
  }
  if (assistantResponse) {
    return `Answer about this conversation context and assistant response.\n\nContext: ${text}\n\nAssistant response: ${assistantResponse}\n\nQuestion: ${axisQuestion}\n\nAnswer:`;
  }
  return `Answer about this text.\n\nText: ${text}\n\nQuestion: ${axisQuestion}\n\nAnswer:`;
}

/**
 * Estimate a score from a short evaluation text using sentiment cues.
 */
function estimateScoreFromText(raw: string): number {
  const trimmed = raw.trim().toLowerCase();
  const rawText = raw.trim();
  const positiveEN = (trimmed.match(/\b(good|great|excellent|well|clear|strong|effective|accurate|concise|yes|adequate|follows)\b/g) || []).length;
  const negativeEN = (trimmed.match(/\b(poor|bad|weak|unclear|confusing|verbose|wrong|inaccurate|lacks?|missing|no|does not|doesn't|fail)\b/g) || []).length;
  const positiveJA = (rawText.match(/(良い|優れ|適切|明確|分かりやすい|簡潔|正確|的確|効果的|丁寧|はい|従って|達成)/g) || []).length;
  const negativeJA = (rawText.match(/(悪い|不適切|不明確|冗長|不正確|曖昧|不足|欠け|問題|いいえ|従っていない|達成していない)/g) || []).length;
  const pos = positiveEN + positiveJA;
  const neg = negativeEN + negativeJA;
  if (pos > neg + 1) return 0.75;
  if (pos > neg) return 0.65;
  if (neg > pos + 1) return 0.30;
  if (neg > pos) return 0.45;
  return 0.55;
}

// Mapping from natural axis names to QualityScores keys
const AXIS_NAME_MAP: Record<string, keyof QualityScores> = {
  'task completion': 'taskCompletion',
  'taskcompletion': 'taskCompletion',
  'task_completion': 'taskCompletion',
  'タスク達成': 'taskCompletion',
  'faithfulness': 'faithfulness',
  '正確性': 'faithfulness',
  '忠実性': 'faithfulness',
  'coherence': 'coherence',
  '一貫性': 'coherence',
  'conciseness': 'conciseness',
  '簡潔性': 'conciseness',
  'instruction following': 'instructionFollowing',
  'instructionfollowing': 'instructionFollowing',
  'instruction_following': 'instructionFollowing',
  '指示遵守': 'instructionFollowing',
};

/**
 * Parse local model output into a StandardQualityEvaluationResult.
 * Three-tier parser: JSON → line-by-line regex → grade fallback.
 */
function parseLocalQualityResponse(raw: string): StandardQualityEvaluationResult {
  const defaultScores = (): QualityScores => ({
    taskCompletion: 0,
    faithfulness: 0,
    coherence: 0,
    conciseness: 0,
    instructionFollowing: 0,
  });

  // --- Tier 1: JSON ---
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1]?.trim() ?? raw.trim();
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.scores === 'object') {
      const scores = defaultScores();
      const reasoning: Partial<Record<keyof QualityScores, string>> = {};
      for (const key of qualityAxisKeys) {
        const val = parsed.scores[key];
        if (typeof val === 'number') {
          scores[key] = val > 1 ? val / 10 : Math.min(1, Math.max(0, val));
        }
        if (parsed.reasoning?.[key]) {
          reasoning[key] = String(parsed.reasoning[key]);
        }
      }
      return {
        kind: 'standard',
        scores,
        reasoning,
        promptSuggestions: Array.isArray(parsed.promptSuggestions) ? parsed.promptSuggestions.map(String) : [],
        configSuggestions: Array.isArray(parsed.configSuggestions) ? parsed.configSuggestions.map(String) : [],
        source: 'local',
        timestamp: Date.now(),
      };
    }
  } catch {
    // Not valid JSON, proceed to Tier 2
  }

  // --- Tier 2: Line-by-line regex ---
  {
    const scores = defaultScores();
    const reasoning: Partial<Record<keyof QualityScores, string>> = {};
    let foundAxes = 0;

    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();

      for (const [name, key] of Object.entries(AXIS_NAME_MAP)) {
        if (lineLower.includes(name)) {
          const scoreMatch = line.match(/[\s:]+(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/);
          if (scoreMatch) {
            let val = parseFloat(scoreMatch[1]);
            if (val > 1) val = val / 10;
            scores[key] = Math.min(1, Math.max(0, val));
            foundAxes++;

            const afterScore = line.slice((scoreMatch.index ?? 0) + scoreMatch[0].length).trim();
            const reasonText = afterScore.replace(/^[-–—:.\s]+/, '').trim();
            if (reasonText.length > 5) {
              reasoning[key] = reasonText;
            } else if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim().replace(/^[-–—:.\s]+/, '').trim();
              if (nextLine && !Object.keys(AXIS_NAME_MAP).some(n => nextLine.toLowerCase().includes(n))) {
                reasoning[key] = nextLine;
              }
            }
          }
          break;
        }
      }
    }

    if (foundAxes >= 3) {
      const promptSuggestions: string[] = [];
      const configSuggestions: string[] = [];
      let currentSection: 'prompt' | 'config' | null = null;

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('prompt') && lower.includes('suggest')) {
          currentSection = 'prompt';
          continue;
        }
        if (lower.includes('config') && lower.includes('suggest') || lower.includes('recommendation')) {
          currentSection = 'config';
          continue;
        }
        const bullet = line.match(/^\s*[-*•]\s+(.+)/);
        if (bullet && currentSection === 'prompt') promptSuggestions.push(bullet[1].trim());
        if (bullet && currentSection === 'config') configSuggestions.push(bullet[1].trim());
      }

      return {
        kind: 'standard',
        scores,
        reasoning,
        promptSuggestions,
        configSuggestions,
        source: 'local',
        timestamp: Date.now(),
      };
    }
  }

  // --- Tier 3: Free-text fallback ---
  console.info('[evaluation] local quality: Tier 3 free-text fallback. Raw output:', raw);
  const trimmed = raw.trim().toLowerCase();
  const rawText = raw.trim();

  // Estimate a rough score from sentiment cues in the text (EN + JA)
  let uniformScore = 0.55;
  const positiveEN = (trimmed.match(/\b(good|great|excellent|well|clear|strong|effective|accurate|concise)\b/g) || []).length;
  const negativeEN = (trimmed.match(/\b(poor|bad|weak|unclear|confusing|verbose|wrong|inaccurate|lacks?|missing)\b/g) || []).length;
  const positiveJA = (rawText.match(/(良い|優れ|適切|明確|分かりやすい|簡潔|正確|的確|効果的|丁寧)/g) || []).length;
  const negativeJA = (rawText.match(/(悪い|不適切|不明確|冗長|不正確|曖昧|不足|欠け|問題)/g) || []).length;
  const positiveWords = positiveEN + positiveJA;
  const negativeWords = negativeEN + negativeJA;
  if (positiveWords > negativeWords + 1) uniformScore = 0.75;
  else if (positiveWords > negativeWords) uniformScore = 0.65;
  else if (negativeWords > positiveWords + 1) uniformScore = 0.30;
  else if (negativeWords > positiveWords) uniformScore = 0.45;

  const uniformScores = defaultScores();
  for (const key of qualityAxisKeys) {
    uniformScores[key] = uniformScore;
  }

  // Show the raw evaluation text under each axis individually
  const tier3Reasoning: Partial<Record<keyof QualityScores, string>> = {};
  if (rawText) {
    for (const key of qualityAxisKeys) {
      tier3Reasoning[key] = rawText;
    }
  }

  return {
    kind: 'standard',
    scores: uniformScores,
    reasoning: tier3Reasoning,
    promptSuggestions: [],
    configSuggestions: [],
    source: 'local',
    timestamp: Date.now(),
  };
}

/**
 * Run local quality evaluation using the wllama model.
 *
 * Evaluates each of the 5 quality axes with a separate prompt to get
 * per-axis reasoning from small models that cannot handle all axes at once.
 * Results are marked with source='local'.
 */
export async function runLocalQualityEvaluation(
  text: string,
  assistantResponse: string | undefined,
  onAxisProgress?: (axis: keyof QualityScores, state: AxisProgressState) => void,
): Promise<StandardQualityEvaluationResult> {
  const modelId = getActiveModelId('analysis') ?? getActiveModelId('quality') ?? getActiveModelId('generation');
  if (!modelId) {
    throw new Error('No local analysis/generation model configured');
  }

  await localModelRuntime.ensureLoaded(modelId);

  const engine = localModelRuntime.getWllamaEngine(modelId);
  if (!engine) {
    throw new Error('Local quality model not loaded');
  }

  // Keep input short for small models with limited context windows
  const inputText = text.slice(0, 400);
  const inputAssistant = assistantResponse?.slice(0, 400);
  const axisLabels = getAxisLabels();

  const scores: QualityScores = {
    taskCompletion: 0,
    faithfulness: 0,
    coherence: 0,
    conciseness: 0,
    instructionFollowing: 0,
  };
  const reasoning: Partial<Record<keyof QualityScores, string>> = {};

  // Set all axes to 'waiting' initially
  for (const axis of qualityAxisKeys) {
    onAxisProgress?.(axis, 'waiting');
  }

  // Evaluate each axis individually
  for (const axis of qualityAxisKeys) {
    onAxisProgress?.(axis, 'generating');
    const label = axisLabels[axis];
    const prompt = buildAxisPrompt(inputText, label.question, inputAssistant);

    console.info(`[evaluation] local quality: evaluating axis "${axis}"...`);

    let raw = await engine.generate(
      promptAsInput(prompt),
      { maxTokens: 400, temperature: 0.2 },
      () => {},
      'evaluation',
    );

    console.info(`[evaluation] local quality axis "${axis}" output length:`, raw.length, 'preview:', raw.slice(0, 100));

    // If empty, try once more with a simpler prompt
    if (!raw.trim()) {
      const lang = i18next.language;
      const fallback = lang.startsWith('ja')
        ? `「${inputText.slice(0, 150)}」\n${label.name}の評価:`
        : `"${inputText.slice(0, 150)}"\n${label.name}:`;
      raw = await engine.generate(promptAsInput(fallback), { maxTokens: 200, temperature: 0.5 }, () => {}, 'evaluation');
    }

    const trimmed = raw.trim();
    if (trimmed) {
      scores[axis] = estimateScoreFromText(trimmed);
      reasoning[axis] = trimmed;
    } else {
      scores[axis] = 0.5;
    }
    onAxisProgress?.(axis, 'done');
  }

  console.info('[evaluation] local quality per-axis scores:', scores);

  return {
    kind: 'standard',
    scores,
    reasoning,
    promptSuggestions: [],
    configSuggestions: [],
    source: 'local',
    timestamp: Date.now(),
  };
}
