/**
 * Hook for running evaluations on chat messages.
 * Integrates with the submit flow for auto-evaluation and
 * exposes manual trigger functions.
 */

import { useCallback } from 'react';
import useStore from '@store/store';
import { runSafetyCheck, runQualityEvaluation } from '@api/evaluation';
import { runLocalModeration, runLocalQualityEvaluation } from '@api/localEvaluation';
import { prepareModelsForExecution } from '@src/local-llm/orchestrator';
import { evaluationResultKey, qualityAxisKeys } from '@type/evaluation';
import type { EvaluationResult, QualityScores, AxisProgressState } from '@type/evaluation';
import type { ContentInterface } from '@type/chat';
import type { ResolvedProvider } from './submitHelpers';
import i18next from 'i18next';

function extractText(content: ContentInterface[]): string {
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

export interface EvaluationContext {
  chatId: string;
  nodeId: string;
  endpoint: string;
  apiKey?: string;
  model: string;
}

async function runEvaluationForPhase(
  phase: 'pre-send' | 'post-receive',
  userText: string,
  assistantText: string | undefined,
  ctx: EvaluationContext
): Promise<void> {
  const store = useStore.getState();
  const settings = store.evaluationSettings;
  const key = evaluationResultKey(ctx.chatId, ctx.nodeId, phase);

  const shouldSafety =
    (phase === 'pre-send' && settings.safetyPreSend === 'auto') ||
    (phase === 'post-receive' && settings.safetyPostReceive === 'auto');

  const shouldQuality =
    (phase === 'pre-send' && settings.qualityPreSend === 'auto') ||
    (phase === 'post-receive' && settings.qualityPostReceive === 'auto');

  if (!shouldSafety && !shouldQuality) return;

  store.setEvaluationPending(key, true);

  const result: EvaluationResult = { phase };

  try {
    const textToCheck = phase === 'pre-send' ? userText : (assistantText ?? '');
    const { safetyEngine, hybridRemoteOnSafe } = settings;

    // Prepare local evaluation models before first use
    if (store.localModelEnabled) {
      const evalIds: string[] = [];
      const analysisModelId = store.activeLocalModels['analysis'];
      if (analysisModelId) evalIds.push(analysisModelId);
      if (evalIds.length > 0) await prepareModelsForExecution(evalIds);
    }

    if (shouldSafety && textToCheck) {
      // --- Local safety (if engine is local or hybrid) ---
      if (safetyEngine === 'local' || safetyEngine === 'hybrid') {
        try {
          result.localSafety = await runLocalModeration(textToCheck);
        } catch (e) {
          console.warn('[evaluation] local safety screening failed:', e);
        }
      }

      // --- Remote safety ---
      // In 'local' mode, if local failed, fall back to remote as a safety net
      const localOnlyButFailed = safetyEngine === 'local' && !result.localSafety;
      const shouldRunRemote =
        safetyEngine === 'remote' ||
        localOnlyButFailed ||
        (safetyEngine === 'hybrid' && (
          // Always run remote if local found issues
          result.localSafety?.screening === 'warn' ||
          result.localSafety?.screening === 'block-candidate' ||
          // Also run remote if hybridRemoteOnSafe is true (default)
          hybridRemoteOnSafe ||
          // Also run remote if local failed (no result)
          !result.localSafety
        ));

      if (shouldRunRemote) {
        try {
          result.safety = await runSafetyCheck(textToCheck);
        } catch (e) {
          console.warn('[evaluation] remote safety check failed:', e);
        }
      }
    }

    if (shouldQuality && userText) {
      // Determine if a local model is assigned to the analysis (evaluation) task
      const analysisModelId = store.localModelEnabled
        ? (store.activeLocalModels['analysis'] ?? null)
        : null;

      if (analysisModelId) {
        // Use local quality evaluation as the primary evaluator
        const qualityText = phase === 'post-receive' ? (assistantText ?? '') : userText;
        if (qualityText) {
          try {
            const axisProgress = (axis: keyof QualityScores, state: AxisProgressState) => {
              useStore.getState().setEvaluationAxisProgress(key, { [axis]: state });
            };
            result.quality = await runLocalQualityEvaluation(qualityText, axisProgress);
          } catch (e) {
            console.warn('[evaluation] local quality evaluation failed:', e);
          }
        }
      } else {
        // Use remote API for quality evaluation
        try {
          result.quality = await runQualityEvaluation(
            userText,
            phase === 'post-receive' ? assistantText : undefined,
            ctx.endpoint,
            ctx.model,
            ctx.apiKey,
            i18next.language
          );
        } catch (e) {
          console.warn('[evaluation] quality evaluation failed:', e);
        }
      }
    }

    if (result.safety || result.quality || result.localSafety) {
      useStore.getState().setEvaluationResult(key, result);
    }
  } finally {
    useStore.getState().setEvaluationPending(key, false);
    useStore.getState().clearEvaluationAxisProgress(key);
  }
}

/**
 * Run auto-evaluations for pre-send phase.
 * Called before the prompt is sent to the API.
 */
export async function runPreSendEvaluation(
  userContent: ContentInterface[],
  ctx: EvaluationContext
): Promise<void> {
  const userText = extractText(userContent);
  if (!userText) return;
  await runEvaluationForPhase('pre-send', userText, undefined, ctx);
}

/**
 * Run auto-evaluations for post-receive phase.
 * Called after the response is fully received.
 */
export async function runPostReceiveEvaluation(
  userContent: ContentInterface[],
  assistantContent: ContentInterface[],
  ctx: EvaluationContext
): Promise<void> {
  const userText = extractText(userContent);
  const assistantText = extractText(assistantContent);
  if (!userText) return;
  await runEvaluationForPhase('post-receive', userText, assistantText, ctx);
}

/**
 * Hook providing manual evaluation trigger functions.
 */
export function useEvaluation() {
  const triggerManualSafety = useCallback(
    async (
      text: string,
      chatId: string,
      nodeId: string,
      phase: 'pre-send' | 'post-receive',
      resolvedProvider: ResolvedProvider
    ) => {
      const store = useStore.getState();
      const key = evaluationResultKey(chatId, nodeId, phase);
      store.setEvaluationPending(key, true);
      try {
        const safety = await runSafetyCheck(text);
        const existing = store.evaluationResults[key];
        store.setEvaluationResult(key, {
          ...existing,
          phase,
          safety,
        });
      } catch (e) {
        console.warn('[evaluation] manual safety check failed:', e);
      } finally {
        useStore.getState().setEvaluationPending(key, false);
      }
    },
    []
  );

  const triggerManualQuality = useCallback(
    async (
      userText: string,
      assistantText: string | undefined,
      chatId: string,
      nodeId: string,
      phase: 'pre-send' | 'post-receive',
      resolvedProvider: ResolvedProvider,
      model: string
    ) => {
      const store = useStore.getState();
      const key = evaluationResultKey(chatId, nodeId, phase);
      store.setEvaluationPending(key, true);
      try {
        const analysisModelId = store.localModelEnabled
          ? (store.activeLocalModels['analysis'] ?? null)
          : null;

        if (analysisModelId) {
          // Use local quality evaluation
          if (store.localModelEnabled) {
            await prepareModelsForExecution([analysisModelId]);
          }
          const qualityText = assistantText ?? userText;
          const axisProgress = (axis: keyof QualityScores, state: AxisProgressState) => {
            useStore.getState().setEvaluationAxisProgress(key, { [axis]: state });
          };
          const quality = await runLocalQualityEvaluation(qualityText, axisProgress);
          const existing = store.evaluationResults[key];
          store.setEvaluationResult(key, {
            ...existing,
            phase,
            quality,
          });
        } else {
          // Use remote API
          const quality = await runQualityEvaluation(
            userText,
            assistantText,
            resolvedProvider.endpoint,
            model,
            resolvedProvider.key,
            i18next.language
          );
          const existing = store.evaluationResults[key];
          store.setEvaluationResult(key, {
            ...existing,
            phase,
            quality,
          });
        }
      } catch (e) {
        console.warn('[evaluation] manual quality evaluation failed:', e);
      } finally {
        useStore.getState().setEvaluationPending(key, false);
        useStore.getState().clearEvaluationAxisProgress(key);
      }
    },
    []
  );

  return { triggerManualSafety, triggerManualQuality };
}
