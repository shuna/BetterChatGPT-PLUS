import { describe, expect, it } from 'vitest';
import { createPartializedState } from './persistence';
import type { ScrollAnchor } from './branch-slice';
import type { StoreState } from './store';

// Test that ScrollAnchor state behaves correctly as plain data
describe('ScrollAnchor', () => {
  const anchor: ScrollAnchor = {
    firstVisibleItemIndex: 5,
    offsetWithinItem: 120,
    wasAtBottom: false,
  };

  it('is not included in persisted state', () => {
    // createPartializedState only picks PERSIST_KEYS — chatScrollAnchors should be excluded
    const fakeState = {
      chatScrollAnchors: { 'chat-1': anchor },
    } as unknown as StoreState;

    const persisted = createPartializedState(fakeState);
    expect(persisted).not.toHaveProperty('chatScrollAnchors');
  });

  it('anchor stores firstVisibleItemIndex and offsetWithinItem', () => {
    expect(anchor.firstVisibleItemIndex).toBe(5);
    expect(anchor.offsetWithinItem).toBe(120);
    expect(anchor.wasAtBottom).toBe(false);
  });

  it('wasAtBottom flag differentiates bottom vs mid-scroll', () => {
    const atBottom: ScrollAnchor = { firstVisibleItemIndex: 0, offsetWithinItem: 0, wasAtBottom: true };
    const midScroll: ScrollAnchor = { firstVisibleItemIndex: 3, offsetWithinItem: 50, wasAtBottom: false };
    expect(atBottom.wasAtBottom).toBe(true);
    expect(midScroll.wasAtBottom).toBe(false);
  });
});
