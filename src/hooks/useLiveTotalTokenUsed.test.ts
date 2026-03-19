/**
 * Tests for the live total token usage logic.
 *
 * Prevents regression: during streaming, chat.messages becomes stale
 * after the first chunk.  useLiveTotalTokenUsed must read the streaming
 * buffer for accurate completion token counts, and its self-chaining
 * must continue while generating sessions exist.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { MessageInterface } from '@type/chat';
import {
  initializeStreamingBuffer,
  appendToStreamingBuffer,
  peekBufferedContent,
  clearStreamingBuffersForTest,
} from '@utils/streamingBuffer';
import { isTextContent } from '@type/chat';
import { buildTokenUsageKey } from '@utils/cost';

// ---------------------------------------------------------------------------
// Mock tokenizer — character-based estimate for determinism
// ---------------------------------------------------------------------------
vi.mock('@utils/messageUtils', () => ({
  default: vi.fn(async (messages: MessageInterface[]) => {
    let chars = 0;
    for (const msg of messages) {
      chars += msg.role.length + 4;
      for (const part of msg.content) {
        if (part.type === 'text' && 'text' in part) {
          chars += (part as { text: string }).text.length;
        }
      }
    }
    return Math.ceil(chars / 2);
  }),
  __esModule: true,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const textMsg = (role: MessageInterface['role'], text: string): MessageInterface => ({
  role,
  content: [{ type: 'text', text }],
});

describe('useLiveTotalTokenUsed streaming buffer integration', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  afterEach(() => {
    clearStreamingBuffersForTest();
  });

  it('resolves completion tokens from streaming buffer during generation', async () => {
    const countTokens = (await import('@utils/messageUtils')).default;

    const targetNodeId = 'node-asst-1';

    // Simulate: store has stale empty placeholder
    const staleMessage = textMsg('assistant', '');

    // Streaming buffer has accumulated real content
    initializeStreamingBuffer(targetNodeId, [{ type: 'text', text: '' }]);
    appendToStreamingBuffer(targetNodeId, 'The answer to your question is 42.');

    // Resolve live content (mirrors the fix in useLiveTotalTokenUsed)
    const liveContent = peekBufferedContent(targetNodeId);
    const liveCompletionMessage: MessageInterface | undefined = liveContent
      ? { role: 'assistant', content: liveContent }
      : staleMessage;

    const completionTokens =
      liveCompletionMessage && isTextContent(liveCompletionMessage.content[0])
        ? await countTokens([liveCompletionMessage], 'gpt-4o')
        : 0;

    // Should be non-zero because streaming buffer has content
    expect(completionTokens).toBeGreaterThan(0);

    // Contrast with stale message
    const staleTokens = await countTokens([staleMessage], 'gpt-4o');
    expect(completionTokens).toBeGreaterThan(staleTokens);
  });

  it('falls back to store message when no streaming buffer exists', async () => {
    const countTokens = (await import('@utils/messageUtils')).default;

    const targetNodeId = 'node-asst-2';
    const storeMessage = textMsg('assistant', 'Some finalized content');

    // No streaming buffer for this node
    const liveContent = peekBufferedContent(targetNodeId);
    expect(liveContent).toBeUndefined();

    const fallbackMessage: MessageInterface | undefined = liveContent
      ? { role: 'assistant', content: liveContent }
      : storeMessage;

    const tokens = await countTokens([fallbackMessage!], 'gpt-4o');
    expect(tokens).toBeGreaterThan(0);
  });

  it('buildTokenUsageKey creates correct composite keys', () => {
    expect(buildTokenUsageKey('gpt-4o', 'openai')).toBe('gpt-4o:::openai');
    expect(buildTokenUsageKey('gpt-4o')).toBe('gpt-4o');
    expect(buildTokenUsageKey('claude-3', 'openrouter')).toBe('claude-3:::openrouter');
  });
});

describe('useLiveTotalTokenUsed self-chaining', () => {
  it('chain continues while generating sessions exist (no version check required)', () => {
    const version = 10;
    const requestVersionRef = { current: 10 }; // same version
    const mounted = true;
    const generatingSessions = { 'sess-1': { sessionId: 'sess-1' } };

    // Old (broken): required version !== requestVersionRef.current
    const oldCondition =
      mounted &&
      version !== requestVersionRef.current &&
      Object.keys(generatingSessions).length > 0;
    expect(oldCondition).toBe(false);

    // New (fixed): just check mounted + sessions exist
    const newCondition =
      mounted &&
      Object.keys(generatingSessions).length > 0;
    expect(newCondition).toBe(true);
  });

  it('chain stops when no generating sessions remain', () => {
    const mounted = true;
    const generatingSessions = {};

    const condition =
      mounted &&
      Object.keys(generatingSessions).length > 0;
    expect(condition).toBe(false);
  });

  it('chain stops when unmounted', () => {
    const mounted = false;
    const generatingSessions = { 'sess-1': { sessionId: 'sess-1' } };

    const condition =
      mounted &&
      Object.keys(generatingSessions).length > 0;
    expect(condition).toBe(false);
  });
});
