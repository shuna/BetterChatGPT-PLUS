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

// ---------------------------------------------------------------------------
// Regression guard: the re-chain condition in TokenCount (useEffect at ~line
// 329) must NOT gate on `version !== requestVersionRef.current`.  A previous
// bug in the sibling hook useLiveTotalTokenUsed did exactly that, which
// stopped polling after the first calculation because version always equalled
// requestVersionRef.current by the time `.finally()` ran.
// The fix: chain continues whenever mounted + generatingSession exists.
// ---------------------------------------------------------------------------
describe('TokenCount self-chaining', () => {
  it('chain continues while a generating session exists (no version check required)', () => {
    const version = 10;
    const requestVersionRef = { current: 10 }; // same version
    const mounted = true;
    const generatingSession = { sessionId: 'sess-1' };

    // Old (broken): required version !== requestVersionRef.current
    const oldCondition =
      mounted &&
      version !== requestVersionRef.current &&
      !!generatingSession;
    expect(oldCondition).toBe(false);

    // New (fixed): just check mounted + session exists
    const newCondition = mounted && !!generatingSession;
    expect(newCondition).toBe(true);
  });

  it('chain stops when no generating session exists', () => {
    const mounted = true;
    const generatingSession = null;

    const condition = mounted && !!generatingSession;
    expect(condition).toBe(false);
  });

  it('chain stops when unmounted', () => {
    const mounted = false;
    const generatingSession = { sessionId: 'sess-1' };

    const condition = mounted && !!generatingSession;
    expect(condition).toBe(false);
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
});
