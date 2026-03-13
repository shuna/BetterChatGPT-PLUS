import { describe, expect, it } from 'vitest';

import { isEditingMessageElement } from './ChatContent';

describe('isEditingMessageElement', () => {
  it('returns true when a message edit textarea inside the scroller is focused', () => {
    const activeElement = {
      tagName: 'TEXTAREA',
      matches: (selector: string) => selector === 'textarea[data-message-editing="true"]',
    };
    const scroller = {
      contains: (element: unknown) => element === activeElement,
    };

    expect(isEditingMessageElement(scroller, activeElement)).toBe(true);
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
