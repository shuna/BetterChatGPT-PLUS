/**
 * Prepare a user prompt for inference by applying the model's chat template.
 *
 * Instruct-tuned models (SmolLM2, Qwen, Gemma, etc.) embed a Jinja chat
 * template in their GGUF metadata (`tokenizer.chat_template`).  Passing raw
 * text to such a model typically triggers an immediate EOS — the 0-token
 * generate problem first observed with SmolLM2-1.7B-Instruct.
 *
 * This module encapsulates the template-detection and formatting logic so
 * it can be unit-tested independently of the Web Worker / WASM runtime.
 */

/** Minimal subset of the Wllama API required for prompt preparation. */
export interface ChatTemplateProvider {
  getChatTemplate(): string | null;
  formatChat(
    messages: Array<{ role: string; content: string }>,
    addAssistant: boolean,
  ): Promise<string>;
}

export interface PrepareResult {
  /** The prompt to feed into `createCompletion`. */
  prompt: string;
  /** True if the model has a chat template but `formatChat` threw. */
  chatTemplateFailed: boolean;
  /** True if a chat template was successfully applied. */
  chatTemplateApplied: boolean;
}

/**
 * Apply the model's chat template to a raw user prompt.
 *
 * Decision matrix:
 *   - Template exists + formatChat succeeds → wrapped prompt
 *   - Template exists + formatChat throws   → raw prompt (fallback)
 *   - No template                           → raw prompt (base model)
 */
export async function prepareChatPrompt(
  rawPrompt: string,
  provider: ChatTemplateProvider,
): Promise<PrepareResult> {
  const chatTemplate = provider.getChatTemplate();

  if (!chatTemplate) {
    return { prompt: rawPrompt, chatTemplateFailed: false, chatTemplateApplied: false };
  }

  try {
    const formatted = await provider.formatChat(
      [{ role: 'user', content: rawPrompt }],
      true, // addAssistant: append assistant turn start
    );
    return { prompt: formatted, chatTemplateFailed: false, chatTemplateApplied: true };
  } catch {
    return { prompt: rawPrompt, chatTemplateFailed: true, chatTemplateApplied: false };
  }
}
