import { describe, it, expect } from 'vitest';
import { ThinkTagParser } from './thinkTagParser';

describe('ThinkTagParser', () => {
  it('passes through plain text with no think tags', () => {
    const parser = new ThinkTagParser();
    const result = parser.process('Hello world');
    expect(result).toEqual({ content: 'Hello world', reasoning: '' });
    expect(parser.flush()).toEqual({ content: '', reasoning: '' });
  });

  it('extracts a single complete think block', () => {
    const parser = new ThinkTagParser();
    const result = parser.process('before<think>reasoning</think>after');
    expect(result).toEqual({ content: 'beforeafter', reasoning: 'reasoning' });
  });

  it('handles multiple think blocks in one chunk', () => {
    const parser = new ThinkTagParser();
    const result = parser.process('A<think>R1</think>B<think>R2</think>C');
    expect(result).toEqual({ content: 'ABC', reasoning: 'R1R2' });
  });

  it('handles think tag split across two chunks (open tag)', () => {
    const parser = new ThinkTagParser();
    const r1 = parser.process('Hello<thi');
    // The partial tag '<thi' should be held in pending, not emitted
    expect(r1.content).toBe('Hello');
    expect(r1.reasoning).toBe('');

    const r2 = parser.process('nk>reasoning</think>end');
    expect(r2.content).toBe('end');
    expect(r2.reasoning).toBe('reasoning');
  });

  it('handles think tag split across two chunks (close tag)', () => {
    const parser = new ThinkTagParser();
    const r1 = parser.process('<think>some reasoning</thi');
    expect(r1.content).toBe('');
    expect(r1.reasoning).toBe('some reasoning');

    const r2 = parser.process('nk>after close');
    expect(r2.content).toBe('after close');
    expect(r2.reasoning).toBe('');
  });

  it('flushes remaining reasoning when stream ends inside a think block', () => {
    const parser = new ThinkTagParser();
    parser.process('<think>partial reasoning');
    const flushed = parser.flush();
    expect(flushed).toEqual({ content: '', reasoning: '' });
  });

  it('flushes remaining content when stream ends outside a think block', () => {
    const parser = new ThinkTagParser();
    parser.process('some content');
    const flushed = parser.flush();
    expect(flushed).toEqual({ content: '', reasoning: '' });
  });

  it('flushes partial open tag as content when stream ends', () => {
    const parser = new ThinkTagParser();
    const r = parser.process('text<thi');
    expect(r.content).toBe('text');
    const flushed = parser.flush();
    // Partial tag '<thi' is treated as literal content
    expect(flushed.content).toBe('<thi');
    expect(flushed.reasoning).toBe('');
  });

  it('flushes partial close tag as reasoning when stream ends inside think', () => {
    const parser = new ThinkTagParser();
    parser.process('<think>reasoning</th');
    const flushed = parser.flush();
    expect(flushed.reasoning).toBe('</th');
    expect(flushed.content).toBe('');
  });

  it('handles empty input', () => {
    const parser = new ThinkTagParser();
    const result = parser.process('');
    expect(result).toEqual({ content: '', reasoning: '' });
    expect(parser.flush()).toEqual({ content: '', reasoning: '' });
  });

  it('handles think block that spans many small chunks', () => {
    const parser = new ThinkTagParser();
    let content = '';
    let reasoning = '';

    const chunks = ['<', 'th', 'ink', '>', 'deep', ' thought', '</', 'think', '>', 'done'];
    for (const chunk of chunks) {
      const r = parser.process(chunk);
      content += r.content;
      reasoning += r.reasoning;
    }
    const f = parser.flush();
    content += f.content;
    reasoning += f.reasoning;

    expect(content).toBe('done');
    expect(reasoning).toBe('deep thought');
  });
});
