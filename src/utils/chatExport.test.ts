import { describe, expect, it } from 'vitest';

import type { ChatInterface } from '@type/chat';
import type { ContentStoreData } from './contentStore';
import { prepareChatForExport } from './chatExport';

describe('prepareChatForExport', () => {
  it('keeps only the currently visible branch when requested', () => {
    const chat: ChatInterface = {
      id: 'chat-1',
      title: 'Branchy',
      messages: [],
      config: {
        model: 'test-model',
        max_tokens: 1000,
        temperature: 1,
        presence_penalty: 0,
        top_p: 1,
        frequency_penalty: 0,
        stream: true,
      },
      titleSet: false,
      imageDetail: 'auto',
      collapsedNodes: {
        root: true,
        hidden: true,
      },
      branchTree: {
        rootId: 'root',
        activePath: ['root', 'shown'],
        nodes: {
          root: {
            id: 'root',
            parentId: null,
            role: 'user',
            contentHash: 'hash-root',
            createdAt: 1,
          },
          shown: {
            id: 'shown',
            parentId: 'root',
            role: 'assistant',
            contentHash: 'hash-shared',
            createdAt: 2,
          },
          hidden: {
            id: 'hidden',
            parentId: 'root',
            role: 'assistant',
            contentHash: 'hash-shared',
            createdAt: 3,
          },
        },
      },
    };

    const contentStore: ContentStoreData = {
      'hash-root': {
        content: [{ type: 'text', text: 'hello' }],
        refCount: 1,
      },
      'hash-shared': {
        content: [{ type: 'text', text: 'visible reply' }],
        refCount: 2,
      },
    };

    const prepared = prepareChatForExport(chat, contentStore, {
      visibleBranchOnly: true,
    });

    expect(prepared.chat.branchTree?.activePath).toEqual(['root', 'shown']);
    expect(Object.keys(prepared.chat.branchTree?.nodes ?? {})).toEqual(['root', 'shown']);
    expect(prepared.chat.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'visible reply' }] },
    ]);
    expect(prepared.chat.collapsedNodes).toEqual({ root: true });
    expect(prepared.contentStore).toEqual({
      'hash-root': {
        content: [{ type: 'text', text: 'hello' }],
        refCount: 1,
      },
      'hash-shared': {
        content: [{ type: 'text', text: 'visible reply' }],
        refCount: 1,
      },
    });
  });
});
