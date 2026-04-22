/**
 * Local generation API — wllama-powered text generation, analysis, and formatting.
 *
 * All functions operate through LocalModelRuntime, which manages the wllama Worker.
 * The runtime must have a generation-capable model loaded before calling these.
 */

import { localModelRuntime, promptAsInput } from '@src/local-llm/runtime';
import type { LocalModelTask, LocalModelBusyReason } from '@src/local-llm/types';
import useStore from '@store/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveModelId(task: LocalModelTask): string | null {
  const state = useStore.getState();
  if (!state.localModelEnabled) return null;
  return state.activeLocalModels[task] ?? null;
}

function getWllamaEngine(task: LocalModelTask) {
  const modelId = getActiveModelId(task);
  if (!modelId) return null;
  return localModelRuntime.getWllamaEngine(modelId);
}

// ---------------------------------------------------------------------------
// Text generation (streaming)
// ---------------------------------------------------------------------------

/**
 * Generate text using the local wllama model.
 * Yields incremental text as it's produced (currentText snapshots).
 */
export async function* localGenerate(
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number; stop?: string[] },
): AsyncGenerator<string> {
  const engine = getWllamaEngine('generation');
  if (!engine) throw new Error('No local generation model loaded');

  // We need to bridge the callback-based engine.generate() to an async generator.
  // Use a simple queue with a promise chain.
  const queue: string[] = [];
  let done = false;
  let error: Error | null = null;
  let resolve: (() => void) | null = null;

  const generatePromise = engine.generate(
    promptAsInput(prompt),
    {
      maxTokens: opts?.maxTokens ?? 256,
      temperature: opts?.temperature ?? 0.7,
      stop: opts?.stop,
    },
    (text) => {
      queue.push(text);
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    'chat',
  ).then(() => {
    done = true;
    if (resolve) {
      resolve();
      resolve = null;
    }
  }).catch((e) => {
    error = e as Error;
    done = true;
    if (resolve) {
      resolve();
      resolve = null;
    }
  });

  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      // Yield the latest snapshot (skip intermediate if multiple queued)
      const latest = queue[queue.length - 1];
      queue.length = 0;
      yield latest;
    } else if (!done) {
      // Wait for next chunk
      await new Promise<void>((r) => { resolve = r; });
    }
  }

  if (error) throw error;
  await generatePromise;
}

// ---------------------------------------------------------------------------
// Text analysis
// ---------------------------------------------------------------------------

const ANALYSIS_TEMPLATE = `Analyze the following text based on the instruction.

Instruction: {instruction}

Text:
{text}

Analysis:`;

/**
 * Analyze text with a custom instruction using the local model.
 * Returns the full generated analysis text.
 */
export async function localAnalyze(text: string, instruction: string, reason?: LocalModelBusyReason): Promise<string> {
  const engine = getWllamaEngine('analysis') ?? getWllamaEngine('generation');
  if (!engine) throw new Error('No local analysis/generation model loaded');

  const prompt = ANALYSIS_TEMPLATE
    .replace('{instruction}', instruction)
    .replace('{text}', text);

  const result = await engine.generate(
    promptAsInput(prompt),
    { maxTokens: 512, temperature: 0.3 },
    () => {},
    reason ?? 'chat',
  );
  return result;
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

type FormatPreset = 'summarize' | 'rewrite' | 'bullets';

const FORMAT_TEMPLATES: Record<FormatPreset, string> = {
  summarize: `Summarize the following text concisely:

{text}

Summary:`,
  rewrite: `Rewrite the following text to improve clarity and readability:

{text}

Rewritten:`,
  bullets: `Convert the following text into bullet points:

{text}

Bullet points:`,
};

/**
 * Format text using a preset template.
 */
export async function localFormat(text: string, format: FormatPreset, reason?: LocalModelBusyReason): Promise<string> {
  const engine = getWllamaEngine('analysis') ?? getWllamaEngine('generation');
  if (!engine) throw new Error('No local analysis/generation model loaded');

  const template = FORMAT_TEMPLATES[format];
  const prompt = template.replace('{text}', text);

  const result = await engine.generate(
    promptAsInput(prompt),
    { maxTokens: 512, temperature: 0.3 },
    () => {},
    reason ?? 'chat',
  );
  return result;
}
