import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@utils/api', () => ({
  isAzureEndpoint: vi.fn(() => false),
}));

vi.mock('@utils/modelLookup', () => ({
  getModelSupportsReasoning: vi.fn(() => false),
}));

import { prepareStreamRequest } from './api';
import { getModelSupportsReasoning } from '@utils/modelLookup';
import type { ConfigInterface, MessageInterface } from '@type/chat';

const baseConfig: ConfigInterface = {
  model: 'gpt-4o',
  max_tokens: 4096,
  temperature: 1,
  presence_penalty: 0,
  top_p: 1,
  frequency_penalty: 0,
  stream: true,
};

const messages: MessageInterface[] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('prepareStreamRequest reasoning payloads', () => {
  beforeEach(() => {
    vi.mocked(getModelSupportsReasoning).mockReturnValue(true);
  });

  it('uses adaptive reasoning for OpenRouter Claude 4.6 models when no explicit budget is set', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-opus-4.6',
        providerId: 'openrouter',
        reasoning_effort: 'medium',
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        enabled: true,
      },
    });
  });

  it('also uses adaptive reasoning for OpenRouter Claude Sonnet 4.6 aliases', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-4.6-sonnet',
        providerId: 'openrouter',
        reasoning_effort: 'high',
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        enabled: true,
      },
    });
  });

  it('preserves an explicit reasoning budget for OpenRouter Claude Opus 4.6', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-opus-4.6',
        providerId: 'openrouter',
        reasoning_effort: 'medium',
        reasoning_budget_tokens: 4096,
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        max_tokens: 4096,
      },
    });
  });

  it('maps Claude effort to a reasoning budget for other OpenRouter Claude models', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-sonnet-4',
        providerId: 'openrouter',
        reasoning_effort: 'medium',
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        max_tokens: 8192,
      },
    });
  });

  it('passes effort directly for OpenRouter Claude 4.7+ / Fable models', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-fable-5',
        providerId: 'openrouter',
        reasoning_effort: 'xhigh',
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        effort: 'xhigh',
      },
    });
    expect((body as { reasoning: object }).reasoning).not.toHaveProperty('max_tokens');
  });

  it('ignores an explicit budget on effort-capable Claude models and clamps minimal to low', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-opus-4.8',
        providerId: 'openrouter',
        reasoning_effort: 'minimal',
        reasoning_budget_tokens: 4096,
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        effort: 'low',
      },
    });
    expect((body as { reasoning: object }).reasoning).not.toHaveProperty('max_tokens');
  });

  it('sends reasoning params when force_reasoning is set even if support is not detected', () => {
    vi.mocked(getModelSupportsReasoning).mockReturnValue(false);

    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-fable-5',
        providerId: 'openrouter',
        reasoning_effort: 'high',
        force_reasoning: true,
      }
    );

    expect(body).toMatchObject({
      reasoning: {
        effort: 'high',
      },
    });
    expect(body).not.toHaveProperty('force_reasoning');
  });

  it('omits reasoning params when support is not detected and force_reasoning is unset', () => {
    vi.mocked(getModelSupportsReasoning).mockReturnValue(false);

    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'some/unknown-model',
        providerId: 'openrouter',
        reasoning_effort: 'high',
      }
    );

    expect(body).not.toHaveProperty('reasoning');
  });

  it('omits reasoning config when effort is none', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-opus-4.6',
        providerId: 'openrouter',
        reasoning_effort: 'none',
      }
    );

    expect(body).not.toHaveProperty('reasoning');
  });

  it('includes verbosity for OpenRouter requests', () => {
    const { body } = prepareStreamRequest(
      'https://openrouter.ai/api/v1/chat/completions',
      messages,
      {
        ...baseConfig,
        model: 'anthropic/claude-sonnet-4',
        providerId: 'openrouter',
        verbosity: 'high',
      }
    );

    expect(body).toMatchObject({
      verbosity: 'high',
    });
  });
});
