import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  queueChunkToStore,
  executeSubmitStream,
  createSubmitAbortController,
  clearSubmitSessionRuntime,
  stopSubmitSession,
  flushQueuedChunks,
  writeChunkToStore,
  finalizeStreamingNode,
} from './submitRuntime';
import { clearStreamingBuffersForTest } from '@utils/streamingBuffer';

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
      providerCustomModels: {},
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

vi.mock('@constants/modelLoader', () => ({
  modelOptions: [],
  modelMaxToken: {},
  modelCost: {},
  modelTypes: {},
  modelStreamSupport: {},
  modelDisplayNames: {},
  initializeModels: vi.fn(),
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
  clearStreamingBuffersForTest();
  vi.useRealTimers();
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

  it('stopSubmitSession discards queued chunks for the stopped session', () => {
    vi.useFakeTimers();
    mockState = {
      generatingSessions: {
        'sess-3': {
          sessionId: 'sess-3',
          chatId: 'chat-1',
          chatIndex: 0,
          messageIndex: 1,
          targetNodeId: 'node-assistant',
          mode: 'append',
          insertIndex: null,
          requestPath: 'fetch',
          startedAt: 1,
        },
      },
      chats: [
        {
          id: 'chat-1',
          branchTree: {
            rootId: 'node-user',
            activePath: ['node-user', 'node-assistant'],
            nodes: {
              'node-user': {
                id: 'node-user',
                parentId: null,
                role: 'user',
                contentHash: 'user-hash',
                createdAt: 1,
              },
              'node-assistant': {
                id: 'node-assistant',
                parentId: 'node-user',
                role: 'assistant',
                contentHash: 'assistant-hash',
                createdAt: 2,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'user-hash': { content: [{ type: 'text', text: 'hi' }], refCount: 1 },
        'assistant-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
    };

    createSubmitAbortController('sess-3');
    queueChunkToStore('chat-1', 'node-assistant', 'partial');
    stopSubmitSession('sess-3');
    vi.advanceTimersByTime(100);

    expect((mockState as any).chats[0].messages[1].content[0].text).toBe('');
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
          branchTree: {
            rootId: 'node-user',
            activePath: ['node-user', 'node-assistant'],
            nodes: {
              'node-user': {
                id: 'node-user',
                parentId: null,
                role: 'user',
                contentHash: 'user-hash',
                createdAt: 1,
              },
              'node-assistant': {
                id: 'node-assistant',
                parentId: 'node-user',
                role: 'assistant',
                contentHash: 'assistant-hash',
                createdAt: 2,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'user-hash': { content: [{ type: 'text', text: 'hi' }], refCount: 1 },
        'assistant-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
    };

    writeChunkToStore('chat-1', 'node-assistant', 'Hello');

    const msg = (mockState as any).chats[0].messages[1];
    expect(msg.content[0].text).toBe('Hello');
  });

  it('tracks the target bubble after reordering activePath', () => {
    mockState = {
      chats: [
        {
          id: 'chat-a',
          branchTree: {
            rootId: 'node-1',
            activePath: ['node-2', 'node-1'],
            nodes: {
              'node-1': {
                id: 'node-1',
                parentId: 'node-2',
                role: 'assistant',
                contentHash: 'hash-1',
                createdAt: 2,
              },
              'node-2': {
                id: 'node-2',
                parentId: null,
                role: 'user',
                contentHash: 'hash-2',
                createdAt: 1,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'hash-1': { content: [{ type: 'text', text: '' }], refCount: 1 },
        'hash-2': { content: [{ type: 'text', text: 'prompt' }], refCount: 1 },
      },
    };

    writeChunkToStore('chat-a', 'node-1', 'one');
    // Second chunk uses the fast path (buffer only, no store update).
    writeChunkToStore('chat-a', 'node-1', ' two');
    // Finalize writes accumulated buffer back to the store.
    finalizeStreamingNode('chat-a', 'node-1');

    const msg = (mockState as any).chats[0].messages[1];
    expect(msg.content[0].text).toBe('one two');
  });

  it('is a no-op when chatId is not found', () => {
    mockState = { chats: [{ id: 'other', messages: [] }], contentStore: {} };
    // Should not throw
    writeChunkToStore('nonexistent', 'node-1', 'text');
  });

  it('buffers streaming chunks until the scheduled flush', () => {
    vi.useFakeTimers();
    mockState = {
      chats: [
        {
          id: 'chat-1',
          branchTree: {
            rootId: 'node-user',
            activePath: ['node-user', 'node-assistant'],
            nodes: {
              'node-user': {
                id: 'node-user',
                parentId: null,
                role: 'user',
                contentHash: 'user-hash',
                createdAt: 1,
              },
              'node-assistant': {
                id: 'node-assistant',
                parentId: 'node-user',
                role: 'assistant',
                contentHash: 'assistant-hash',
                createdAt: 2,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'user-hash': { content: [{ type: 'text', text: 'hi' }], refCount: 1 },
        'assistant-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
    };

    queueChunkToStore('chat-1', 'node-assistant', 'Hel');
    queueChunkToStore('chat-1', 'node-assistant', 'lo');

    expect((mockState as any).chats[0].messages[1].content[0].text).toBe('');

    vi.advanceTimersByTime(100);

    expect((mockState as any).chats[0].messages[1].content[0].text).toBe('Hello');
  });

  it('flushes buffered text immediately when requested', () => {
    vi.useFakeTimers();
    mockState = {
      chats: [
        {
          id: 'chat-1',
          branchTree: {
            rootId: 'node-user',
            activePath: ['node-user', 'node-assistant'],
            nodes: {
              'node-user': {
                id: 'node-user',
                parentId: null,
                role: 'user',
                contentHash: 'user-hash',
                createdAt: 1,
              },
              'node-assistant': {
                id: 'node-assistant',
                parentId: 'node-user',
                role: 'assistant',
                contentHash: 'assistant-hash',
                createdAt: 2,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'user-hash': { content: [{ type: 'text', text: 'hi' }], refCount: 1 },
        'assistant-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
    };

    queueChunkToStore('chat-1', 'node-assistant', 'partial');
    flushQueuedChunks('chat-1', 'node-assistant');

    expect((mockState as any).chats[0].messages[1].content[0].text).toBe('partial');
  });

  it('finalizes buffered content into contentStore once streaming completes', () => {
    mockState = {
      chats: [
        {
          id: 'chat-1',
          branchTree: {
            rootId: 'node-user',
            activePath: ['node-user', 'node-assistant'],
            nodes: {
              'node-user': {
                id: 'node-user',
                parentId: null,
                role: 'user',
                contentHash: 'user-hash',
                createdAt: 1,
              },
              'node-assistant': {
                id: 'node-assistant',
                parentId: 'node-user',
                role: 'assistant',
                contentHash: 'assistant-hash',
                createdAt: 2,
              },
            },
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'user-hash': { content: [{ type: 'text', text: 'hi' }], refCount: 1 },
        'assistant-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
    };

    writeChunkToStore('chat-1', 'node-assistant', 'Hello');
    finalizeStreamingNode('chat-1', 'node-assistant');

    const state = mockState as any;
    const nodeHash = state.chats[0].branchTree.nodes['node-assistant'].contentHash;
    expect(nodeHash.startsWith('__streaming:')).toBe(false);
    expect(state.contentStore[nodeHash].content[0].text).toBe('Hello');
  });
});

describe('executeSubmitStream', () => {
  it('retries once without system messages when provider rejects them', async () => {
    mockState = {
      generatingSessions: { 'sess-1': { sessionId: 'sess-1' } },
      chats: [
        {
          id: 'chat-1',
          branchTree: {
            rootId: 'node-1',
            activePath: ['node-1'],
            nodes: {
              'node-1': {
                id: 'node-1',
                parentId: null,
                role: 'assistant',
                contentHash: 'hash-1',
                createdAt: 1,
              },
            },
          },
          messages: [
            { role: 'assistant', content: [{ type: 'text', text: '' }] },
          ],
        },
      ],
      contentStore: {
        'hash-1': { content: [{ type: 'text', text: '' }], refCount: 1 },
      },
      favoriteModels: [],
      providerModelCache: {},
      providerCustomModels: {},
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
      targetNodeId: 'node-1',
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
