import { describe, it, expect } from 'vitest';
import { normalizeSystemPrompt } from './systemPromptNormalize';
import { addContent, ContentStoreData } from './contentStore';
import type { ChatInterface, BranchTree, ContentInterface, TextContentInterface } from '@type/chat';

function makeTextContent(text: string): ContentInterface[] {
  return [{ type: 'text', text } as TextContentInterface];
}

function makeChat(opts: {
  systemPrompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; text: string }>;
  useBranchTree?: boolean;
}): { chat: ChatInterface; contentStore: ContentStoreData } {
  const contentStore: ContentStoreData = {};
  const { systemPrompt, messages = [], useBranchTree = true } = opts;

  const chat: ChatInterface = {
    id: 'test-chat',
    title: 'Test',
    messages: [],
    config: {
      model: 'gpt-4',
      max_tokens: 1000,
      temperature: 1,
      presence_penalty: 0,
      top_p: 1,
      frequency_penalty: 0,
      systemPrompt,
    },
    titleSet: false,
    imageDetail: 'auto',
  };

  if (useBranchTree) {
    const nodes: BranchTree['nodes'] = {};
    const activePath: string[] = [];
    let prevId: string | null = null;

    messages.forEach((msg, i) => {
      const id = `node-${i}`;
      const hash = addContent(contentStore, makeTextContent(msg.text));
      nodes[id] = {
        id,
        parentId: prevId,
        role: msg.role,
        contentHash: hash,
        createdAt: Date.now(),
      };
      activePath.push(id);
      prevId = id;
    });

    chat.branchTree = {
      nodes,
      rootId: activePath[0] ?? '',
      activePath,
    };
  } else {
    chat.messages = messages.map((m) => ({
      role: m.role,
      content: makeTextContent(m.text),
    }));
  }

  return { chat, contentStore };
}

describe('normalizeSystemPrompt', () => {
  it('collects mid-conversation system nodes into config.systemPrompt', () => {
    const { chat, contentStore } = makeChat({
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'system', text: 'Be concise' },
        { role: 'assistant', text: 'Hi' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.config.systemPrompt).toBe('Be concise');
    // Mid-conversation system removed from activePath
    expect(chat.branchTree!.activePath.length).toBe(2);
    // Only user and assistant remain
    const roles = chat.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('concatenates multiple mid-conversation system nodes', () => {
    const { chat, contentStore } = makeChat({
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'system', text: 'Be concise' },
        { role: 'assistant', text: 'Hi' },
        { role: 'system', text: 'Be helpful' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.config.systemPrompt).toBe('Be concise\n\nBe helpful');
    const roles = chat.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('merges top system + mid-conversation system', () => {
    const { chat, contentStore } = makeChat({
      messages: [
        { role: 'system', text: 'You are helpful' },
        { role: 'user', text: 'Hello' },
        { role: 'system', text: 'Be concise' },
        { role: 'assistant', text: 'Hi' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.config.systemPrompt).toBe('You are helpful\n\nBe concise');
    // Top system node preserved, mid removed
    expect(chat.branchTree!.activePath.length).toBe(3);
    const roles = chat.messages.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant']);
  });

  it('preserves parent chain after removing mid-system node', () => {
    const { chat, contentStore } = makeChat({
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'system', text: 'Mid-system' },
        { role: 'assistant', text: 'Hi' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    const tree = chat.branchTree!;
    // assistant's parent should be user (skipping removed system)
    const assistantNodeId = tree.activePath[1];
    const userNodeId = tree.activePath[0];
    expect(tree.nodes[assistantNodeId].parentId).toBe(userNodeId);
  });

  it('does nothing when no system messages exist', () => {
    const { chat, contentStore } = makeChat({
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.config.systemPrompt).toBeUndefined();
    expect(chat.branchTree!.activePath.length).toBe(2);
  });

  it('merges bubble text into existing config.systemPrompt', () => {
    const { chat, contentStore } = makeChat({
      systemPrompt: 'Existing prompt',
      messages: [
        { role: 'system', text: 'Old bubble text' },
        { role: 'user', text: 'Hello' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    // 'Old bubble text' is the content of the top system node which matches
    // the active root — it is NOT a new addition since it's the same node
    // whose content gets synced to match config. The merge deduplicates.
    // 'Existing prompt' stays, 'Old bubble text' is new so it gets merged.
    expect(chat.config.systemPrompt).toBe('Existing prompt\n\nOld bubble text');
  });

  it('handles flat messages (no branchTree)', () => {
    const { chat, contentStore } = makeChat({
      useBranchTree: false,
      messages: [
        { role: 'system', text: 'You are helpful' },
        { role: 'user', text: 'Hello' },
        { role: 'system', text: 'Be concise' },
        { role: 'assistant', text: 'Hi' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.config.systemPrompt).toBe('You are helpful\n\nBe concise');
    // System messages removed from flat array
    const roles = chat.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('removes top system node when config.systemPrompt is empty', () => {
    const { chat, contentStore } = makeChat({
      systemPrompt: '',
      messages: [
        { role: 'system', text: '' },
        { role: 'user', text: 'Hello' },
      ],
    });

    normalizeSystemPrompt(chat, contentStore);

    expect(chat.branchTree!.activePath.length).toBe(1);
    expect(chat.messages[0].role).toBe('user');
  });
});
