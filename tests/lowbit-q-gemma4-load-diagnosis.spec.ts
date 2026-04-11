/**
 * Gemma 4 load failure diagnosis:
 *   1. Import original GGUF → "原本を実行" (no conversion)
 *   2. Import + PASSTHROUGH convert → "lowbit-Qを実行"
 *
 * Purpose: determine if the WASM unreachable trap is caused by
 *   (a) the conversion output format, or
 *   (b) Gemma 4 itself being incompatible with this wllama build
 *
 * Run:
 *   npx playwright test tests/lowbit-q-gemma4-load-diagnosis.spec.ts --headed
 */

import { test, expect } from './helpers/persistent-chrome';
import { ErrorCapture, waitForStepStatus, clickButton } from './helpers/error-capture';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';
const GGUF_PATH = '/tmp/gemma-4-E2B-it-Q4_K_M.gguf';

test.describe.serial('Gemma 4 Load Failure Diagnosis', () => {
  test('Step 1: Original GGUF load (no conversion)', async ({ persistentPage }) => {
    test.setTimeout(15 * 60_000);

    if (!fs.existsSync(GGUF_PATH)) {
      test.skip(true, `GGUF not found: ${GGUF_PATH}`);
      return;
    }

    const page = persistentPage;
    const capture = new ErrorCapture(page);
    capture.install();

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    // Clear OPFS
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of (root as any).entries()) {
        await root.removeEntry(name, { recursive: true });
      }
    });
    console.log('[Gemma4-diagnosis] OPFS cleared');

    // Import
    console.log('[Gemma4-diagnosis] Importing original GGUF...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 30_000 }),
      clickButton(page, 'ローカルGGUFを読込'),
    ]);
    await fileChooser.setFiles(GGUF_PATH);
    const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 10 * 60_000, capture);
    console.log(`[Gemma4-diagnosis] Import: ${importResult.status} — ${importResult.detail}`);

    if (importResult.status !== 'pass') {
      console.log('[Gemma4-diagnosis] Import failed, skipping load test');
      capture.dispose();
      return;
    }

    // Verify OPFS file size
    const opfsSize = await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const modelsDir = await root.getDirectoryHandle('models');
        for await (const [, dirHandle] of (modelsDir as any).entries()) {
          for await (const [name, fileHandle] of (dirHandle as any).entries()) {
            const f = await fileHandle.getFile();
            return { name, size: f.size };
          }
        }
      } catch { return null; }
      return null;
    });
    console.log(`[Gemma4-diagnosis] OPFS file: ${JSON.stringify(opfsSize)}`);

    // Select minimal token budget and run ORIGINAL (no conversion)
    await page.locator('input[type="number"][min="8"]').fill('30');
    const promptSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Greeting' }),
    });
    await promptSelect.selectOption({ value: 'tiny-reasoning' }).catch(() => undefined);
    await page.waitForTimeout(300);

    capture.clear();
    console.log('[Gemma4-diagnosis] Clicking 原本を実行...');
    await clickButton(page, '原本を実行', 30_000);
    const runResult = await waitForStepStatus(page, '原本 load/generate', 5 * 60_000, capture);
    console.log(`[Gemma4-diagnosis] Original run: ${runResult.status} — ${runResult.detail.slice(0, 300)}`);

    // Capture llama.cpp logs
    const errors = capture.getErrors();
    for (const e of errors) {
      console.log(`[Gemma4-diagnosis] ERROR: ${e.message.slice(0, 400)}`);
    }

    capture.dispose();
    console.log('[Gemma4-diagnosis] Step 1 complete. Result:', runResult.status);
  });

  test('Step 2: PASSTHROUGH convert then load', async ({ persistentPage }) => {
    test.setTimeout(20 * 60_000);

    if (!fs.existsSync(GGUF_PATH)) {
      test.skip(true, `GGUF not found: ${GGUF_PATH}`);
      return;
    }

    const page = persistentPage;
    const capture = new ErrorCapture(page);
    capture.install();

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    // Clear OPFS
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of (root as any).entries()) {
        await root.removeEntry(name, { recursive: true });
      }
    });
    console.log('[Gemma4-diagnosis] OPFS cleared');

    // Import
    console.log('[Gemma4-diagnosis] Importing for conversion test...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 30_000 }),
      clickButton(page, 'ローカルGGUFを読込'),
    ]);
    await fileChooser.setFiles(GGUF_PATH);
    const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 10 * 60_000, capture);
    console.log(`[Gemma4-diagnosis] Import: ${importResult.status} — ${importResult.detail}`);

    if (importResult.status !== 'pass') {
      console.log('[Gemma4-diagnosis] Import failed');
      capture.dispose();
      return;
    }

    // PASSTHROUGH convert
    const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
    await presetSelect.selectOption('v2-native-direct');
    await page.waitForTimeout(300);

    capture.clear();
    console.log('[Gemma4-diagnosis] Converting (PASSTHROUGH)...');
    await clickButton(page, 'lowbit-Q変換', 30_000);
    const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', 10 * 60_000, capture);
    console.log(`[Gemma4-diagnosis] Convert: ${convertResult.status} — ${convertResult.detail.slice(0, 200)}`);

    if (convertResult.status !== 'pass') {
      console.log('[Gemma4-diagnosis] Conversion failed');
      capture.dispose();
      return;
    }

    await waitForStepStatus(page, 'OPFS保存', 60_000, capture).catch(() => undefined);

    // Verify converted file size
    const opfsSize = await page.evaluate(async () => {
      const results: {name: string, size: number}[] = [];
      try {
        const root = await navigator.storage.getDirectory();
        const modelsDir = await root.getDirectoryHandle('models');
        for await (const [, dirHandle] of (modelsDir as any).entries()) {
          for await (const [name, fileHandle] of (dirHandle as any).entries()) {
            const f = await fileHandle.getFile();
            results.push({ name, size: f.size });
          }
        }
      } catch { /* ignore */ }
      return results;
    });
    console.log(`[Gemma4-diagnosis] OPFS after convert: ${JSON.stringify(opfsSize)}`);

    // Run lowbit-Q
    await page.locator('input[type="number"][min="8"]').fill('30');
    await page.locator('select').filter({
      has: page.locator('option', { hasText: 'Greeting' }),
    }).selectOption({ value: 'tiny-reasoning' }).catch(() => undefined);
    await page.waitForTimeout(300);

    capture.clear();
    console.log('[Gemma4-diagnosis] Clicking lowbit-Qを実行...');
    await clickButton(page, 'lowbit-Qを実行', 30_000);
    const runResult = await waitForStepStatus(page, 'lowbit-Q load/generate', 5 * 60_000, capture);
    console.log(`[Gemma4-diagnosis] LowbitQ run: ${runResult.status} — ${runResult.detail.slice(0, 300)}`);

    const errors = capture.getErrors();
    for (const e of errors) {
      console.log(`[Gemma4-diagnosis] ERROR: ${e.message.slice(0, 400)}`);
    }

    capture.dispose();
    console.log('[Gemma4-diagnosis] Step 2 complete. Result:', runResult.status);
  });
});
