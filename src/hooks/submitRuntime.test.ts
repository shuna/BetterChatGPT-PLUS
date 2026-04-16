import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  queueChunkToStore,
  executeSubmitStream,
  executeLocalSubmit,
  createSubmitAbortController,
  clearSubmitSessionRuntime,
  stopSubmitSession,
  flushQueuedChunks,
  writeChunkToStore,
  finalizeStreamingNode,
} from './submitRuntime';
import { buildLocalPromptFromContext } from './submitHelpers';
import { clearStreamingBuffersForTest } from '@utils/streamingBuffer';
import { useStreamEndStatusStore } from '@store/stream-end-status-store';
import * as swBridge from '@utils/swBridge';
import { prepareStreamRequest } from '@api/api';

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

// ---------------------------------------------------------------------------
// Mock local-llm/runtime for executeLocalSubmit tests
// ---------------------------------------------------------------------------
const mockAbort = vi.fn();
let mockGenerateImpl: ((prompt: string, opts: any, onChunk: (text: string) => void) => Promise<string>) | null = null;

vi.mock('@src/local-llm/runtime', () => ({
  localModelRuntime: {
    ensureLoaded: vi.fn(async () => {}),
    getWllamaEngine: vi.fn(() => ({
      generate: async (prompt: string, opts: any, onChunk: (text: string) => void) => {
        if (mockGenerateImpl) return mockGenerateImpl(prompt, opts, onChunk);
        return '';
      },
      abort: mockAbort,
    })),
  },
}));

vi.mock('./submitHelpers', async () => {
  const actual = await vi.importActual<typeof import('./submitHelpers')>('./submitHelpers');
  return {
    ...actual,
    buildLocalPromptFromContext: vi.fn(() => 'test prompt'),
  };
});

beforeEach(() => {
  mockRemoveSession.mockClear();
  mockGetChatCompletion.mockReset();
  mockState = {};
  clearStreamingBuffersForTest();
  vi.useRealTimers();
  // Reset stream end status store between tests
  const { statuses } = useStreamEndStatusStore.getState();
  Object.keys(statuses).forEach((k) => useStreamEndStatusStore.getState().clearStatus(k));
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

  it('clearSubmitSessionRuntime flushes queued chunks during normal cleanup', () => {
    vi.useFakeTimers();
    mockState = {
      generatingSessions: {
        'sess-cleanup': {
          sessionId: 'sess-cleanup',
          chatId: 'chat-1',
          chatIndex: 0,
          messageIndex: 1,
          targetNodeId: 'node-assistant',
          mode: 'append',
          insertIndex: null,
          requestPath: 'sw',
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

    createSubmitAbortController('sess-cleanup');
    writeChunkToStore('chat-1', 'node-assistant', 'Hello');
    queueChunkToStore('chat-1', 'node-assistant', ' world');

    clearSubmitSessionRuntime('sess-cleanup');

    const state = mockState as any;
    const nodeHash = state.chats[0].branchTree.nodes['node-assistant'].contentHash;
    expect(nodeHash.startsWith('__streaming:')).toBe(false);
    expect(state.contentStore[nodeHash].content[0].text).toBe('Hello world');
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

// ---------------------------------------------------------------------------
// stream end status — SW path
// ---------------------------------------------------------------------------
describe('stream end status via SW path', () => {
  const makeMockState = (sessionId: string) => ({
    generatingSessions: {
      [sessionId]: {
        sessionId,
        chatId: 'chat-1',
        chatIndex: 0,
        messageIndex: 0,
        targetNodeId: 'node-assistant',
        mode: 'append',
        insertIndex: null,
        requestPath: 'sw',
        startedAt: 1,
      },
    },
    chats: [
      {
        id: 'chat-1',
        config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
        branchTree: {
          rootId: 'node-user',
          activePath: ['node-user', 'node-assistant'],
          nodes: {
            'node-user': { id: 'node-user', parentId: null, role: 'user', contentHash: 'user-hash', createdAt: 1 },
            'node-assistant': { id: 'node-assistant', parentId: 'node-user', role: 'assistant', contentHash: 'asst-hash', createdAt: 2 },
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
      'asst-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
    },
    favoriteModels: [],
    providerModelCache: {},
    providerCustomModels: {},
    // Enable proxy so SW path is used (SW path is now proxy-only)
    proxyEnabled: true,
    proxyEndpoint: 'https://proxy.test',
    proxyAuthToken: '',
  });

  it('preserves interrupted status when user cancels on SW path', async () => {
    vi.useFakeTimers();
    const sessionId = 'sess-sw-cancel';
    mockState = makeMockState(sessionId);

    // Enable SW path
    vi.mocked(swBridge.waitForController).mockResolvedValue(true);
    vi.mocked(prepareStreamRequest as any).mockReturnValue({
      endpoint: 'https://example.com/v1/chat/completions',
      headers: {},
      body: {},
    });

    // Mock startStream: simulate SW that sends a chunk then user cancels
    vi.mocked(swBridge.startStream).mockImplementation(async (params) => {
      // Send a chunk
      params.onChunk('Hello');
      // Don't call onDone — user will cancel via stopSubmitSession
      return { cancel: vi.fn() };
    });

    const abortController = createSubmitAbortController(sessionId);

    const streamPromise = executeSubmitStream({
      sessionId,
      chatId: 'chat-1',
      chatIndex: 0,
      messageIndex: 0,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      resolvedProvider: { endpoint: 'https://example.com/v1/chat/completions', key: 'secret' },
      abortController,
      t: (key) => key,
    });

    // Simulate user cancel: remove the session from generatingSessions
    // (this is what stopSubmitSession does before the checkStop interval fires)
    (mockState as any).generatingSessions = {};
    useStreamEndStatusStore.getState().setStatus('node-assistant', 'interrupted');

    // Advance timer so checkStop interval fires (every 500ms)
    await vi.advanceTimersByTimeAsync(600);

    await streamPromise;

    // The status should remain 'interrupted', NOT be overwritten with 'completed'
    const status = useStreamEndStatusStore.getState().statuses['node-assistant'];
    expect(status).toBe('interrupted');
  });

  it('sets max_tokens status when SW path reports finish_reason=length', async () => {
    const sessionId = 'sess-sw-length';
    mockState = makeMockState(sessionId);

    // Enable SW path
    vi.mocked(swBridge.waitForController).mockResolvedValue(true);
    vi.mocked(prepareStreamRequest as any).mockReturnValue({
      endpoint: 'https://example.com/v1/chat/completions',
      headers: {},
      body: {},
    });

    // Mock startStream: simulate SW that completes with finish_reason=length
    vi.mocked(swBridge.startStream).mockImplementation(async (params) => {
      params.onChunk('Hello truncated');
      params.onDone({ finishReason: 'length' });
      return { cancel: vi.fn() };
    });

    const abortController = createSubmitAbortController(sessionId);

    await executeSubmitStream({
      sessionId,
      chatId: 'chat-1',
      chatIndex: 0,
      messageIndex: 0,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      resolvedProvider: { endpoint: 'https://example.com/v1/chat/completions', key: 'secret' },
      abortController,
      t: (key) => key,
    });

    const status = useStreamEndStatusStore.getState().statuses['node-assistant'];
    expect(status).toBe('max_tokens');
  });

  it('sets completed status when SW path reports finish_reason=stop', async () => {
    const sessionId = 'sess-sw-stop';
    mockState = makeMockState(sessionId);

    vi.mocked(swBridge.waitForController).mockResolvedValue(true);
    vi.mocked(prepareStreamRequest as any).mockReturnValue({
      endpoint: 'https://example.com/v1/chat/completions',
      headers: {},
      body: {},
    });

    vi.mocked(swBridge.startStream).mockImplementation(async (params) => {
      params.onChunk('Hello world');
      params.onDone({ finishReason: 'stop' });
      return { cancel: vi.fn() };
    });

    const abortController = createSubmitAbortController(sessionId);

    await executeSubmitStream({
      sessionId,
      chatId: 'chat-1',
      chatIndex: 0,
      messageIndex: 0,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      resolvedProvider: { endpoint: 'https://example.com/v1/chat/completions', key: 'secret' },
      abortController,
      t: (key) => key,
    });

    const status = useStreamEndStatusStore.getState().statuses['node-assistant'];
    expect(status).toBe('completed');
  });

  it('preserves reasoning that arrives before the first text chunk on SW path', async () => {
    const sessionId = 'sess-sw-reasoning-first';
    mockState = makeMockState(sessionId);

    vi.mocked(swBridge.waitForController).mockResolvedValue(true);
    vi.mocked(prepareStreamRequest as any).mockReturnValue({
      endpoint: 'https://example.com/v1/chat/completions',
      headers: {},
      body: {},
    });

    vi.mocked(swBridge.startStream).mockImplementation(async (params) => {
      params.onChunk('', { reasoning: 'First think' });
      params.onChunk('Final answer');
      params.onDone({ finishReason: 'stop' });
      return { cancel: vi.fn() };
    });

    const abortController = createSubmitAbortController(sessionId);

    await executeSubmitStream({
      sessionId,
      chatId: 'chat-1',
      chatIndex: 0,
      messageIndex: 0,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'test', max_tokens: 100, temperature: 1, presence_penalty: 0, top_p: 1, frequency_penalty: 0, stream: true },
      resolvedProvider: { endpoint: 'https://example.com/v1/chat/completions', key: 'secret' },
      abortController,
      t: (key) => key,
    });

    const nodeHash = (mockState as any).chats[0].branchTree.nodes['node-assistant'].contentHash;
    expect((mockState as any).contentStore[nodeHash].content).toEqual([
      { type: 'reasoning', text: 'First think' },
      { type: 'text', text: 'Final answer' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// executeLocalSubmit — abort handling
// ---------------------------------------------------------------------------
describe('executeLocalSubmit abort handling', () => {
  const makeLocalMockState = () => ({
    generatingSessions: {},
    chats: [
      {
        id: 'chat-local',
        config: { model: 'local-model', max_tokens: 256, temperature: 0.7, presence_penalty: 0, top_p: 1, frequency_penalty: 0 },
        branchTree: {
          rootId: 'node-user',
          activePath: ['node-user', 'node-assistant'],
          nodes: {
            'node-user': { id: 'node-user', parentId: null, role: 'user', contentHash: 'user-hash', createdAt: 1 },
            'node-assistant': { id: 'node-assistant', parentId: 'node-user', role: 'assistant', contentHash: 'asst-hash', createdAt: 2 },
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
      'asst-hash': { content: [{ type: 'text', text: '' }], refCount: 1 },
    },
  });

  beforeEach(() => {
    mockAbort.mockClear();
    mockGenerateImpl = null;
  });

  it('calls engine.abort() when the abort controller is triggered during generation', async () => {
    mockState = makeLocalMockState();

    // Use a callback to synchronize: the test waits until generate is running
    // before triggering abort.
    let resolveGeneration: ((v: string) => void) | null = null;
    let generateStarted: (() => void) | null = null;
    const generateStartedPromise = new Promise<void>((r) => { generateStarted = r; });

    mockGenerateImpl = (_prompt, _opts, onChunk) => {
      return new Promise<string>((resolve) => {
        onChunk('Hello');
        resolveGeneration = resolve;
        generateStarted!();
      });
    };

    const abortController = createSubmitAbortController('sess-local-abort');

    const submitPromise = executeLocalSubmit({
      sessionId: 'sess-local-abort',
      chatId: 'chat-local',
      chatIndex: 0,
      messageIndex: 1,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'local-model', max_tokens: 256, temperature: 0.7, presence_penalty: 0, top_p: 1, frequency_penalty: 0 } as any,
      mode: 'append',
      abortController,
      t: (key) => key,
    });

    // Wait for generation to actually start before aborting
    await generateStartedPromise;

    // Abort mid-generation — the abort listener should call engine.abort()
    abortController.abort();

    // Let generation resolve so the promise settles
    resolveGeneration!('Hello');

    await submitPromise;

    expect(mockAbort).toHaveBeenCalled();
  });

  it('returns immediately when abort controller is already aborted', async () => {
    mockState = makeLocalMockState();
    mockGenerateImpl = vi.fn(async () => 'should not run');

    const abortController = createSubmitAbortController('sess-local-pre-aborted');
    abortController.abort();

    const result = await executeLocalSubmit({
      sessionId: 'sess-local-pre-aborted',
      chatId: 'chat-local',
      chatIndex: 0,
      messageIndex: 1,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'local-model', max_tokens: 256, temperature: 0.7, presence_penalty: 0, top_p: 1, frequency_penalty: 0 } as any,
      mode: 'append',
      abortController,
      t: (key) => key,
    });

    expect(result).toEqual({});
    expect(mockGenerateImpl).not.toHaveBeenCalled();
  });

  it('cleans up abort listener after normal completion', async () => {
    mockState = makeLocalMockState();
    mockGenerateImpl = async (_prompt, _opts, onChunk) => {
      onChunk('Done');
      return 'Done';
    };

    const abortController = createSubmitAbortController('sess-local-normal');
    const removeListenerSpy = vi.spyOn(abortController.signal, 'removeEventListener');

    await executeLocalSubmit({
      sessionId: 'sess-local-normal',
      chatId: 'chat-local',
      chatIndex: 0,
      messageIndex: 1,
      targetNodeId: 'node-assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      config: { model: 'local-model', max_tokens: 256, temperature: 0.7, presence_penalty: 0, top_p: 1, frequency_penalty: 0 } as any,
      mode: 'append',
      abortController,
      t: (key) => key,
    });

    expect(removeListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(mockAbort).not.toHaveBeenCalled();
  });

  it('builds the local prompt from the full prepared context', async () => {
    mockState = makeLocalMockState();
    mockGenerateImpl = async () => 'Done';

    const abortController = createSubmitAbortController('sess-local-context');
    const messages = [
      { role: 'system', content: [{ type: 'text', text: 'be helpful' }] },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ] as any;

    await executeLocalSubmit({
      sessionId: 'sess-local-context',
      chatId: 'chat-local',
      chatIndex: 0,
      messageIndex: 1,
      targetNodeId: 'node-assistant',
      messages,
      config: {
        model: 'local-model',
        max_tokens: 256,
        temperature: 0.7,
        presence_penalty: 0,
        top_p: 1,
        frequency_penalty: 0,
        systemPrompt: 'be helpful',
      } as any,
      mode: 'append',
      abortController,
      t: (key) => key,
    });

    expect(buildLocalPromptFromContext).toHaveBeenCalledWith(
      messages,
      'append',
      messages.length,
      'local-model',
      undefined,
      'be helpful',
    );
  });
});
