import { describe, expect, it, beforeEach } from 'vitest';

import { _finalizeStreamingNodesInChat } from './branch-slice';
import type { ChatInterface, GeneratingSession } from '@type/chat';
import type { ContentStoreData } from '@utils/contentStore';
import {
  initializeStreamingBuffer,
  createStreamingContentHash,
  isStreamingContentHash,
  clearStreamingBuffersForTest,
  isBufferingNode,
  appendToStreamingBuffer,
} from '@utils/streamingBuffer';
import { addContent } from '@utils/contentStore';

const textContent = (text: string) => [{ type: 'text' as const, text }];

function makeChatWithStreamingNode(
  chatId: string,
  nodeId: string,
  streamingText: string
): { chat: ChatInterface; contentStore: ContentStoreData } {
  const contentStore: ContentStoreData = {};

  // Set up a user node with permanent content
  const userHash = addContent(contentStore, textContent('hello'));

  // Set up an assistant node with a streaming buffer
  initializeStreamingBuffer(nodeId, textContent(streamingText), chatId);
  const streamingHash = createStreamingContentHash(nodeId);

  const chat: ChatInterface = {
    id: chatId,
    title: 'Test Chat',
    titleSet: true,
    config: {
      model: 'test',
      max_tokens: 100,
      temperature: 1,
      presence_penalty: 0,
      top_p: 1,
      frequency_penalty: 0,
    },
    imageDetail: 'auto',
    messages: [
      { role: 'user', content: textContent('hello') },
      { role: 'assistant', content: textContent(streamingText) },
    ],
    branchTree: {
      rootId: 'node-user',
      activePath: ['node-user', nodeId],
      nodes: {
        'node-user': {
          id: 'node-user',
          parentId: null,
          role: 'user',
          contentHash: userHash,
          createdAt: 1,
        },
        [nodeId]: {
          id: nodeId,
          parentId: 'node-user',
          role: 'assistant',
          contentHash: streamingHash,
          createdAt: 2,
        },
      },
    },
  };

  return { chat, contentStore };
}

beforeEach(() => {
  clearStreamingBuffersForTest();
});

describe('finalizeStreamingNodesInChat', () => {
  it('finalizes streaming nodes when no active sessions exist', () => {
    const { chat, contentStore } = makeChatWithStreamingNode(
      'chat-1',
      'node-asst',
      'Hello world'
    );

    const result = _finalizeStreamingNodesInChat([chat], 0, contentStore);

    // Node should now have a permanent content hash
    const nodeHash = result[0].branchTree!.nodes['node-asst'].contentHash;
    expect(isStreamingContentHash(nodeHash)).toBe(false);

    // Buffer should be cleared
    expect(isBufferingNode('node-asst')).toBe(false);

    // Content should be preserved in the content store
    expect(contentStore[nodeHash]?.content).toEqual(textContent('Hello world'));
  });

  it('skips actively-streaming nodes when generatingSessions is provided', () => {
    const { chat, contentStore } = makeChatWithStreamingNode(
      'chat-1',
      'node-asst',
      'Hello partial'
    );

    const sessions: Record<string, GeneratingSession> = {
      'sess-1': {
        sessionId: 'sess-1',
        chatId: 'chat-1',
        chatIndex: 0,
        messageIndex: 1,
        targetNodeId: 'node-asst',
      },
    };

    const inputChats = [chat];
    const result = _finalizeStreamingNodesInChat(
      inputChats,
      0,
      contentStore,
      sessions
    );

    // Should return the original chats array unchanged (no finalization occurred)
    expect(result).toBe(inputChats);

    // Node should STILL have a streaming content hash
    const nodeHash = result[0].branchTree!.nodes['node-asst'].contentHash;
    expect(isStreamingContentHash(nodeHash)).toBe(true);

    // Buffer should still be alive
    expect(isBufferingNode('node-asst')).toBe(true);
  });

  it('finalizes idle streaming nodes while preserving active ones', () => {
    const contentStore: ContentStoreData = {};

    // Set up an idle streaming node (no active session)
    const idleHash = addContent(contentStore, textContent(''));
    initializeStreamingBuffer('node-idle', textContent('idle content'), 'chat-1');
    appendToStreamingBuffer('node-idle', ' done');

    // Set up an active streaming node
    initializeStreamingBuffer('node-active', textContent('active '), 'chat-1');
    appendToStreamingBuffer('node-active', 'partial');

    const userHash = addContent(contentStore, textContent('hi'));

    const chat: ChatInterface = {
      id: 'chat-1',
      title: 'Test',
      titleSet: true,
      config: {
        model: 'test',
        max_tokens: 100,
        temperature: 1,
        presence_penalty: 0,
        top_p: 1,
        frequency_penalty: 0,
      },
      imageDetail: 'auto',
      messages: [],
      branchTree: {
        rootId: 'node-user',
        activePath: ['node-user', 'node-idle', 'node-active'],
        nodes: {
          'node-user': {
            id: 'node-user',
            parentId: null,
            role: 'user',
            contentHash: userHash,
            createdAt: 1,
          },
          'node-idle': {
            id: 'node-idle',
            parentId: 'node-user',
            role: 'assistant',
            contentHash: createStreamingContentHash('node-idle'),
            createdAt: 2,
          },
          'node-active': {
            id: 'node-active',
            parentId: 'node-idle',
            role: 'assistant',
            contentHash: createStreamingContentHash('node-active'),
            createdAt: 3,
          },
        },
      },
    };

    const sessions: Record<string, GeneratingSession> = {
      'sess-active': {
        sessionId: 'sess-active',
        chatId: 'chat-1',
        chatIndex: 0,
        messageIndex: 2,
        targetNodeId: 'node-active',
      },
    };

    const result = _finalizeStreamingNodesInChat(
      [chat],
      0,
      contentStore,
      sessions
    );

    // Idle node should be finalized
    const idleNodeHash =
      result[0].branchTree!.nodes['node-idle'].contentHash;
    expect(isStreamingContentHash(idleNodeHash)).toBe(false);
    expect(isBufferingNode('node-idle')).toBe(false);
    expect(contentStore[idleNodeHash]?.content[0]).toEqual({
      type: 'text',
      text: 'idle content done',
    });

    // Active node should be preserved
    const activeNodeHash =
      result[0].branchTree!.nodes['node-active'].contentHash;
    expect(isStreamingContentHash(activeNodeHash)).toBe(true);
    expect(isBufferingNode('node-active')).toBe(true);
  });

  it('falls back to finalizing all when generatingSessions is undefined', () => {
    const { chat, contentStore } = makeChatWithStreamingNode(
      'chat-1',
      'node-asst',
      'some text'
    );

    // No sessions argument — backward-compatible behavior
    const result = _finalizeStreamingNodesInChat([chat], 0, contentStore);

    const nodeHash = result[0].branchTree!.nodes['node-asst'].contentHash;
    expect(isStreamingContentHash(nodeHash)).toBe(false);
    expect(isBufferingNode('node-asst')).toBe(false);
  });

  it('sessions for a different chat do not prevent finalization', () => {
    const { chat, contentStore } = makeChatWithStreamingNode(
      'chat-1',
      'node-asst',
      'text'
    );

    // Session targets a different chat
    const sessions: Record<string, GeneratingSession> = {
      'sess-other': {
        sessionId: 'sess-other',
        chatId: 'chat-other',
        chatIndex: 1,
        messageIndex: 1,
        targetNodeId: 'node-asst',
      },
    };

    const result = _finalizeStreamingNodesInChat(
      [chat],
      0,
      contentStore,
      sessions
    );

    const nodeHash = result[0].branchTree!.nodes['node-asst'].contentHash;
    expect(isStreamingContentHash(nodeHash)).toBe(false);
  });
});
