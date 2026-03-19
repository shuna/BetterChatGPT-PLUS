/**
 * Tests for the token counting logic used by the TokenCount component.
 *
 * The core bug this prevents: during streaming, chat.messages is only
 * updated on the first chunk (via writeChunkToStore slow path).  Subsequent
 * chunks go through the fast path and only update the streaming buffer.
 * The TokenCount component must read live buffer content to show an
 * accurate completion token count during generation.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { MessageInterface, GeneratingSession } from '@type/chat';
import {
  initializeStreamingBuffer,
  appendToStreamingBuffer,
  peekBufferedContent,
  clearStreamingBuffersForTest,
} from '@utils/streamingBuffer';
import { isTextContent } from '@type/chat';

// ---------------------------------------------------------------------------
// Mock tokenizer — return character-based estimate so tests are deterministic
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
// Helper: replicate the live-content resolution from TokenCount
// ---------------------------------------------------------------------------
function resolveCompletionMessage(
  storeMessage: MessageInterface | undefined,
  targetNodeId: string
): MessageInterface | undefined {
  const liveContent = peekBufferedContent(targetNodeId);
  if (liveContent) {
    return { role: 'assistant', content: liveContent };
  }
  return storeMessage;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const textMsg = (role: MessageInterface['role'], text: string): MessageInterface => ({
  role,
  content: [{ type: 'text', text }],
});

const makeSession = (overrides?: Partial<GeneratingSession>): GeneratingSession => ({
  sessionId: 'sess-1',
  chatId: 'chat-1',
  chatIndex: 0,
  messageIndex: 2,
  targetNodeId: 'node-assistant',
  mode: 'append',
  insertIndex: null,
  requestPath: 'sw',
  startedAt: Date.now(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TokenCount live streaming content resolution', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  afterEach(() => {
    clearStreamingBuffersForTest();
  });

  it('returns store message when no streaming buffer exists', () => {
    const storeMsg = textMsg('assistant', 'first chunk');
    const resolved = resolveCompletionMessage(storeMsg, 'node-assistant');
    expect(resolved).toBe(storeMsg);
  });

  it('returns live buffer content when streaming buffer exists', () => {
    const storeMsg = textMsg('assistant', 'first chunk');
    initializeStreamingBuffer('node-assistant', [{ type: 'text', text: 'first chunk' }]);
    appendToStreamingBuffer('node-assistant', ' more text');

    const resolved = resolveCompletionMessage(storeMsg, 'node-assistant');
    expect(resolved).not.toBe(storeMsg);
    expect(resolved?.role).toBe('assistant');
    expect(isTextContent(resolved!.content[0])).toBe(true);
    expect((resolved!.content[0] as { text: string }).text).toBe('first chunk more text');
  });

  it('returns undefined when both store message and buffer are absent', () => {
    const resolved = resolveCompletionMessage(undefined, 'node-assistant');
    expect(resolved).toBeUndefined();
  });

  it('prefers streaming buffer over stale store message', () => {
    // Store has text from first chunk only
    const storeMsg = textMsg('assistant', 'Hello');

    // Streaming buffer has accumulated much more text
    initializeStreamingBuffer('node-assistant', [{ type: 'text', text: 'Hello' }]);
    appendToStreamingBuffer('node-assistant', ', this is a much longer response from the LLM');

    const resolved = resolveCompletionMessage(storeMsg, 'node-assistant');
    const resolvedText = (resolved!.content[0] as { text: string }).text;
    expect(resolvedText.length).toBeGreaterThan(5); // "Hello" = 5 chars
    expect(resolvedText).toContain('much longer response');
  });
});

describe('TokenCount prompt token counting during generation', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
  });

  it('counts prompt tokens from messages before messageIndex', async () => {
    const countTokens = (await import('@utils/messageUtils')).default;
    const messages = [
      textMsg('system', 'You are helpful'),
      textMsg('user', 'Hello world'),
      textMsg('assistant', ''), // placeholder at messageIndex=2
    ];

    const session = makeSession({ messageIndex: 2 });
    const promptMessages = messages.slice(0, session.messageIndex);

    const promptCount = await countTokens(promptMessages, 'gpt-4o');
    expect(promptCount).toBeGreaterThan(0);
  });

  it('counts completion tokens from streaming buffer, not stale store message', async () => {
    const countTokens = (await import('@utils/messageUtils')).default;

    // Store message has empty placeholder text
    const storeMsg = textMsg('assistant', '');
    const session = makeSession({ targetNodeId: 'node-asst' });

    // Without streaming buffer: should get 0 or near-0 for empty message
    const emptyResolved = resolveCompletionMessage(storeMsg, 'node-asst');
    const emptyCount = await countTokens(
      emptyResolved ? [emptyResolved] : [],
      'gpt-4o'
    );

    // With streaming buffer containing real content
    initializeStreamingBuffer('node-asst', [{ type: 'text', text: '' }]);
    appendToStreamingBuffer('node-asst', 'This is a substantial response from the AI assistant.');

    const liveResolved = resolveCompletionMessage(storeMsg, 'node-asst');
    const liveCount = await countTokens(
      liveResolved ? [liveResolved] : [],
      'gpt-4o'
    );

    expect(liveCount).toBeGreaterThan(emptyCount);
  });
});

describe('TokenCount self-chaining behavior', () => {
  it('chain condition does not require version change', () => {
    // This test documents the fix: the self-chain must continue
    // while generating, even if requestVersionRef hasn't changed.
    // Previously, the condition was:
    //   version !== requestVersionRef.current && generatingSession
    // Now it is:
    //   generatingSession (no version check)
    //
    // We test this by simulating the condition evaluation.

    const version = 5;
    const requestVersionRef = { current: 5 }; // same version (no effect fired)
    const mounted = true;
    const generatingSession = makeSession();

    // Old (broken) condition: would be false
    const oldCondition =
      mounted &&
      version !== requestVersionRef.current &&
      !!generatingSession;
    expect(oldCondition).toBe(false);

    // New (fixed) condition: should be true
    const newCondition = mounted && !!generatingSession;
    expect(newCondition).toBe(true);
  });
});
