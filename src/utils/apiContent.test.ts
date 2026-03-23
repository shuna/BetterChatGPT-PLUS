import { describe, expect, it } from 'vitest';

import {
  extractReasoningFromApiContent,
  extractReasoningFromReasoningDetails,
  extractTextFromApiContent,
} from './apiContent';

describe('apiContent helpers', () => {
  it('extracts plain text from string and content blocks', () => {
    expect(extractTextFromApiContent('hello')).toBe('hello');
    expect(
      extractTextFromApiContent([
        { type: 'text', text: 'hello ' },
        { type: 'output_text', text: 'world' },
      ])
    ).toBe('hello world');
  });

  it('extracts reasoning from reasoning-like content blocks', () => {
    expect(
      extractReasoningFromApiContent([
        { type: 'thinking', text: 'step 1' },
        { type: 'reasoning.summary', summary: 'summary' },
      ])
    ).toBe('step 1summary');
  });

  it('extracts reasoning text and summaries from reasoning_details', () => {
    expect(
      extractReasoningFromReasoningDetails([
        { type: 'reasoning.summary', summary: 'brief' },
        { type: 'reasoning.text', text: 'detail' },
      ])
    ).toBe('briefdetail');
  });
});
