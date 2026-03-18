import { describe, expect, it } from 'vitest';
import {
  resolveRecoveryStatus,
  shouldApplyRecoveredText,
  buildRecoveredMessage,
  getCurrentMessageText,
  findRecoverableChat,
  hasRecoverableMessage,
} from './streamRecoveryHelpers';
import type { StreamRecord } from '@utils/streamDb';
import type { ChatInterface, MessageInterface } from '@type/chat';

// ---------------------------------------------------------------------------
// resolveRecoveryStatus
// ---------------------------------------------------------------------------
describe('resolveRecoveryStatus', () => {
  const base: StreamRecord = {
    requestId: 'r1',
    chatIndex: 0,
    messageIndex: 1,
    bufferedText: '',
    status: 'streaming',
    createdAt: 0,
    updatedAt: 0,
    acknowledged: false,
  };

  it('returns status as-is for non-streaming statuses', () => {
    expect(resolveRecoveryStatus({ ...base, status: 'completed' })).toBe('completed');
    expect(resolveRecoveryStatus({ ...base, status: 'failed' })).toBe('failed');
    expect(resolveRecoveryStatus({ ...base, status: 'interrupted' })).toBe('interrupted');
  });

  it('returns "streaming" when updatedAt is recent', () => {
    const now = Date.now();
    expect(
      resolveRecoveryStatus({ ...base, status: 'streaming', updatedAt: now - 5000 }, now)
    ).toBe('streaming');
  });

  it('returns "interrupted" when updatedAt is stale (>30s)', () => {
    const now = Date.now();
    expect(
      resolveRecoveryStatus({ ...base, status: 'streaming', updatedAt: now - 31000 }, now)
    ).toBe('interrupted');
  });

  it('returns "interrupted" at exactly 30s boundary', () => {
    const now = Date.now();
    // updatedAt + 30001 > threshold
    expect(
      resolveRecoveryStatus({ ...base, status: 'streaming', updatedAt: now - 30001 }, now)
    ).toBe('interrupted');
  });
});

// ---------------------------------------------------------------------------
// shouldApplyRecoveredText
// ---------------------------------------------------------------------------
describe('shouldApplyRecoveredText', () => {
  it('returns true when buffered text is longer', () => {
    expect(shouldApplyRecoveredText('short', 'longer text')).toBe(true);
  });

  it('returns false when current text is equal length', () => {
    expect(shouldApplyRecoveredText('same', 'same')).toBe(false);
  });

  it('returns false when current text is longer', () => {
    expect(shouldApplyRecoveredText('longer text', 'short')).toBe(false);
  });

  it('returns true for empty current text', () => {
    expect(shouldApplyRecoveredText('', 'recovered')).toBe(true);
  });

  it('returns false for empty recovered text', () => {
    expect(shouldApplyRecoveredText('existing', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCurrentMessageText
// ---------------------------------------------------------------------------
describe('getCurrentMessageText', () => {
  it('returns text from first TextContent', () => {
    const msg: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'text', text: 'hello world' }],
    };
    expect(getCurrentMessageText(msg)).toBe('hello world');
  });

  it('returns empty string for undefined message', () => {
    expect(getCurrentMessageText(undefined)).toBe('');
  });

  it('returns empty string for non-text first content', () => {
    const msg: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'image_url', image_url: { url: 'data:...' } }] as any,
    };
    expect(getCurrentMessageText(msg)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildRecoveredMessage
// ---------------------------------------------------------------------------
describe('buildRecoveredMessage', () => {
  it('replaces text content with recovered text', () => {
    const msg: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'text', text: 'partial' }],
    };
    const recovered = buildRecoveredMessage(msg, 'full recovered text');
    expect(recovered.content[0]).toEqual({ type: 'text', text: 'full recovered text' });
    expect(recovered.role).toBe('assistant');
  });

  it('preserves additional content parts', () => {
    const msg: MessageInterface = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'partial' },
        { type: 'text', text: 'extra' },
      ],
    };
    const recovered = buildRecoveredMessage(msg, 'full text');
    expect(recovered.content).toHaveLength(2);
    expect(recovered.content[0]).toEqual({ type: 'text', text: 'full text' });
    expect(recovered.content[1]).toEqual({ type: 'text', text: 'extra' });
  });

  it('creates text content when first part is not text', () => {
    const msg: MessageInterface = {
      role: 'assistant',
      content: [{ type: 'image_url', image_url: { url: 'data:...' } }] as any,
    };
    const recovered = buildRecoveredMessage(msg, 'recovered');
    expect(recovered.content[0]).toEqual({ type: 'text', text: 'recovered' });
  });
});

// ---------------------------------------------------------------------------
// findRecoverableChat
// ---------------------------------------------------------------------------
describe('findRecoverableChat', () => {
  const chats = [
    { id: 'c0', messages: [] },
    { id: 'c1', messages: [{ role: 'user', content: [] }] },
  ] as unknown as ChatInterface[];

  it('returns chat at valid index', () => {
    expect(findRecoverableChat(chats, 0)?.id).toBe('c0');
    expect(findRecoverableChat(chats, 1)?.id).toBe('c1');
  });

  it('returns null for out-of-range index', () => {
    expect(findRecoverableChat(chats, -1)).toBeNull();
    expect(findRecoverableChat(chats, 5)).toBeNull();
  });

  it('returns null for undefined chats', () => {
    expect(findRecoverableChat(undefined, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasRecoverableMessage
// ---------------------------------------------------------------------------
describe('hasRecoverableMessage', () => {
  const chat = {
    id: 'c',
    messages: [
      { role: 'user', content: [] },
      { role: 'assistant', content: [] },
    ],
  } as unknown as ChatInterface;

  it('returns true for valid message index', () => {
    expect(hasRecoverableMessage(chat, 0)).toBe(true);
    expect(hasRecoverableMessage(chat, 1)).toBe(true);
  });

  it('returns false for out-of-range index', () => {
    expect(hasRecoverableMessage(chat, -1)).toBe(false);
    expect(hasRecoverableMessage(chat, 5)).toBe(false);
  });
});
