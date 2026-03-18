import { describe, expect, it } from 'vitest';
import { parseProxySse } from './proxyClient';

describe('parseProxySse', () => {
  it('parses a single data event', () => {
    const text = 'id: 1\ndata: "hello world"\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ id: 1, rawText: 'hello world' });
    expect(result.partial).toBe('');
  });

  it('parses multiple sequential events', () => {
    const text =
      'id: 1\ndata: "chunk1"\n\n' +
      'id: 2\ndata: "chunk2"\n\n' +
      'id: 3\ndata: "chunk3"\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(3);
    expect(result.events[0].rawText).toBe('chunk1');
    expect(result.events[1].rawText).toBe('chunk2');
    expect(result.events[2].rawText).toBe('chunk3');
    expect(result.events.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('retains incomplete block as partial', () => {
    const text = 'id: 1\ndata: "complete"\n\nid: 2\ndata: "incomp';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].rawText).toBe('complete');
    expect(result.partial).toBe('id: 2\ndata: "incomp');
  });

  it('flushes all blocks when flush=true', () => {
    const text = 'id: 1\ndata: "complete"\n\nid: 2\ndata: "also complete"';
    const result = parseProxySse(text, true);
    expect(result.events).toHaveLength(2);
    expect(result.partial).toBe('');
  });

  it('parses done event', () => {
    const text = 'event: done\ndata: {"totalChunks":5,"complete":true}\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('done');
    expect(result.events[0].meta).toEqual({ totalChunks: 5, complete: true });
  });

  it('parses error event', () => {
    const text =
      'event: error\ndata: {"totalChunks":3,"complete":false,"error":"timeout"}\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('error');
    expect(result.events[0].meta?.error).toBe('timeout');
  });

  it('parses interrupted event', () => {
    const text =
      'event: interrupted\ndata: {"totalChunks":10,"complete":false}\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('interrupted');
    expect(result.events[0].meta?.complete).toBe(false);
  });

  it('handles \\r\\n line endings', () => {
    const text = 'id: 1\r\ndata: "crlf"\r\n\r\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].rawText).toBe('crlf');
  });

  it('handles \\r line endings', () => {
    const text = 'id: 1\rdata: "cr"\r\r';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].rawText).toBe('cr');
  });

  it('skips empty blocks', () => {
    const text = '\n\n\n\nid: 1\ndata: "ok"\n\n\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].rawText).toBe('ok');
  });

  it('skips malformed JSON data lines', () => {
    const text = 'id: 1\ndata: not-json\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(0);
  });

  it('handles done event with malformed JSON', () => {
    const text = 'event: done\ndata: {bad json}\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('done');
    expect(result.events[0].meta).toBeUndefined();
  });

  it('handles bare data field (no value)', () => {
    const text = 'id: 1\ndata\n\n';
    const result = parseProxySse(text);
    // data is empty string, so no rawText event produced
    expect(result.events).toHaveLength(0);
  });

  it('returns empty events for empty input', () => {
    const result = parseProxySse('');
    expect(result.events).toHaveLength(0);
    expect(result.partial).toBe('');
  });

  it('handles JSON with escaped characters in data', () => {
    const text = 'id: 1\ndata: "line1\\nline2"\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].rawText).toBe('line1\nline2');
  });

  it('supports incremental parsing across multiple calls', () => {
    // Simulate chunked delivery
    const r1 = parseProxySse('id: 1\ndata: "first"\n\nid: 2\ndat');
    expect(r1.events).toHaveLength(1);
    expect(r1.events[0].rawText).toBe('first');

    // Feed partial back
    const r2 = parseProxySse(r1.partial + 'a: "second"\n\n');
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0].rawText).toBe('second');
    expect(r2.partial).toBe('');
  });

  it('mixes data and control events', () => {
    const text =
      'id: 1\ndata: "chunk1"\n\n' +
      'id: 2\ndata: "chunk2"\n\n' +
      'event: done\ndata: {"totalChunks":2,"complete":true}\n\n';
    const result = parseProxySse(text);
    expect(result.events).toHaveLength(3);
    expect(result.events[0].rawText).toBe('chunk1');
    expect(result.events[1].rawText).toBe('chunk2');
    expect(result.events[2].eventType).toBe('done');
  });
});
