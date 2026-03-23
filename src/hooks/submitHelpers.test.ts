import { describe, expect, it } from 'vitest';

import { _defaultChatConfig } from '@constants/chat';
import type { MessageInterface } from '@type/chat';
import type { FavoriteModel } from '@type/provider';
import { DEFAULT_PROVIDERS } from '@store/provider-config';
import {
  buildGeneratingSession,
  buildTitlePromptMessage,
  getSubmitContextMessages,
  resolveProviderForModel,
  sanitizeMessagesForSubmit,
} from './submitHelpers';
import { hasMeaningfulContent, hasMeaningfulMessageContent } from '@utils/contentValidation';

const textMessage = (role: MessageInterface['role'], text: string): MessageInterface => ({
  role,
  content: [{ type: 'text', text }],
});

describe('submitHelpers', () => {
  it('builds a generating session with expected metadata', () => {
    const session = buildGeneratingSession(
      'session-1',
      'chat-1',
      2,
      3,
      'node-3',
      'midchat',
      3
    );

    expect(session).toMatchObject({
      sessionId: 'session-1',
      chatId: 'chat-1',
      chatIndex: 2,
      messageIndex: 3,
      targetNodeId: 'node-3',
      mode: 'midchat',
      insertIndex: 3,
      requestPath: 'sw',
    });
    expect(session.startedAt).toEqual(expect.any(Number));
  });

  it('resolves provider config from favorite model selection', () => {
    const favoriteModels: FavoriteModel[] = [
      { modelId: 'gpt-4o', providerId: 'openai' },
    ];

    const resolved = resolveProviderForModel(
      'gpt-4o',
      favoriteModels,
      {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1/chat/completions',
          modelsRequireAuth: true,
          apiKey: 'secret',
        },
      },
      { endpoint: 'fallback', key: 'fallback-key' }
    );

    expect(resolved).toEqual({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      key: 'secret',
    });
  });

  it('falls back to the default provider endpoint when persisted config is blank', () => {
    const resolved = resolveProviderForModel(
      'anthropic/claude-opus-4.6',
      [],
      {
        openrouter: {
          ...DEFAULT_PROVIDERS.openrouter,
          endpoint: '',
          apiKey: 'router-key',
        },
      },
      { endpoint: 'fallback', key: 'fallback-key' },
      'openrouter'
    );

    expect(resolved).toEqual({
      endpoint: DEFAULT_PROVIDERS.openrouter.endpoint,
      key: 'router-key',
    });
  });

  it('builds title prompt message and submit context slices', () => {
    const userMessage = textMessage('user', 'Question');
    const assistantMessage = textMessage('assistant', 'Answer');
    const titlePrompt = buildTitlePromptMessage(
      userMessage.content,
      assistantMessage.content,
      'ja'
    );

    expect(titlePrompt.role).toBe('user');
    expect(titlePrompt.content.at(-1)).toEqual({
      type: 'text',
      text: 'Generate a title in less than 6 words for the conversation so far (language: ja)',
    });

    const contextMessages = getSubmitContextMessages(
      [userMessage, assistantMessage, textMessage('assistant', '')],
      'append',
      2
    );
    expect(contextMessages).toEqual([userMessage, assistantMessage]);
  });

  it('strips system messages for reasoning models', () => {
    const systemMsg = textMessage('system', 'You are helpful');
    const userMsg = textMessage('user', 'Hello');
    const messages = [systemMsg, userMsg, textMessage('assistant', '')];

    const withO1 = getSubmitContextMessages(messages, 'append', 2, 'o1-preview');
    expect(withO1).toEqual([userMsg]);

    const withO3 = getSubmitContextMessages(messages, 'append', 2, 'o3-mini-high');
    expect(withO3).toEqual([userMsg]);

    const withGpt4 = getSubmitContextMessages(messages, 'append', 2, 'gpt-4o');
    expect(withGpt4).toEqual([systemMsg, userMsg]);
  });

  it('treats whitespace-only text as empty while preserving images', () => {
    expect(hasMeaningfulContent([{ type: 'text', text: '   \n\t' }])).toBe(false);
    expect(
      hasMeaningfulContent([
        { type: 'text', text: '   ' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
      ])
    ).toBe(true);
    expect(hasMeaningfulMessageContent([textMessage('user', '   ')])).toBe(false);
    expect(
      hasMeaningfulMessageContent([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://example.com/x.png', detail: 'low' } }],
        },
      ])
    ).toBe(true);
  });

  it('drops empty text and reasoning blocks before submit', () => {
    const sanitized = sanitizeMessagesForSubmit([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: '   ' },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: ' ask ' },
          { type: 'reasoning', text: 'ignore' },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.com/x.png', detail: 'low' } }],
      },
    ] as MessageInterface[]);

    expect(sanitized).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: ' ask ' }],
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.com/x.png', detail: 'low' } }],
      },
    ]);
  });
});
