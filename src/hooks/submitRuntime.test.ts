import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  executeSubmitStream,
  createSubmitAbortController,
  clearSubmitSessionRuntime,
  stopSubmitSession,
  writeChunkToStore,
} from './submitRuntime';

// ---------------------------------------------------------------------------
// Mock zustand store
// ---------------------------------------------------------------------------
const mockRemoveSession = vi.fn();
let mockState: Record<string, unknown> = {};
const mockGetChatCompletion = vi.fn();

vi.mock('@store/store', () => ({
  default: {
    getState: () => ({
      generatingSessions: {},
      removeSession: mockRemoveSession,
      customModels: [],
      totalTokenUsed: {},
      setTotalTokenUsed: () => {},
      ...mockState,
    }),
    setState: (updater: (s: any) => any) => {
      const newState = updater(mockState);
      if (newState) Object.assign(mockState, newState);
    },
  },
}));

vi.mock('@utils/branchUtils', () => ({
  upsertActivePathMessage: vi.fn(),
}));

vi.mock('@constants/modelLoader', () => ({
  modelOptions: [],
  modelMaxToken: {},
  modelCost: {},
  modelTypes: {},
  modelStreamSupport: {},
  modelDisplayNames: {},
  initializeModels: vi.fn(),
}));

vi.mock('@utils/chatShallowClone', () => ({
  cloneChatAtIndex: (chats: any[], index: number) => {
    const cloned = [...chats];
    cloned[index] = { ...chats[index], messages: [...chats[index].messages] };
    return cloned;
  },
}));

vi.mock('@api/api', () => ({
  getChatCompletion: (...args: unknown[]) => mockGetChatCompletion(...args),
  getChatCompletionStream: vi.fn(),
  prepareStreamRequest: vi.fn(),
}));

vi.mock('@utils/swBridge', () => ({
  waitForController: vi.fn(async () => false),
  startStream: vi.fn(),
}));

beforeEach(() => {
  mockRemoveSession.mockClear();
  mockGetChatCompletion.mockReset();
  mockState = {};
});

// ---------------------------------------------------------------------------
// abort controller lifecycle
// ---------------------------------------------------------------------------
describe('abort controller lifecycle', () => {
  it('creates and stores an abort controller', () => {
    const ctrl = createSubmitAbortController('sess-1');
    expect(ctrl).toBeInstanceOf(AbortController);
    expect(ctrl.signal.aborted).toBe(false);
  });

  it('clearSubmitSessionRuntime does not throw for unknown session', () => {
    expect(() => clearSubmitSessionRuntime('nonexistent')).not.toThrow();
  });

  it('stopSubmitSession aborts and calls removeSession', () => {
    const ctrl = createSubmitAbortController('sess-2');
    stopSubmitSession('sess-2');
    expect(ctrl.signal.aborted).toBe(true);
    expect(mockRemoveSession).toHaveBeenCalledWith('sess-2');
  });
});

// ---------------------------------------------------------------------------
// writeChunkToStore
// ---------------------------------------------------------------------------
describe('writeChunkToStore', () => {
  it('appends text to the first content entry of the target message', () => {
    mockState = {
      chats: [
        {
          id: 'chat-1',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {},
    };

    writeChunkToStore('chat-1', 1, 'Hello');

    const msg = (mockState as any).chats[0].messages[1];
    expect(msg.content[0].text).toBe('Hello');
  });

  it('accumulates multiple chunks', () => {
    mockState = {
      chats: [
        {
          id: 'chat-a',
          messages: [
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {},
    };

    writeChunkToStore('chat-a', 0, 'one');
    writeChunkToStore('chat-a', 0, ' two');

    const msg = (mockState as any).chats[0].messages[0];
    expect(msg.content[0].text).toBe('one two');
  });

  it('is a no-op when chatId is not found', () => {
    mockState = { chats: [{ id: 'other', messages: [] }], contentStore: {} };
    // Should not throw
    writeChunkToStore('nonexistent', 0, 'text');
  });
});

describe('executeSubmitStream', () => {
  it('retries once without system messages when provider rejects them', async () => {
    mockState = {
      generatingSessions: { 'sess-1': { sessionId: 'sess-1' } },
      chats: [
        {
          id: 'chat-1',
          messages: [
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {},
      favoriteModels: [],
      providerModelCache: {},
      customModels: [],
    };

    mockGetChatCompletion
      .mockRejectedValueOnce(new Error('This model does not support system messages'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      });

    await executeSubmitStream({
      sessionId: 'sess-1',
      chatId: 'chat-1',
      chatIndex: 0,
      messageIndex: 0,
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'be helpful' }] },
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ],
      config: { model: 'unknown-reasoning-model', max_tokens: 1000, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: false },
      resolvedProvider: { endpoint: 'https://example.com/v1/chat/completions', key: 'secret' },
      abortController: new AbortController(),
      t: (key) => key,
    });

    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);
    expect(mockGetChatCompletion.mock.calls[0]?.[1]).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'be helpful' }] },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(mockGetChatCompletion.mock.calls[1]?.[1]).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]);
    expect((mockState as any).chats[0].messages[0].content[0].text).toBe('ok');
  });
});
