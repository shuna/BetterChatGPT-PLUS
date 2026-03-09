import { describe, expect, it } from 'vitest';

import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';
import { DEFAULT_PROVIDERS } from './provider-config';
import { migrateV9, migrateV10, migrateV11, migrateV12, migrateV13 } from './migrate';

// ---------------------------------------------------------------------------
// v9 → v10: provider migration from flat apiKey/apiEndpoint
// ---------------------------------------------------------------------------
describe('migrateV9', () => {
  const baseState = () => ({
    apiEndpoint: '',
    apiKey: '',
    chats: [],
    imageDetail: _defaultImageDetail,
  });

  it('creates default providers when no key exists', () => {
    const state = baseState() as any;
    migrateV9(state);

    expect(state.providers).toBeDefined();
    expect(state.favoriteModels).toEqual([]);
    // No key should be set on any provider
    expect(state.providers.openrouter.apiKey).toBeUndefined();
    expect(state.providers.openai.apiKey).toBeUndefined();
  });

  it('assigns key to openrouter when endpoint contains openrouter', () => {
    const state = {
      ...baseState(),
      apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: 'sk-or-test-key',
    } as any;
    migrateV9(state);

    expect(state.providers.openrouter.apiKey).toBe('sk-or-test-key');
    expect(state.providers.openai.apiKey).toBeUndefined();
  });

  it('assigns key to openai when endpoint contains openai.com', () => {
    const state = {
      ...baseState(),
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-openai-test',
    } as any;
    migrateV9(state);

    expect(state.providers.openai.apiKey).toBe('sk-openai-test');
    expect(state.providers.openrouter.apiKey).toBeUndefined();
  });

  it('defaults unknown endpoint key to openrouter', () => {
    const state = {
      ...baseState(),
      apiEndpoint: 'https://custom-proxy.example.com/v1',
      apiKey: 'sk-custom',
    } as any;
    migrateV9(state);

    expect(state.providers.openrouter.apiKey).toBe('sk-custom');
  });
});

// ---------------------------------------------------------------------------
// v10 → v11: no-op (branchTree lazily initialized)
// ---------------------------------------------------------------------------
describe('migrateV10', () => {
  it('is a no-op and does not throw', () => {
    const state = { chats: [] } as any;
    expect(() => migrateV10(state)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// v11 → v12: inline content → contentHash + contentStore
// ---------------------------------------------------------------------------
describe('migrateV11', () => {
  it('migrates inline content to contentStore hashes', () => {
    const state = {
      chats: [
        {
          branchTree: {
            nodes: {
              'n1': {
                id: 'n1',
                parentId: null,
                role: 'user',
                content: [{ type: 'text', text: 'hello' }],
                createdAt: 1,
              },
              'n2': {
                id: 'n2',
                parentId: 'n1',
                role: 'assistant',
                content: [{ type: 'text', text: 'world' }],
                createdAt: 2,
              },
            },
          },
        },
      ],
    } as any;

    migrateV11(state);

    // contentStore should be populated
    expect(state.contentStore).toBeDefined();
    const hashes = Object.keys(state.contentStore);
    expect(hashes.length).toBe(2);

    // Nodes should have contentHash, not content
    const n1 = state.chats[0].branchTree.nodes['n1'];
    const n2 = state.chats[0].branchTree.nodes['n2'];
    expect(n1.contentHash).toBeDefined();
    expect(n1.content).toBeUndefined();
    expect(n2.contentHash).toBeDefined();
    expect(n2.content).toBeUndefined();

    // contentStore should contain the original content
    expect(state.contentStore[n1.contentHash].content).toEqual([
      { type: 'text', text: 'hello' },
    ]);
    expect(state.contentStore[n2.contentHash].content).toEqual([
      { type: 'text', text: 'world' },
    ]);
  });

  it('skips nodes that already have contentHash', () => {
    const state = {
      chats: [
        {
          branchTree: {
            nodes: {
              'n1': {
                id: 'n1',
                parentId: null,
                role: 'user',
                contentHash: 'existing-hash',
                createdAt: 1,
              },
            },
          },
        },
      ],
    } as any;

    migrateV11(state);

    expect(state.chats[0].branchTree.nodes['n1'].contentHash).toBe('existing-hash');
  });

  it('handles chats without branchTree gracefully', () => {
    const state = {
      chats: [
        { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
      ],
    } as any;

    migrateV11(state);

    expect(state.contentStore).toEqual({});
  });

  it('deduplicates identical content across nodes', () => {
    const sameContent = [{ type: 'text', text: 'same' }];
    const state = {
      chats: [
        {
          branchTree: {
            nodes: {
              'n1': { id: 'n1', parentId: null, role: 'user', content: [...sameContent], createdAt: 1 },
              'n2': { id: 'n2', parentId: 'n1', role: 'user', content: [...sameContent], createdAt: 2 },
            },
          },
        },
      ],
    } as any;

    migrateV11(state);

    const n1 = state.chats[0].branchTree.nodes['n1'];
    const n2 = state.chats[0].branchTree.nodes['n2'];
    // Same content should produce same hash
    expect(n1.contentHash).toBe(n2.contentHash);
    // refCount should be 2
    expect(state.contentStore[n1.contentHash].refCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// v12 → v13: providerModelCache + favoriteModel capabilities + config.providerId
// ---------------------------------------------------------------------------
describe('migrateV12', () => {
  it('initializes providerModelCache as empty object', () => {
    const state = { chats: [], favoriteModels: [] } as any;
    migrateV12(state);
    expect(state.providerModelCache).toEqual({});
  });

  it('adds modelType and streamSupport defaults to favoriteModels', () => {
    const state = {
      chats: [],
      favoriteModels: [
        { modelId: 'gpt-4o', providerId: 'openai' },
        { modelId: 'claude-3', providerId: 'openrouter' },
      ],
    } as any;
    migrateV12(state);

    expect(state.favoriteModels[0].modelType).toBe('text');
    expect(state.favoriteModels[0].streamSupport).toBe(true);
    expect(state.favoriteModels[1].modelType).toBe('text');
    expect(state.favoriteModels[1].streamSupport).toBe(true);
  });

  it('assigns providerId to chat configs from favoriteModels', () => {
    const state = {
      chats: [
        { config: { model: 'gpt-4o' } },
        { config: { model: 'unknown-model' } },
      ],
      favoriteModels: [
        { modelId: 'gpt-4o', providerId: 'openai' },
      ],
    } as any;
    migrateV12(state);

    expect(state.chats[0].config.providerId).toBe('openai');
    expect(state.chats[1].config.providerId).toBeUndefined();
  });

  it('uses first match when modelId appears in multiple favorites', () => {
    const state = {
      chats: [{ config: { model: 'gpt-4o' } }],
      favoriteModels: [
        { modelId: 'gpt-4o', providerId: 'openai' },
        { modelId: 'gpt-4o', providerId: 'openrouter' },
      ],
    } as any;
    migrateV12(state);

    expect(state.chats[0].config.providerId).toBe('openai');
  });

  it('does not overwrite existing config.providerId', () => {
    const state = {
      chats: [{ config: { model: 'gpt-4o', providerId: 'openrouter' } }],
      favoriteModels: [
        { modelId: 'gpt-4o', providerId: 'openai' },
      ],
    } as any;
    migrateV12(state);

    expect(state.chats[0].config.providerId).toBe('openrouter');
  });

  it('handles missing chats and favoriteModels gracefully', () => {
    const state = {} as any;
    expect(() => migrateV12(state)).not.toThrow();
    expect(state.providerModelCache).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// v13 → v14: providerCustomModels + legacy customModels preservation
// ---------------------------------------------------------------------------
describe('migrateV13', () => {
  it('initializes providerCustomModels as empty object when no customModels', () => {
    const state = {} as any;
    migrateV13(state);
    expect(state.providerCustomModels).toEqual({});
    expect(state._legacyCustomModels).toBeUndefined();
  });

  it('preserves legacy customModels in _legacyCustomModels', () => {
    const legacy = [
      { id: 'my-model', name: 'My Model', context_length: 4096 },
      { id: 'another', name: 'Another' },
    ];
    const state = { customModels: legacy } as any;
    migrateV13(state);

    expect(state.providerCustomModels).toEqual({});
    expect(state._legacyCustomModels).toEqual(legacy);
    expect(state.customModels).toBeUndefined();
  });

  it('does not set _legacyCustomModels when customModels is empty array', () => {
    const state = { customModels: [] } as any;
    migrateV13(state);

    expect(state.providerCustomModels).toEqual({});
    expect(state._legacyCustomModels).toBeUndefined();
    expect(state.customModels).toBeUndefined();
  });

  it('deletes customModels field after migration', () => {
    const state = { customModels: [{ id: 'x' }] } as any;
    migrateV13(state);

    expect(state).not.toHaveProperty('customModels');
  });

  it('handles non-array customModels gracefully', () => {
    const state = { customModels: 'invalid' } as any;
    migrateV13(state);

    expect(state.providerCustomModels).toEqual({});
    expect(state._legacyCustomModels).toBeUndefined();
  });
});
