/**
 * Evaluation API utilities:
 * A) Safety check via OpenAI-compatible Moderation API
 * B) Quality evaluation via LLM-as-Judge (chat completion)
 */

import type { SafetyCheckResult, QualityEvaluationResult, QualityScores } from '@type/evaluation';
import { qualityAxisKeys } from '@type/evaluation';

// ---------------------------------------------------------------------------
// A) Safety Check — OpenAI Moderation API
// ---------------------------------------------------------------------------

/**
 * Call the OpenAI Moderation endpoint (or compatible).
 * Falls back to the provider's base endpoint + /moderations path.
 */
export async function runSafetyCheck(
  text: string,
  endpoint: string,
  apiKey?: string
): Promise<SafetyCheckResult> {
  const moderationUrl = endpoint.replace(/\/chat\/completions\/?$/, '/moderations');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(moderationUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Moderation API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const result = data.results?.[0];
  if (!result) throw new Error('Moderation API returned empty results');

  return {
    flagged: result.flagged ?? false,
    categories: result.categories ?? {},
    categoryScores: result.category_scores ?? {},
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// B) Quality Evaluation — LLM-as-Judge
// ---------------------------------------------------------------------------

const QUALITY_SYSTEM_PROMPT = `You are an expert evaluation judge. You will receive a user prompt and an AI response. Evaluate the response quality on these 5 axes (score 0.0-1.0 each):

1. taskCompletion: Does the response address everything the prompt asked for?
2. faithfulness: Is the response factually grounded and free of hallucinations?
3. coherence: Is the response logically consistent and well-structured?
4. conciseness: Is the response appropriately brief without unnecessary content?
5. instructionFollowing: Does the response obey explicit constraints (format, language, length, etc.)?

Also provide:
- promptSuggestions: concrete ways the user could improve their prompt
- configSuggestions: recommendations for model or parameter changes

Respond ONLY with valid JSON in this exact format:
{
  "scores": { "taskCompletion": 0.0, "faithfulness": 0.0, "coherence": 0.0, "conciseness": 0.0, "instructionFollowing": 0.0 },
  "reasoning": { "taskCompletion": "...", "faithfulness": "...", "coherence": "...", "conciseness": "...", "instructionFollowing": "..." },
  "promptSuggestions": ["..."],
  "configSuggestions": ["..."]
}`;

const QUALITY_PROMPT_ONLY_SYSTEM = `You are an expert prompt evaluation judge. You will receive a user prompt BEFORE it is sent to an AI. Evaluate the prompt quality and predict potential issues. Score these 5 axes (0.0-1.0) based on how well the prompt is crafted:

1. taskCompletion: Is the prompt clear enough to get a complete response?
2. faithfulness: Does the prompt provide enough context for a grounded response?
3. coherence: Is the prompt itself logically structured?
4. conciseness: Is the prompt appropriately brief without missing information?
5. instructionFollowing: Does the prompt include explicit constraints (format, language, etc.)?

Also provide:
- promptSuggestions: concrete ways to improve this prompt before sending
- configSuggestions: recommendations for model or parameter choices

Respond ONLY with valid JSON in this exact format:
{
  "scores": { "taskCompletion": 0.0, "faithfulness": 0.0, "coherence": 0.0, "conciseness": 0.0, "instructionFollowing": 0.0 },
  "reasoning": { "taskCompletion": "...", "faithfulness": "...", "coherence": "...", "conciseness": "...", "instructionFollowing": "..." },
  "promptSuggestions": ["..."],
  "configSuggestions": ["..."]
}`;

function buildJudgeMessages(
  userPrompt: string,
  assistantResponse?: string
): Array<{ role: string; content: string }> {
  const isPreSend = !assistantResponse;
  const systemPrompt = isPreSend ? QUALITY_PROMPT_ONLY_SYSTEM : QUALITY_SYSTEM_PROMPT;

  const userContent = isPreSend
    ? `## User Prompt\n${userPrompt}`
    : `## User Prompt\n${userPrompt}\n\n## AI Response\n${assistantResponse}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

function parseJudgeResponse(text: string): Omit<QualityEvaluationResult, 'timestamp'> {
  // Extract JSON from markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = jsonMatch[1]?.trim() ?? text.trim();

  const parsed = JSON.parse(jsonStr);

  const scores: QualityScores = {
    taskCompletion: 0,
    faithfulness: 0,
    coherence: 0,
    conciseness: 0,
    instructionFollowing: 0,
  };

  for (const key of qualityAxisKeys) {
    const val = parsed.scores?.[key];
    if (typeof val === 'number' && val >= 0 && val <= 1) {
      scores[key] = val;
    }
  }

  return {
    scores,
    reasoning: parsed.reasoning ?? {},
    promptSuggestions: Array.isArray(parsed.promptSuggestions) ? parsed.promptSuggestions : [],
    configSuggestions: Array.isArray(parsed.configSuggestions) ? parsed.configSuggestions : [],
  };
}

/**
 * Run quality evaluation using a chat completion endpoint (LLM-as-Judge).
 */
export async function runQualityEvaluation(
  userPrompt: string,
  assistantResponse: string | undefined,
  endpoint: string,
  model: string,
  apiKey?: string
): Promise<QualityEvaluationResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const messages = buildJudgeMessages(userPrompt, assistantResponse);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Quality evaluation API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Quality evaluation returned empty response');

  const result = parseJudgeResponse(content);
  return { ...result, timestamp: Date.now() };
}
