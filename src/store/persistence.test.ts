import { describe, expect, it } from 'vitest';

import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';
import type { ChatInterface } from '@type/chat';
import { addContent } from '@utils/contentStore';
import { createPartializedState, rehydrateStoreState } from './persistence';
import { DEFAULT_PROVIDERS } from './provider-config';

const buildStoreState = () => {
  const contentStore = {};
  const userHash = addContent(contentStore, [{ type: 'text', text: 'hello' }]);
  const assistantHash = addContent(contentStore, [{ type: 'text', text: 'world' }]);

  const chatWithBranchTree: ChatInterface = {
    id: 'chat-1',
    title: 'Persisted chat',
    titleSet: true,
    config: { ..._defaultChatConfig },
    imageDetail: _defaultImageDetail,
    messages: [],
    branchTree: {
      rootId: 'node-1',
      activePath: ['node-1', 'node-2'],
      nodes: {
        'node-1': {
          id: 'node-1',
          parentId: null,
          role: 'user',
          contentHash: userHash,
          createdAt: 1,
        },
        'node-2': {
          id: 'node-2',
          parentId: 'node-1',
          role: 'assistant',
          contentHash: assistantHash,
          createdAt: 2,
        },
      },
    },
  };

  const plainChat: ChatInterface = {
    id: 'chat-2',
    title: 'Plain chat',
    titleSet: false,
    config: { ..._defaultChatConfig },
    imageDetail: _defaultImageDetail,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'plain' }] }],
  };

  return {
    chats: [chatWithBranchTree, plainChat],
    apiKey: '',
    apiVersion: '',
    apiEndpoint: '',
    theme: 'dark',
    autoTitle: false,
    advancedMode: false,
    prompts: [],
    defaultChatConfig: { ..._defaultChatConfig },
    defaultSystemMessage: '',
    hideMenuOptions: false,
    firstVisit: false,
    hideSideMenu: false,
    folders: {},
    enterToSubmit: false,
    inlineLatex: false,
    markdownMode: true,
    totalTokenUsed: {},
    countTotalTokens: false,
    displayChatSize: false,
    menuWidth: 320,
    defaultImageDetail: _defaultImageDetail,
    autoScroll: true,
    hideShareGPT: false,
    providers: { ...DEFAULT_PROVIDERS },
    providerCustomModels: {},
    favoriteModels: [],
    branchClipboard: null,
    contentStore,
    currentChatIndex: -1,
  };
};

describe('persistence', () => {
  it('omits messages for chats that already have branch trees', () => {
    const state = buildStoreState();

    const partialized = createPartializedState(state as never);

    expect(partialized.chats?.[0].messages).toBeUndefined();
    expect(partialized.chats?.[1].messages).toEqual(state.chats[1].messages);
  });

  it('reuses partialized result when persisted inputs are referentially stable', () => {
    const state = buildStoreState();

    const first = createPartializedState(state as never);
    const second = createPartializedState(state as never);

    expect(second).toBe(first);
  });

  it('rehydrates current chat index and materializes branch-tree messages', () => {
    const state = buildStoreState();
    localStorage.setItem('currentChatIndex', '1');

    const repaired = rehydrateStoreState(state as never);

    expect(repaired).toBe(false);
    expect(state.currentChatIndex).toBe(1);
    expect(state.chats[0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'world' }] },
    ]);
  });

  it('deduplicates persisted chat ids during rehydration', () => {
    const state = buildStoreState();
    state.chats[1].id = state.chats[0].id;

    const repaired = rehydrateStoreState(state as never);

    expect(repaired).toBe(true);
    expect(state.chats[0].id).toBe('chat-1');
    expect(state.chats[1].id).not.toBe('chat-1');
    expect(state.chats[1].id).toEqual(expect.any(String));
  });
});
