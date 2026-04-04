import type { TFunction } from 'i18next';

type KnownEvaluationError =
  | 'invalidAuthentication'
  | 'incorrectApiKey'
  | 'orgMembershipRequired'
  | 'rateLimitReached'
  | 'quotaExceeded'
  | 'serverError'
  | 'engineOverloaded';

const ERROR_MATCHERS: Array<{ key: KnownEvaluationError; test: (message: string) => boolean }> = [
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

export function formatEvaluationErrorMessage(message: string, t: TFunction<'main'>): string {
  const match = ERROR_MATCHERS.find((entry) => entry.test(message));
  if (!match) return message;

  const title = t(`evaluation.apiErrors.${match.key}.title`);
  const description = t(`evaluation.apiErrors.${match.key}.description`);
  const tip =
    match.key === 'rateLimitReached' || match.key === 'quotaExceeded'
      ? t(`evaluation.apiErrors.${match.key}.tip`)
      : '';

  return [message, `${title}\n${description}`, tip].filter(Boolean).join('\n\n');
}
