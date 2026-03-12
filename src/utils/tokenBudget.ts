export const UNKNOWN_MODEL_CONTEXT_LENGTH = 8192;
const MIN_PROMPT_RATIO = 0.1;
const DEFAULT_RESERVED_COMPLETION_RATIO = 0.2;
const MIN_RESERVED_COMPLETION_TOKENS = 1024;

const normalizeContextLength = (contextLength: number): number =>
  Math.max(1, Math.floor(contextLength));

export const getMinPromptTokensForContext = (contextLength: number): number =>
  Math.max(1, Math.floor(normalizeContextLength(contextLength) * MIN_PROMPT_RATIO));

export const getMaxCompletionTokensForContext = (contextLength: number): number => {
  const normalizedContextLength = normalizeContextLength(contextLength);
  return Math.max(0, normalizedContextLength - getMinPromptTokensForContext(normalizedContextLength));
};

export const clampCompletionTokens = (
  requestedCompletionTokens: number,
  contextLength: number
): number =>
  Math.min(
    Math.max(0, Math.floor(requestedCompletionTokens)),
    getMaxCompletionTokensForContext(contextLength)
  );

export const getReservedCompletionTokens = (
  contextLength: number,
  requestedCompletionTokens: number
): number => {
  if (requestedCompletionTokens > 0) {
    return clampCompletionTokens(requestedCompletionTokens, contextLength);
  }

  const normalizedContextLength = normalizeContextLength(contextLength);
  const defaultReservedCompletion = Math.max(
    MIN_RESERVED_COMPLETION_TOKENS,
    Math.floor(normalizedContextLength * DEFAULT_RESERVED_COMPLETION_RATIO)
  );

  return clampCompletionTokens(defaultReservedCompletion, normalizedContextLength);
};

export const getPromptBudgetForContext = (
  contextLength: number,
  requestedCompletionTokens: number
): number => {
  const normalizedContextLength = normalizeContextLength(contextLength);
  const reservedCompletion = getReservedCompletionTokens(
    normalizedContextLength,
    requestedCompletionTokens
  );

  return Math.max(
    getMinPromptTokensForContext(normalizedContextLength),
    normalizedContextLength - reservedCompletion
  );
};

export const fitsContextWindow = (
  promptTokens: number,
  contextLength: number,
  requestedCompletionTokens: number
): boolean => {
  const normalizedContextLength = normalizeContextLength(contextLength);
  return (
    Math.max(0, Math.floor(promptTokens)) +
      getReservedCompletionTokens(normalizedContextLength, requestedCompletionTokens) <=
    normalizedContextLength
  );
};
