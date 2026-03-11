import { describe, expect, it, vi } from 'vitest';
import { MessageInterface } from '@type/chat';

// Stub global Worker so the module can instantiate it
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage() {
    // Simulate an immediate worker error on next tick
    queueMicrotask(() => {
      if (this.onerror) this.onerror(new Event('error'));
    });
  }
  terminate() {}
}

vi.stubGlobal('Worker', FakeWorker);

// Import after stubbing Worker
import countTokens from './messageUtils';

describe('countTokens fallback', () => {
  it('returns a non-zero estimate when the worker is unavailable', async () => {
    const messages: MessageInterface[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello, this is a test message' }],
      },
    ];

    const count = await countTokens(messages, 'gpt-4o');
    expect(count).toBeGreaterThan(0);
  });
});
