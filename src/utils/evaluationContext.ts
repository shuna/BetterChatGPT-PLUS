/**
 * Resolves the text context for evaluation, aligned with the actual
 * generation context produced by submitHelpers.
 */

import useStore from '@store/store';
import {
  filterOmittedMessages,
  sanitizeMessagesForSubmit,
} from '@hooks/submitHelpers';
import type { MessageInterface } from '@type/chat';
import { isTextContent } from '@type/chat';
import type { EvaluationScope, EvaluationOmittedMode } from '@type/evaluation';

/** Resolved text context ready for evaluation APIs */
export interface ResolvedEvalContext {
  /**
   * User-role text extracted from the resolved context.
   * Used as the "prompt" input for quality evaluation (LLM-as-judge).
   */
  userText: string;
  /**
   * Full conversation context with all roles (system, user, assistant)
   * concatenated with role prefixes.  Used for safety checks in
   * full-context mode so the moderation API sees the same text that
   * was sent to / received from the model.
   */
  contextText: string;
  /** Assistant text (only for post-receive phase) */
  assistantText?: string;
}

/**
 * Extract all text from a message's content parts.
 */
function extractText(msg: MessageInterface): string {
  return msg.content
    .filter(isTextContent)
    .map((c) => c.text)
    .join('\n');
}

/**
 * Concatenate all user-role text from a sanitized message array.
 */
function collectUserText(messages: MessageInterface[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map(extractText)
    .filter(Boolean)
    .join('\n');
}

/**
 * Concatenate ALL messages (every role) into a single string with
 * role prefixes, matching the actual payload that would be sent to
 * / received from the model.
 */
function collectAllText(messages: MessageInterface[]): string {
  return messages
    .map((m) => {
      const text = extractText(m);
      if (!text) return '';
      return `[${m.role}]\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Build the message array that represents the "actual generation context"
 * for a given message index, optionally ignoring or respecting omitted flags.
 *
 * This mirrors the pipeline in submitHelpers:
 *   messages.slice(0, targetIndex)
 *   → filterOmittedMessages (unless includeOmitted)
 *   → sanitizeMessagesForSubmit
 */
function buildContextMessages(
  messages: MessageInterface[],
  targetIndex: number,
  chatIndex: number,
  includeOmitted: boolean
): MessageInterface[] {
  const sliced = messages.slice(0, targetIndex);
  const filtered = includeOmitted
    ? sliced
    : filterOmittedMessages(sliced, chatIndex);
  return sanitizeMessagesForSubmit(filtered);
}

/**
 * Resolve the evaluation text context for a given message.
 *
 * @param chatIndex   - index in store.chats[]
 * @param messageIndex - index in chat.messages[]
 * @param role        - 'user' | 'assistant'
 * @param scope       - 'single' | 'full-context'
 * @param omittedMode - 'respect-omitted' | 'include-omitted'
 */
export function resolveEvalContext(
  chatIndex: number,
  messageIndex: number,
  role: string,
  scope: EvaluationScope,
  omittedMode: EvaluationOmittedMode
): ResolvedEvalContext | null {
  const state = useStore.getState();
  const chat = state.chats?.[chatIndex];
  if (!chat) return null;

  const targetMsg = chat.messages[messageIndex];
  if (!targetMsg) return null;

  const currentText = extractText(targetMsg);
  const includeOmitted = omittedMode === 'include-omitted';

  if (scope === 'single') {
    // ── Single prompt ──
    if (role === 'user') {
      return {
        userText: currentText,
        contextText: currentText,
      };
    }
    // assistant: use immediately preceding consecutive user messages
    const userTexts: string[] = [];
    for (let i = messageIndex - 1; i >= 0; i--) {
      const msg = chat.messages[i];
      if (msg.role !== 'user') break;
      userTexts.unshift(extractText(msg));
    }
    const userText = userTexts.join('\n');
    return {
      userText,
      contextText: userText, // single = just the preceding user turn
      assistantText: currentText,
    };
  }

  // ── Full context ──
  if (role === 'user') {
    // Context = everything before this message + this message itself
    const contextMsgs = buildContextMessages(
      chat.messages,
      messageIndex,
      chatIndex,
      includeOmitted
    );
    const sanitizedTarget = sanitizeMessagesForSubmit([targetMsg]);
    const allMsgs = [...contextMsgs, ...sanitizedTarget];
    return {
      userText: collectUserText(allMsgs),
      contextText: collectAllText(allMsgs),
    };
  }

  // assistant: context = everything up to (not including) the assistant message
  // The assistant message itself is the response to evaluate.
  const contextMsgs = buildContextMessages(
    chat.messages,
    messageIndex,
    chatIndex,
    includeOmitted
  );
  return {
    userText: collectUserText(contextMsgs),
    contextText: collectAllText(contextMsgs),
    assistantText: currentText,
  };
}
