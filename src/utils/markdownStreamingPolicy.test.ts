import { describe, expect, it } from 'vitest';
import { resolveStreamingMarkdownMode } from './markdownStreamingPolicy';

describe('resolveStreamingMarkdownMode', () => {
  const desktopEnv = { isDesktopLike: true, saveData: false };
  const mobileEnv = { isDesktopLike: false, saveData: false };

  it('uses plain mode on mobile when policy is auto', () => {
    expect(
      resolveStreamingMarkdownMode({
        policy: 'auto',
        isGeneratingMessage: true,
        textLength: 120,
        hasCodeBlock: false,
        environment: mobileEnv,
      })
    ).toBe('plain');
  });

  it('uses live mode on desktop when policy is auto and content is small', () => {
    expect(
      resolveStreamingMarkdownMode({
        policy: 'auto',
        isGeneratingMessage: true,
        textLength: 120,
        hasCodeBlock: false,
        environment: desktopEnv,
      })
    ).toBe('live');
  });

  it('downgrades to debounced mode for long code blocks on desktop', () => {
    expect(
      resolveStreamingMarkdownMode({
        policy: 'auto',
        isGeneratingMessage: true,
        textLength: 5_000,
        hasCodeBlock: true,
        environment: desktopEnv,
      })
    ).toBe('debounced');
  });

  it('respects never policy', () => {
    expect(
      resolveStreamingMarkdownMode({
        policy: 'never',
        isGeneratingMessage: true,
        textLength: 120,
        hasCodeBlock: false,
        environment: desktopEnv,
      })
    ).toBe('plain');
  });

  it('returns live mode after generation completes', () => {
    expect(
      resolveStreamingMarkdownMode({
        policy: 'auto',
        isGeneratingMessage: false,
        textLength: 9_999,
        hasCodeBlock: true,
        environment: mobileEnv,
      })
    ).toBe('live');
  });
});
