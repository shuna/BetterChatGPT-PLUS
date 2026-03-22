/**
 * Sync-check test: verifies that the plain-JS ThinkTagParser in sw-stream.js
 * produces identical results to the canonical TS implementation.
 *
 * If this test fails, the two implementations have diverged and
 * public/sw-stream.js must be updated to match src/utils/thinkTagParser.ts.
 */
import { describe, it, expect } from 'vitest';
import { ThinkTagParser } from './thinkTagParser';
import { readFileSync } from 'fs';
import { join } from 'path';

// Extract and eval the createThinkTagParser function from sw-stream.js
function loadSwThinkTagParser(): { process: (text: string) => { content: string; reasoning: string }; flush: () => { content: string; reasoning: string } } {
  const swSource = readFileSync(join(__dirname, '../../public/sw-stream.js'), 'utf-8');
  const match = swSource.match(
    /function createThinkTagParser\(\)[\s\S]*?return \{ process, flush \};\s*\}/
  );
  if (!match) throw new Error('Could not extract createThinkTagParser from sw-stream.js');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${match[0]}\nreturn createThinkTagParser();`);
  return factory();
}

const testCases: { name: string; chunks: string[] }[] = [
  { name: 'plain text', chunks: ['Hello world'] },
  { name: 'single think block', chunks: ['before<think>reasoning</think>after'] },
  { name: 'split open tag', chunks: ['Hello<thi', 'nk>reasoning</think>end'] },
  { name: 'split close tag', chunks: ['<think>reasoning</thi', 'nk>after'] },
  { name: 'multiple blocks', chunks: ['A<think>R1</think>B<think>R2</think>C'] },
  { name: 'many small chunks', chunks: ['<', 'th', 'ink', '>', 'deep', '</', 'think', '>', 'done'] },
  { name: 'empty input', chunks: [''] },
  { name: 'no close tag (stream ends inside)', chunks: ['<think>partial reasoning'] },
  { name: 'partial open tag at end', chunks: ['text<thi'] },
];

describe('ThinkTagParser sync check (TS vs sw-stream.js)', () => {
  const swParser = loadSwThinkTagParser;

  for (const tc of testCases) {
    it(`produces identical output for: ${tc.name}`, () => {
      const ts = new ThinkTagParser();
      const sw = swParser();

      let tsContent = '', tsReasoning = '';
      let swContent = '', swReasoning = '';

      for (const chunk of tc.chunks) {
        const tsR = ts.process(chunk);
        const swR = sw.process(chunk);
        tsContent += tsR.content;
        tsReasoning += tsR.reasoning;
        swContent += swR.content;
        swReasoning += swR.reasoning;
      }

      const tsFlush = ts.flush();
      const swFlush = sw.flush();
      tsContent += tsFlush.content;
      tsReasoning += tsFlush.reasoning;
      swContent += swFlush.content;
      swReasoning += swFlush.reasoning;

      expect(swContent).toBe(tsContent);
      expect(swReasoning).toBe(tsReasoning);
    });
  }
});
