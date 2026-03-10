import { describe, expect, it } from 'vitest';

import { serializeMessagesForTokenCount } from './tokenizerSerialization';

describe('tokenizer serialization', () => {
  it('includes every text content block in a message', () => {
    expect(
      serializeMessagesForTokenCount(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'first' },
              { type: 'image_url', image_url: { url: 'image', detail: 'auto' } },
              { type: 'text', text: 'second' },
            ],
          },
        ],
        'gpt-4o'
      )
    ).toContain('first\nsecond');
  });

  it('preserves message role framing for image-only messages', () => {
    expect(
      serializeMessagesForTokenCount(
        [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'image', detail: 'auto' } },
            ],
          },
        ],
        'gpt-4o'
      )
    ).toContain('<|im_start|>user<|im_sep|><|im_end|>');
  });
});
