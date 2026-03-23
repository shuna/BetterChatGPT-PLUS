import {
  ConfigInterface,
  MessageInterface,
  ReasoningEffort,
} from '@type/chat';
import { isAzureEndpoint } from '@utils/api';
import { getModelSupportsReasoning } from '@utils/modelLookup';

/** Effort values only supported by OpenRouter's unified reasoning API. */
const OPENROUTER_ONLY_EFFORTS: ReadonlySet<ReasoningEffort> = new Set([
  'none', 'minimal', 'xhigh',
]);

/**
 * Models that only support reasoning.max_tokens (not reasoning.effort).
 * When effort-only is configured, we map effort to a default max_tokens value.
 */
const needsMaxTokensOnly = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  return id.includes('claude');
};

/** Map effort level to a reasonable default max_tokens for models that don't support effort. */
const EFFORT_TO_MAX_TOKENS: Record<ReasoningEffort, number> = {
  none: 0,
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 32768,
};

/**
 * Build the API-ready body from ConfigInterface.
 * Strips client-only fields and conditionally includes reasoning parameters
 * in the format expected by the target provider.
 */
const buildRequestBody = (
  messages: MessageInterface[],
  config: ConfigInterface,
  overrides?: Record<string, unknown>
): Record<string, unknown> => {
  const {
    providerId,
    reasoning_effort,
    reasoning_budget_tokens,
    ...apiConfig
  } = config;

  const body: Record<string, unknown> = {
    messages,
    ...apiConfig,
    max_tokens: config.max_tokens > 0 ? config.max_tokens : undefined,
    ...overrides,
  };

  // Only include reasoning params when the model actually supports reasoning
  if (getModelSupportsReasoning(config.model, providerId)) {
    if (providerId === 'openrouter') {
      // OpenRouter unified reasoning object
      const reasoning: Record<string, unknown> = {};
      if (reasoning_budget_tokens && reasoning_budget_tokens > 0) {
        // Explicit budget always takes precedence
        reasoning.max_tokens = reasoning_budget_tokens;
      } else if (reasoning_effort) {
        if (needsMaxTokensOnly(config.model)) {
          // Claude etc. only support max_tokens, not effort — convert
          const mapped = EFFORT_TO_MAX_TOKENS[reasoning_effort];
          if (mapped > 0) reasoning.max_tokens = mapped;
        } else {
          reasoning.effort = reasoning_effort;
        }
      }
      if (Object.keys(reasoning).length > 0) {
        body.reasoning = reasoning;
      }
    } else {
      // Other providers: top-level params, skip OpenRouter-only values
      if (reasoning_effort && !OPENROUTER_ONLY_EFFORTS.has(reasoning_effort)) {
        body.reasoning_effort = reasoning_effort;
      }
      if (reasoning_budget_tokens && reasoning_budget_tokens > 0) {
        body.reasoning_budget_tokens = reasoning_budget_tokens;
      }
    }
  }

  return body;
};

export const getChatCompletion = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
  signal?: AbortSignal
) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const apiVersion = apiVersionToUse ?? '2024-02-01';
    const path = `openai/deployments/${config.model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }
  endpoint = endpoint.trim();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(messages, config)),
    signal,
  });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return data;
};

export const getChatCompletionStream = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
  signal?: AbortSignal
) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const apiVersion = apiVersionToUse ?? '2024-02-01';
    const path = `openai/deployments/${config.model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }
  endpoint = endpoint.trim();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(messages, config, { stream: true })),
    signal,
  });
  if (response.status === 404 || response.status === 405) {
    const text = await response.text();

    if (text.includes('model_not_found')) {
      throw new Error(
        text +
          '\nMessage from Weavelet Canvas:\nPlease ensure that your account can access the requested OpenAI-compatible model.'
      );
    } else {
      throw new Error(
        'Message from Weavelet Canvas:\nInvalid API endpoint. Please verify your configured OpenAI-compatible endpoint.'
      );
    }
  }

  if (response.status === 429 || !response.ok) {
    const text = await response.text();
    let error = text;
    if (text.includes('insufficient_quota')) {
      error +=
        '\nMessage from Weavelet Canvas:\nWe recommend changing your API endpoint or API key.';
    } else if (response.status === 429) {
      error += '\nRate limited!';
    }
    throw new Error(error);
  }

  const stream = response.body;
  return stream;
};

export const prepareStreamRequest = (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string
): { endpoint: string; headers: Record<string, string>; body: object } => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const apiVersion = apiVersionToUse ?? '2024-02-01';
    const path = `openai/deployments/${config.model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }
  endpoint = endpoint.trim();

  const body = buildRequestBody(messages, config, { stream: true });

  return { endpoint, headers, body };
};

