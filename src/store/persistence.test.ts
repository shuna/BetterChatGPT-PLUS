import { beforeEach, describe, expect, it } from 'vitest';

import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';
import type { ChatInterface } from '@type/chat';
import { addContent } from '@utils/contentStore';
import {
  clearStreamingBuffersForTest,
  createStreamingContentHash,
  initializeStreamingBuffer,
} from '@utils/streamingBuffer';
import {
  applyPersistedChatDataState,
  createLocalStoragePartializedState,
  createPartializedState,
  createPersistedChatDataState,
  hydrateFromPersistedStoreState,
  migratePersistedState,
  migratePersistedChatDataState,
  rehydrateStoreState,
  setIndexedDbMigrationComplete,
} from './persistence';
import { DEFAULT_PROVIDERS } from './provider-config';
import { STORE_VERSION } from './version';

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
    hideSideMenu: false,
    folders: {},
    enterToSubmit: false,
    inlineLatex: false,
    markdownMode: true,
    streamingMarkdownPolicy: 'auto',
    totalTokenUsed: {},
    countTotalTokens: false,
    displayChatSize: false,
    menuWidth: 320,
    defaultImageDetail: _defaultImageDetail,
    autoScroll: true,
    providers: { ...DEFAULT_PROVIDERS },
    providerCustomModels: {},
    favoriteModels: [],
    branchClipboard: {
      nodeIds: ['node-1'],
      sourceChat: 'chat-1',
      nodes: {
        'node-1': {
          id: 'node-1',
          parentId: null,
          role: 'user',
          contentHash: userHash,
          createdAt: 1,
        },
      },
    },
    contentStore,
    currentChatIndex: -1,
  };
};

describe('persistence', () => {
  beforeEach(() => {
    clearStreamingBuffersForTest();
    setIndexedDbMigrationComplete(false);
  });

  it('finalizes streaming marker nodes when building a full snapshot', () => {
    const state = buildStoreState();
    state.chats[0].branchTree!.nodes['node-2'].contentHash = createStreamingContentHash('node-2');
    initializeStreamingBuffer('node-2', [{ type: 'text', text: 'streamed' }]);

    const partialized = createPartializedState(state as never);
    const persistedNode = partialized.chats?.[0].branchTree?.nodes['node-2'];

    expect(persistedNode?.contentHash.startsWith('__streaming:')).toBe(false);
    expect(partialized.contentStore?.[persistedNode!.contentHash].content).toEqual([
      { type: 'text', text: 'streamed' },
    ]);
  });

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

  it('omits chat payloads from localStorage partialized state after migration complete', () => {
    const state = buildStoreState();
    setIndexedDbMigrationComplete(true);

    const partialized = createLocalStoragePartializedState(state as never);

    expect('chats' in partialized).toBe(false);
    expect('contentStore' in partialized).toBe(false);
    expect('branchClipboard' in partialized).toBe(false);
    expect(partialized.prompts).toEqual(state.prompts);
  });

  it('retains chat payloads in localStorage before migration complete', () => {
    const state = buildStoreState();
    setIndexedDbMigrationComplete(false);

    const partialized = createLocalStoragePartializedState(state as never);

    expect('chats' in partialized).toBe(true);
    expect('contentStore' in partialized).toBe(true);
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

  it('round-trips persisted chat data independently from localStorage state', () => {
    const state = buildStoreState();
    const chatData = createPersistedChatDataState(state as never);
    const targetState = buildStoreState();

    (targetState as { chats?: ChatInterface[] }).chats = undefined;
    targetState.contentStore = {};

    applyPersistedChatDataState(targetState as never, chatData);

    expect(targetState.chats?.[0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'world' }] },
    ]);
    expect(Object.keys(targetState.contentStore)).not.toHaveLength(0);
    expect(targetState.branchClipboard).toEqual(chatData.branchClipboard);
  });

  it('hydrates a persisted store snapshot and resets the current chat index when chats are empty', () => {
    const baseState = buildStoreState();
    localStorage.setItem('currentChatIndex', '1');

    const hydrated = hydrateFromPersistedStoreState(baseState as never, {
      chats: [],
      contentStore: {},
      branchClipboard: null,
      theme: 'light',
    });

    expect(hydrated.chats).toEqual([]);
    expect(hydrated.currentChatIndex).toBe(-1);
    expect(localStorage.getItem('currentChatIndex')).toBe('-1');
    expect(hydrated.theme).toBe('light');
  });

  it('preserves existing chat payloads when a snapshot omits them', () => {
    const baseState = buildStoreState();
    localStorage.setItem('currentChatIndex', '1');

    const hydrated = hydrateFromPersistedStoreState(baseState as never, {
      theme: 'light',
    });

    expect(hydrated.chats).toHaveLength(2);
    expect(hydrated.contentStore).toEqual(baseState.contentStore);
    expect(hydrated.branchClipboard).toEqual(baseState.branchClipboard);
    expect(hydrated.currentChatIndex).toBe(1);
    expect(hydrated.theme).toBe('light');
  });

  it('migrates persisted chat data using the store version pipeline', () => {
    const state = buildStoreState();
    const migrated = migratePersistedChatDataState(
      state as never,
      createPersistedChatDataState(state as never),
      STORE_VERSION - 1
    );

    expect(migrated.branchClipboard).toEqual(state.branchClipboard);
    expect(migrated.contentStore).toEqual(state.contentStore);
  });

  it('does not crash when migrating an old snapshot without chats', () => {
    const snapshot = {
      theme: 'light',
      prompts: [],
      foldersName: [],
      foldersExpanded: [],
    };

    expect(() => migratePersistedState(snapshot, 0)).not.toThrow();
    expect(snapshot).not.toHaveProperty('contentStore');
  });

  it('preserves branch content when migrating an old snapshot without chats', () => {
    const baseState = buildStoreState();
    const migrated = migratePersistedState(
      {
        theme: 'light',
        prompts: [],
        foldersName: [],
        foldersExpanded: [],
      },
      0
    ) as unknown as Partial<ReturnType<typeof buildStoreState>>;

    const hydrated = hydrateFromPersistedStoreState(baseState as never, migrated as never);

    expect(hydrated.chats).toHaveLength(2);
    expect(hydrated.contentStore).toEqual(baseState.contentStore);
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

  it('persists and restores splitPanelRatio and splitPanelSwapped', () => {
    const state = buildStoreState();
    (state as any).splitPanelRatio = 0.7;
    (state as any).splitPanelSwapped = true;
    (state as any).chatActiveView = 'split-horizontal';

    const partialized = createPartializedState(state as never);

    expect(partialized.splitPanelRatio).toBe(0.7);
    expect(partialized.splitPanelSwapped).toBe(true);
    expect(partialized.chatActiveView).toBe('split-horizontal');

    const localPartialized = createLocalStoragePartializedState(state as never);

    expect(localPartialized.splitPanelRatio).toBe(0.7);
    expect(localPartialized.splitPanelSwapped).toBe(true);
    expect(localPartialized.chatActiveView).toBe('split-horizontal');
  });
});
