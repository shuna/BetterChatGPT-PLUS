import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// A) Structured error tags (thrown by evaluation.ts with [EVAL_*] prefixes)
// ---------------------------------------------------------------------------

interface StructuredErrorMatcher {
  key: string;
  tag: string;
  /** Extract interpolation params from the error message */
  params?: (message: string) => Record<string, string>;
}

const STRUCTURED_MATCHERS: StructuredErrorMatcher[] = [
  {
    key: 'apiKeyRequired',
    tag: '[EVAL_API_KEY_REQUIRED]',
  },
  {
    key: 'proxyNotConfigured',
    tag: '[EVAL_PROXY_NOT_CONFIGURED]',
  },
  {
    key: 'connectionFailed',
    tag: '[EVAL_CONNECTION_FAILED]',
    params: (msg) => {
      const url = msg.match(/url=(\S+)/)?.[1] ?? '';
      const detail = msg.match(/detail=(.+)/)?.[1] ?? '';
      return { url, detail };
    },
  },
  {
    key: 'moderationApiError',
    tag: '[EVAL_MODERATION_API_ERROR]',
    params: (msg) => {
      const status = msg.match(/status=(\d+)/)?.[1] ?? '';
      const url = msg.match(/url=(\S+)/)?.[1] ?? '';
      const detail = msg.match(/detail=(.+)/)?.[1] ?? '';
      return { status, url, detail };
    },
  },
  {
    key: 'moderationEmptyResults',
    tag: '[EVAL_MODERATION_EMPTY_RESULTS]',
  },
  {
    key: 'qualityConnectionFailed',
    tag: '[EVAL_QUALITY_CONNECTION_FAILED]',
    params: (msg) => {
      const url = msg.match(/url=(\S+)/)?.[1] ?? '';
      const detail = msg.match(/detail=(.+)/)?.[1] ?? '';
      return { url, detail };
    },
  },
  {
    key: 'qualityApiError',
    tag: '[EVAL_QUALITY_API_ERROR]',
    params: (msg) => {
      const status = msg.match(/status=(\d+)/)?.[1] ?? '';
      const url = msg.match(/url=(\S+)/)?.[1] ?? '';
      const detail = msg.match(/detail=(.+)/)?.[1] ?? '';
      return { status, url, detail };
    },
  },
  {
    key: 'qualityEmptyResponse',
    tag: '[EVAL_QUALITY_EMPTY_RESPONSE]',
  },
];

// ---------------------------------------------------------------------------
// B) Known API error matchers (pattern-match on raw HTTP error bodies)
// ---------------------------------------------------------------------------

type KnownApiError =
  | 'invalidAuthentication'
  | 'incorrectApiKey'
  | 'orgMembershipRequired'
  | 'rateLimitReached'
  | 'quotaExceeded'
  | 'serverError'
  | 'engineOverloaded';

const API_ERROR_MATCHERS: Array<{ key: KnownApiError; test: (message: string) => boolean }> = [
  {
    key: 'invalidAuthentication',
    test: (message) =>
      message.includes('401') &&
      /Invalid Authentication/i.test(message),
  },
  {
    key: 'incorrectApiKey',
    test: (message) =>
      message.includes('401') &&
      /Incorrect API key provided/i.test(message),
  },
  {
    key: 'orgMembershipRequired',
    test: (message) =>
      message.includes('401') &&
      /You must be a member of an orga?nization to use the API/i.test(message),
  },
  {
    key: 'rateLimitReached',
    test: (message) =>
      message.includes('429') &&
      /Rate limit reached for requests|Too Many Requests/i.test(message),
  },
  {
    key: 'quotaExceeded',
    test: (message) =>
      message.includes('429') &&
      /You exceeded your current quota, please check your plan and billing details|insufficient_quota/i.test(message),
  },
  {
    key: 'serverError',
    test: (message) =>
      message.includes('500') &&
      /The server had an error while proce(?:e|)ding your request|The server had an error while processing your request/i.test(message),
  },
  {
    key: 'engineOverloaded',
    test: (message) =>
      message.includes('503') &&
      /The engine is currently overloaded,?\s*please try again later/i.test(message),
  },
];

// ---------------------------------------------------------------------------
// C) Public API
// ---------------------------------------------------------------------------

export interface FormattedEvaluationError {
  message: string;
  /** True when the error is due to proxy not being configured */
  isProxyNotConfigured: boolean;
}

export function formatEvaluationErrorMessage(
  message: string,
  t: TFunction<'main'>
): FormattedEvaluationError {
  // 1) Check structured [EVAL_*] tags first
  const structured = STRUCTURED_MATCHERS.find((m) => message.includes(m.tag));
  if (structured) {
    const params = structured.params?.(message) ?? {};
    const title = t(`evaluation.errors.${structured.key}.title`);
    const description = t(`evaluation.errors.${structured.key}.description`, params);
    return {
      message: `${title}\n${description}`,
      isProxyNotConfigured: structured.key === 'proxyNotConfigured',
    };
  }

  // 2) Check known API error patterns
  const apiMatch = API_ERROR_MATCHERS.find((entry) => entry.test(message));
  if (apiMatch) {
    const title = t(`evaluation.apiErrors.${apiMatch.key}.title`);
    const description = t(`evaluation.apiErrors.${apiMatch.key}.description`);
    const tip =
      apiMatch.key === 'rateLimitReached' || apiMatch.key === 'quotaExceeded'
        ? t(`evaluation.apiErrors.${apiMatch.key}.tip`)
        : '';
    return {
      message: [message, `${title}\n${description}`, tip].filter(Boolean).join('\n\n'),
      isProxyNotConfigured: false,
    };
  }

  // 3) Fallback — return raw message
  return { message, isProxyNotConfigured: false };
}
