/**
 * Playwright error capture helper for lowbit-Q E2E tests.
 *
 * Design principle: **every browser event is printed to stdout immediately**.
 * This ensures that background test runners (and Claude monitoring via
 * TaskOutput) can see errors, progress, and stalls in real-time — not just
 * after a timeout.
 *
 * Captured sources:
 *   - console.*  (all levels, all messages)
 *   - pageerror  (uncaught exceptions)
 *   - requestfailed (network errors)
 *   - page crash (tab OOM / renderer crash)
 *   - page close (unexpected tab close)
 *   - progress stall detection (no events for N seconds)
 *
 * Usage:
 *   const capture = new ErrorCapture(page);
 *   capture.install();
 *   // ... run test steps ...
 *   await waitForStepStatus(page, 'lowbit-Q変換', 15 * 60_000, capture);
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface CapturedEvent {
  ts: number;
  type: 'console' | 'pageerror' | 'crash' | 'close' | 'network-error';
  level: 'info' | 'warn' | 'error' | 'fatal';
  message: string;
}

export class ErrorCapture {
  private events: CapturedEvent[] = [];
  private page: Page;
  private installed = false;
  private startTs = Date.now();
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventTs = Date.now();
  /** Seconds of silence before a stall warning is printed. */
  private stallThresholdMs = 60_000;

  constructor(page: Page) {
    this.page = page;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.startTs = Date.now();
    this.lastEventTs = Date.now();

    // -----------------------------------------------------------------------
    // 1. ALL console messages → stdout immediately
    // -----------------------------------------------------------------------
    this.page.on('console', (msg) => {
      const text = msg.text();
      const level = msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warn' : 'info';

      this.push('console', level, text.slice(0, 1000));

      const tag = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'LOG';
      console.log(`[CAPTURE:${tag}] ${this.elapsed()} ${text.slice(0, 500)}`);
    });

    // -----------------------------------------------------------------------
    // 2. Uncaught page errors
    // -----------------------------------------------------------------------
    this.page.on('pageerror', (err) => {
      const msg = `${err.name}: ${err.message}`;
      this.push('pageerror', 'error', msg.slice(0, 1000));
      console.log(`[CAPTURE:PAGE_ERROR] ${this.elapsed()} ${msg.slice(0, 500)}`);
    });

    // -----------------------------------------------------------------------
    // 3. Network failures
    // -----------------------------------------------------------------------
    this.page.on('requestfailed', (req) => {
      const msg = `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`;
      this.push('network-error', 'error', msg);
      console.log(`[CAPTURE:NET_FAIL] ${this.elapsed()} ${msg}`);
    });

    // -----------------------------------------------------------------------
    // 4. Page crash (renderer OOM, WASM abort, etc.)
    // -----------------------------------------------------------------------
    this.page.on('crash', () => {
      this.push('crash', 'fatal', 'Page crashed (renderer process died — likely OOM or WASM abort)');
      console.log(`[CAPTURE:CRASH] ${this.elapsed()} *** PAGE CRASHED — renderer process died ***`);
    });

    // -----------------------------------------------------------------------
    // 5. Unexpected page close
    // -----------------------------------------------------------------------
    this.page.on('close', () => {
      this.push('close', 'fatal', 'Page closed unexpectedly');
      console.log(`[CAPTURE:CLOSE] ${this.elapsed()} *** PAGE CLOSED ***`);
    });

    // -----------------------------------------------------------------------
    // 6. Progress stall detection — warn if no events for stallThresholdMs
    // -----------------------------------------------------------------------
    this.stallTimer = setInterval(() => {
      const silenceMs = Date.now() - this.lastEventTs;
      if (silenceMs >= this.stallThresholdMs) {
        console.log(
          `[CAPTURE:STALL] ${this.elapsed()} *** No browser events for ${(silenceMs / 1000).toFixed(0)}s — possible stall ***`,
        );
      }
    }, 30_000); // check every 30s
  }

  /** Uninstall the stall timer. Call in afterAll. */
  dispose(): void {
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }

  /** Get all captured errors (level=error or fatal) */
  getErrors(): CapturedEvent[] {
    return this.events.filter((e) => e.level === 'error' || e.level === 'fatal');
  }

  /** Get all captured events */
  getAll(): CapturedEvent[] {
    return [...this.events];
  }

  /** Get a human-readable error summary (last N errors) */
  getErrorSummary(maxErrors = 10): string {
    const errors = this.getErrors();
    if (errors.length === 0) return '(no errors captured)';

    const recent = errors.slice(-maxErrors);
    return recent
      .map((e) => {
        const elapsed = ((e.ts - this.startTs) / 1000).toFixed(1);
        return `  [+${elapsed}s ${e.type}] ${e.message.slice(0, 200)}`;
      })
      .join('\n');
  }

  /** Get recent console log context (last N messages of any level) */
  getRecentContext(maxLines = 20): string {
    const recent = this.events.slice(-maxLines);
    return recent
      .map((e) => {
        const elapsed = ((e.ts - this.startTs) / 1000).toFixed(1);
        return `  [+${elapsed}s ${e.level}] ${e.message.slice(0, 150)}`;
      })
      .join('\n');
  }

  /** Clear captured events */
  clear(): void {
    this.events = [];
    this.startTs = Date.now();
    this.lastEventTs = Date.now();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private push(type: CapturedEvent['type'], level: CapturedEvent['level'], message: string): void {
    const now = Date.now();
    this.events.push({ ts: now, type, level, message });
    this.lastEventTs = now;
  }

  private elapsed(): string {
    return `+${((Date.now() - this.startTs) / 1000).toFixed(1)}s`;
  }
}

// ---------------------------------------------------------------------------
// Enhanced step-waiting helpers
// ---------------------------------------------------------------------------

export function getStepCard(page: Page, stepLabel: string) {
  return page
    .locator('div.rounded-xl.border.p-4')
    .filter({ has: page.locator('.font-medium', { hasText: stepLabel }) });
}

/**
 * Wait for a validation step to reach PASS or FAIL, with error context on timeout.
 *
 * On each poll interval, prints the current card state to stdout so progress
 * is visible in real-time (not just on timeout).
 */
export async function waitForStepStatus(
  page: Page,
  stepLabel: string,
  timeout: number,
  capture?: ErrorCapture,
): Promise<{ status: string; detail: string }> {
  const card = getStepCard(page, stepLabel);
  const startTs = Date.now();

  try {
    await expect(async () => {
      // Print current card state on each poll for real-time visibility
      try {
        const statusText = await card.locator('.uppercase.tracking-wide').textContent({ timeout: 2000 });
        const detailText = await card.locator('.opacity-80').textContent({ timeout: 2000 }).catch(() => '');
        const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
        console.log(`[STEP:${stepLabel}] +${elapsed}s status="${statusText}" detail="${detailText}"`);
      } catch {
        // card not visible yet
      }

      const statusEl = card.locator('.uppercase.tracking-wide');
      const text = await statusEl.textContent();
      expect(text?.toLowerCase()).toMatch(/pass|fail/);
    }).toPass({ timeout, intervals: [5_000] });
  } catch (err) {
    // On timeout, build a detailed error report
    const errorContext = capture ? capture.getErrorSummary() : '(no capture installed)';
    const recentContext = capture ? capture.getRecentContext() : '';

    let cardState = '(could not read)';
    try {
      const statusText = await card.locator('.uppercase.tracking-wide').textContent({ timeout: 2000 });
      const detailText = await card.locator('.opacity-80').textContent({ timeout: 2000 }).catch(() => '');
      cardState = `status="${statusText}", detail="${detailText}"`;
    } catch {
      // card not found
    }

    const report = [
      `Step "${stepLabel}" did not reach PASS/FAIL within ${(timeout / 1000).toFixed(0)}s`,
      `Card state: ${cardState}`,
      `\nCaptured errors:\n${errorContext}`,
      `\nRecent console:\n${recentContext}`,
    ].join('\n');

    console.log(`\n${'='.repeat(60)}`);
    console.log('[STEP_TIMEOUT_REPORT]');
    console.log(report);
    console.log(`${'='.repeat(60)}\n`);

    throw new Error(report);
  }

  const status = (await card.locator('.uppercase.tracking-wide').textContent()) ?? '';
  const detailEl = card.locator('.opacity-80');
  const detail = (await detailEl.count()) > 0 ? ((await detailEl.textContent()) ?? '') : '';
  return { status: status.toLowerCase().trim(), detail };
}

// ---------------------------------------------------------------------------
// Quick WASM smoke test — load a GGUF directly via wllama
// ---------------------------------------------------------------------------

export async function quickWllamaLoadTest(
  page: Page,
  ggufUrl: string,
  capture?: ErrorCapture,
): Promise<{
  success: boolean;
  loadMs?: number;
  arch?: string;
  output?: string;
  error?: string;
}> {
  const result = await page.evaluate(async (url: string) => {
    try {
      // @ts-expect-error wllama is globally available
      const { Wllama } = await import('/src/vendor/wllama/index.js');
      const wllama = new Wllama({
        'single-thread/wllama.wasm': '/vendor/wllama/single-thread.wasm',
        'multi-thread/wllama.wasm': '/vendor/wllama/multi-thread.wasm',
      });

      const start = performance.now();
      await wllama.loadModelFromUrl(url, { n_ctx: 256, n_threads: 1 });
      const loadMs = Math.round(performance.now() - start);

      const meta = await wllama.getModelMetadata?.() ?? {};
      const arch = meta['general.architecture'] ?? 'unknown';

      const output = await wllama.createCompletion('Hello', { nPredict: 5 });
      await wllama.exit();

      return { success: true, loadMs, arch, output };
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) };
    }
  }, ggufUrl);

  if (!result.success && capture) {
    console.log(`[WLLAMA_LOAD_FAIL] ${result.error}`);
    console.log(`[WLLAMA_LOAD_FAIL] Recent errors:\n${capture.getErrorSummary()}`);
  }

  return result;
}

export async function clickButton(page: Page, text: string, timeout = 60_000) {
  const button = page.locator('button', { hasText: text });
  await expect(button).toBeEnabled({ timeout });
  await button.click();
}

export function detectCollapse(output: string): boolean {
  if (output.length === 0) return false;
  const words = output.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
  return Math.max(...Object.values(freq)) / words.length > 0.4;
}
