import { describe, expect, it } from 'vitest';

import {
  isEditingMessageElement,
  scrollViewportToBottom,
  shouldShowHiddenMessagesWarning,
} from './ChatContent';

describe('isEditingMessageElement', () => {
  it('returns true when a message edit textarea inside the scroller is focused', () => {
    const itemWrapper = {};
    const activeElement = {
      tagName: 'TEXTAREA',
      matches: (selector: string) => selector === 'textarea[data-message-editing="true"]',
      closest: (selector: string) => selector === '[data-item-index]' ? itemWrapper : null,
    };
    const scroller = {
      contains: (element: unknown) => element === activeElement,
    };

    expect(isEditingMessageElement(scroller, activeElement)).toBe(true);
  });

  it('returns false for sticky footer textarea even with the edit marker', () => {
    const activeElement = {
      tagName: 'TEXTAREA',
      matches: (selector: string) => selector === 'textarea[data-message-editing="true"]',
      closest: () => null, // not inside a [data-item-index] wrapper
    };
    const scroller = {
      contains: (element: unknown) => element === activeElement,
    };

    expect(isEditingMessageElement(scroller, activeElement)).toBe(false);
  });

  it('returns false for sticky input textareas without the edit marker', () => {
    const activeElement = {
      tagName: 'TEXTAREA',
      matches: () => false,
    };
    const scroller = {
      contains: () => true,
    };

    expect(isEditingMessageElement(scroller, activeElement)).toBe(false);
  });

  it('returns false when the focused edit textarea is outside the scroller', () => {
    const activeElement = {
      tagName: 'TEXTAREA',
      matches: (selector: string) => selector === 'textarea[data-message-editing="true"]',
    };
    const scroller = {
      contains: () => false,
    };

    expect(isEditingMessageElement(scroller, activeElement)).toBe(false);
  });
});

describe('shouldShowHiddenMessagesWarning', () => {
  it('returns false when the token total is below the reduction threshold', () => {
    expect(
      shouldShowHiddenMessagesWarning({
        totalTokens: 18,
        limitedTokens: 0,
        totalMessages: 2,
        limitedMessages: 1,
        tokenLimit: 256000,
      })
    ).toBe(false);
  });

  it('returns true when the conversation still exceeds the reduction threshold after dropping messages', () => {
    expect(
      shouldShowHiddenMessagesWarning({
        totalTokens: 300000,
        limitedTokens: 250000,
        totalMessages: 40,
        limitedMessages: 30,
        tokenLimit: 256000,
      })
    ).toBe(true);
  });
});

// --- Scroll state / auto-follow logic tests (pure computation, no DOM) ---

const BOTTOM_THRESHOLD = 150;

function computeAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD;
}

describe('atBottom calculation', () => {
  it('detects bottom when gap is less than threshold', () => {
    // gap = 2000 - 1900 - 800 = -700 < 150
    expect(computeAtBottom(2000, 1900, 800)).toBe(true);
  });

  it('detects not-at-bottom when gap exceeds threshold', () => {
    // gap = 5000 - 100 - 800 = 4100 > 150
    expect(computeAtBottom(5000, 100, 800)).toBe(false);
  });

  it('short chat that fits in viewport is at bottom', () => {
    // scrollHeight == clientHeight, scrollTop == 0 → gap = 0
    expect(computeAtBottom(600, 0, 600)).toBe(true);
  });

  it('long chat scrolled to top is NOT at bottom', () => {
    // gap = 5000 - 0 - 800 = 4200 > 150
    expect(computeAtBottom(5000, 0, 800)).toBe(false);
  });

  it('gap exactly at threshold boundary is not at bottom', () => {
    // gap = 150, NOT strictly less than 150
    expect(computeAtBottom(1150, 0, 1000)).toBe(false);
  });

  it('gap just below threshold is at bottom', () => {
    // gap = 149 < 150
    expect(computeAtBottom(1149, 0, 1000)).toBe(true);
  });
});

describe('anchor tracking logic', () => {
  // Simulate the anchor computation from onScroll
  function computeAnchor(
    scrollerTop: number,
    items: Array<{ index: number; top: number; bottom: number }>
  ): { index: number; offset: number } | null {
    for (const item of items) {
      if (item.bottom > scrollerTop) {
        return {
          index: item.index,
          offset: scrollerTop - item.top,
        };
      }
    }
    return null;
  }

  it('captures the first visible item index and offset', () => {
    const anchor = computeAnchor(0, [
      { index: 0, top: -500, bottom: -100 },   // fully above viewport
      { index: 1, top: -100, bottom: 300 },     // straddles top — first visible
      { index: 2, top: 300, bottom: 700 },
    ]);

    expect(anchor).not.toBeNull();
    expect(anchor!.index).toBe(1);
    expect(anchor!.offset).toBe(100); // 0 - (-100) = 100
  });

  it('returns first item when all are visible', () => {
    const anchor = computeAnchor(0, [
      { index: 0, top: 0, bottom: 200 },
      { index: 1, top: 200, bottom: 400 },
    ]);

    expect(anchor!.index).toBe(0);
    expect(anchor!.offset).toBe(0);
  });

  it('returns null for empty item list', () => {
    expect(computeAnchor(0, [])).toBeNull();
  });
});

describe('auto-follow guard conditions', () => {
  function shouldAutoFollow(opts: {
    isGenerating: boolean;
    atBottom: boolean;
    autoScroll: boolean;
    isEditing: boolean;
  }): boolean {
    return opts.isGenerating && opts.atBottom && opts.autoScroll && !opts.isEditing;
  }

  it('follows when generating, at bottom, auto-scroll on, not editing', () => {
    expect(shouldAutoFollow({
      isGenerating: true, atBottom: true, autoScroll: true, isEditing: false,
    })).toBe(true);
  });

  it('does not follow when not at bottom', () => {
    expect(shouldAutoFollow({
      isGenerating: true, atBottom: false, autoScroll: true, isEditing: false,
    })).toBe(false);
  });

  it('does not follow when editing in scroller', () => {
    expect(shouldAutoFollow({
      isGenerating: true, atBottom: true, autoScroll: true, isEditing: true,
    })).toBe(false);
  });

  it('does not follow when not generating', () => {
    expect(shouldAutoFollow({
      isGenerating: false, atBottom: true, autoScroll: true, isEditing: false,
    })).toBe(false);
  });

  it('does not follow when autoScroll is off', () => {
    expect(shouldAutoFollow({
      isGenerating: true, atBottom: true, autoScroll: false, isEditing: false,
    })).toBe(false);
  });
});

describe('scrollViewportToBottom', () => {
  it('moves the viewport to the end and eagerly syncs bottom state', () => {
    const scroller = { scrollTop: 120, scrollHeight: 960 };
    const updates: boolean[] = [];

    scrollViewportToBottom(scroller, (isAtBottom) => {
      updates.push(isAtBottom);
    });

    expect(scroller.scrollTop).toBe(960);
    expect(updates).toEqual([true]);
  });
});
