import { describe, it, expect } from 'vitest';
import {
  countConsecutiveWordRepetitions,
  computeRepeatedNgramScore,
  detectCollapseFlag,
  computeOutputQuality,
} from './qualityMetrics';

// ---------------------------------------------------------------------------
// countConsecutiveWordRepetitions
// ---------------------------------------------------------------------------

describe('countConsecutiveWordRepetitions', () => {
  it('returns 1 for normal text', () => {
    expect(countConsecutiveWordRepetitions('the quick brown fox')).toBe(1);
  });

  it('returns 0 for empty string', () => {
    expect(countConsecutiveWordRepetitions('')).toBe(0);
  });

  it('counts consecutive repeats', () => {
    expect(countConsecutiveWordRepetitions('mij mij mij dog')).toBe(3);
  });

  it('finds the longest run', () => {
    expect(
      countConsecutiveWordRepetitions('a a a b b b b c'),
    ).toBe(4);
  });

  it('handles single word', () => {
    expect(countConsecutiveWordRepetitions('hello')).toBe(1);
  });

  it('handles all same words', () => {
    expect(countConsecutiveWordRepetitions('x x x x x')).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// computeRepeatedNgramScore
// ---------------------------------------------------------------------------

describe('computeRepeatedNgramScore', () => {
  it('returns 0 for text shorter than n', () => {
    expect(computeRepeatedNgramScore('a b', 3)).toBe(0);
  });

  it('returns 0 for no repeated trigrams', () => {
    expect(computeRepeatedNgramScore('a b c d e f g', 3)).toBe(0);
  });

  it('returns high score for degenerate repetition', () => {
    const text = Array(20).fill('hello world foo').join(' ');
    const score = computeRepeatedNgramScore(text, 3);
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns moderate score for partial repetition', () => {
    const score = computeRepeatedNgramScore(
      'a b c d e a b c f g h',
      3,
    );
    // "a b c" appears twice → 2 positions repeated out of 9 total trigrams
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// detectCollapseFlag
// ---------------------------------------------------------------------------

describe('detectCollapseFlag', () => {
  it('detects empty output', () => {
    const result = detectCollapseFlag('');
    expect(result.collapsed).toBe(true);
    expect(result.reason).toContain('empty');
  });

  it('detects extremely short output', () => {
    const result = detectCollapseFlag('hi');
    expect(result.collapsed).toBe(true);
    expect(result.reason).toContain('short');
  });

  it('does not flag normal text', () => {
    const result = detectCollapseFlag(
      'The quick brown fox jumps over the lazy dog. This is a normal sentence.',
    );
    expect(result.collapsed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('flags high consecutive repetition', () => {
    const text = Array(15).fill('word').join(' ');
    const result = detectCollapseFlag(text);
    expect(result.collapsed).toBe(true);
    expect(result.reason).toContain('consecutive');
  });

  it('flags high trigram repetition', () => {
    const text = Array(30).fill('foo bar baz').join(' ');
    const result = detectCollapseFlag(text);
    expect(result.collapsed).toBe(true);
    expect(result.reason).toContain('trigram');
  });
});

// ---------------------------------------------------------------------------
// computeOutputQuality
// ---------------------------------------------------------------------------

describe('computeOutputQuality', () => {
  it('computes basic metrics', () => {
    const metrics = computeOutputQuality('hello world', 'stop');
    expect(metrics.charCount).toBe(11);
    expect(metrics.wordCount).toBe(2);
    expect(metrics.stopStatus).toBe('stop');
    expect(metrics.collapsed).toBe(false);
    expect(metrics.diffFromOriginal).toBeUndefined();
  });

  it('includes diff when originalText provided', () => {
    const metrics = computeOutputQuality('short', 'stop', 'longer original text');
    expect(metrics.diffFromOriginal).toBeDefined();
    expect(metrics.diffFromOriginal!.exactMatch).toBe(false);
    expect(metrics.diffFromOriginal!.charDelta).toBe(
      'short'.length - 'longer original text'.length,
    );
  });

  it('marks exact match', () => {
    const metrics = computeOutputQuality('same', 'stop', 'same');
    expect(metrics.diffFromOriginal!.exactMatch).toBe(true);
    expect(metrics.diffFromOriginal!.charDelta).toBe(0);
  });

  it('detects collapsed output', () => {
    const metrics = computeOutputQuality('', 'abort');
    expect(metrics.collapsed).toBe(true);
    expect(metrics.stopStatus).toBe('abort');
  });

  it('passes stop status through', () => {
    const metrics = computeOutputQuality('text', 'unknown');
    expect(metrics.stopStatus).toBe('unknown');
  });
});
