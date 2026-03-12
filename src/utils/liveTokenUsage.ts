export const LIVE_TOKEN_RECOUNT_THROTTLE_MS = 300;

export const buildPromptCountCacheKey = (
  sessionId: string,
  model: string,
  messageIndex: number
) => `${sessionId}::${model}::${messageIndex}`;
