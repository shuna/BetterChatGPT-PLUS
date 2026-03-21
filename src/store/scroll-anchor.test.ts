import { describe, expect, it } from 'vitest';
import { createPartializedState } from './persistence';
import type { StoreState } from './store';

// Test that ScrollAnchor state behaves correctly as plain data
describe('ScrollAnchor', () => {
  it('is not included in persisted state', () => {
    // createPartializedState only picks PERSIST_KEYS — chatScrollAnchors should be excluded
    const fakeState = {
      chatScrollAnchors: { 'chat-1': { firstVisibleItemIndex: 5, offsetWithinItem: 120, wasAtBottom: false } },
    } as unknown as StoreState;

    const persisted = createPartializedState(fakeState);
    expect(persisted).not.toHaveProperty('chatScrollAnchors');
  });
});
