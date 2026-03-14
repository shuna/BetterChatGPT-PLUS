import { describe, expect, it } from 'vitest';
import { isSplitView, isBranchEditorVisible } from '@type/chat';
import { createPartializedState, createLocalStoragePartializedState } from './persistence';
import type { StoreState } from './store';

describe('ChatView helpers', () => {
  it('isSplitView returns true for split views only', () => {
    expect(isSplitView('split-horizontal')).toBe(true);
    expect(isSplitView('split-vertical')).toBe(true);
    expect(isSplitView('chat')).toBe(false);
    expect(isSplitView('branch-editor')).toBe(false);
  });

  it('isBranchEditorVisible returns true for branch-editor and split views', () => {
    expect(isBranchEditorVisible('branch-editor')).toBe(true);
    expect(isBranchEditorVisible('split-horizontal')).toBe(true);
    expect(isBranchEditorVisible('split-vertical')).toBe(true);
    expect(isBranchEditorVisible('chat')).toBe(false);
  });
});

describe('split view persistence', () => {
  it('splitPanelRatio, splitPanelSwapped, and chatActiveView are included in persisted state', () => {
    const fakeState = {
      splitPanelRatio: 0.7,
      splitPanelSwapped: true,
      chatActiveView: 'split-horizontal',
      chats: [],
      contentStore: {},
      branchClipboard: null,
    } as unknown as StoreState;

    const persisted = createPartializedState(fakeState);
    expect(persisted.splitPanelRatio).toBe(0.7);
    expect(persisted.splitPanelSwapped).toBe(true);
    expect(persisted.chatActiveView).toBe('split-horizontal');

    const localPersisted = createLocalStoragePartializedState(fakeState);
    expect(localPersisted.splitPanelRatio).toBe(0.7);
    expect(localPersisted.splitPanelSwapped).toBe(true);
    expect(localPersisted.chatActiveView).toBe('split-horizontal');
  });

  it('defaults are persisted correctly', () => {
    const fakeState = {
      splitPanelRatio: 0.5,
      splitPanelSwapped: false,
      chatActiveView: 'chat',
      chats: [],
      contentStore: {},
      branchClipboard: null,
    } as unknown as StoreState;

    const persisted = createPartializedState(fakeState);
    expect(persisted.splitPanelRatio).toBe(0.5);
    expect(persisted.splitPanelSwapped).toBe(false);
    expect(persisted.chatActiveView).toBe('chat');
  });
});
