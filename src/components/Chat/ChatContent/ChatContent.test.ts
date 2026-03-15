import { describe, expect, it } from 'vitest';

import { isEditingMessageElement, shouldShowHiddenMessagesWarning } from './ChatContent';

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
