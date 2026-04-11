/**
 * Playwright E2E tests for lowbit-Q quality diagnosis features.
 *
 * Each step runs as a separate test within a shared browser context,
 * so OPFS data persists between tests.
 *
 * Pre-requisite:
 *   The TinyLlama GGUF must exist at /tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf
 *
 * Run all:
 *   npx playwright test tests/lowbit-q-diagnosis.spec.ts --headed
 *
 * Run one step:
 *   npx playwright test tests/lowbit-q-diagnosis.spec.ts -g "Step 1" --headed
 */

import { test, expect } from './helpers/persistent-chrome';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const GGUF_PATH = '/tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf';
const CONVERSION_TIMEOUT = 10 * 60_000;
const MAX_TOKENS = 200;
const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';

function getStepCard(page: Page, stepLabel: string) {
  return page
    .locator('div.rounded-xl.border.p-4')
    .filter({ has: page.locator('.font-medium', { hasText: stepLabel }) });
}

async function waitForStepStatus(
  page: Page,
  stepLabel: string,
  timeout: number,
): Promise<{ status: string; detail: string }> {
  const card = getStepCard(page, stepLabel);

  await expect(async () => {
    const statusEl = card.locator('.uppercase.tracking-wide');
    const text = await statusEl.textContent();
    expect(text?.toLowerCase()).toMatch(/pass|fail/);
  }).toPass({ timeout, intervals: [2_000] });

  const status = (await card.locator('.uppercase.tracking-wide').textContent()) ?? '';
  const detailEl = card.locator('.opacity-80');
  const detail = (await detailEl.count()) > 0 ? ((await detailEl.textContent()) ?? '') : '';

  return { status: status.toLowerCase().trim(), detail };
}

async function clickActionButton(page: Page, buttonText: string) {
  const button = page.locator('button', { hasText: buttonText });
  await expect(button).toBeEnabled({ timeout: 120_000 });
  await button.click();
}

function logBrowserEvents(page: Page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('generate done') ||
      text.includes('error') ||
      text.includes('Error') ||
      text.includes('model loaded') ||
      text.includes('Complete') ||
      text.includes('init worker') ||
      text.includes('loading model file')
    ) {
      console.log(`[browser] ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[PAGE_ERROR] ${err.message}`);
  });
}

// Share a single browser context across all tests so OPFS persists
let sharedContext: BrowserContext;
let sharedPage: Page;

test.describe.serial('lowbit-Q Quality Diagnosis', () => {
  test.beforeAll(async ({ persistentContext, persistentPage }) => {
    sharedContext = persistentContext;
    sharedPage = persistentPage;
    logBrowserEvents(sharedPage);
  });

  test.afterAll(async () => {
    await sharedContext.close();
  });

  // =========================================================================
  // Step 1: UI elements + Import + Convert + Tensor metrics
  // =========================================================================
  test('Step 1: UI, import, convert, tensor metrics', async () => {
    test.setTimeout(20 * 60_000);
    const page = sharedPage;

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    // --- Verify UI elements ---
    console.log('\n========== Verify UI elements ==========');
    const convertModeSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'All weights' }),
    });
    await expect(convertModeSelect).toBeVisible();
    const modeOptions = await convertModeSelect.locator('option').allTextContents();
    console.log(`Convert modes: ${modeOptions.join(', ')}`);
    expect(modeOptions.length).toBe(7);

    const batchButton = page.locator('button', { hasText: '診断バッチ実行' });
    await expect(batchButton).toBeVisible();
    expect(await batchButton.textContent()).toContain('9p');

    // --- Import GGUF ---
    console.log('\n========== Import local GGUF ==========');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickActionButton(page, 'ローカルGGUFを読込'),
    ]);
    await fileChooser.setFiles(GGUF_PATH);

    const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 120_000);
    console.log(`Import: ${importResult.status} - ${importResult.detail}`);
    expect(importResult.status).toBe('pass');

    // --- Convert ---
    console.log('\n========== Convert to lowbit-Q (all) ==========');
    await clickActionButton(page, 'lowbit-Q変換');

    const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', CONVERSION_TIMEOUT);
    console.log(`Convert: ${convertResult.status} - ${convertResult.detail}`);
    expect(convertResult.status).toBe('pass');

    const opfsResult = await waitForStepStatus(page, 'OPFS保存', 60_000);
    console.log(`OPFS: ${opfsResult.status}`);
    expect(opfsResult.status).toBe('pass');

    const metadataResult = await waitForStepStatus(page, 'lowbit-Q metadata 検出', 60_000);
    console.log(`Metadata: ${metadataResult.status}`);
    expect(metadataResult.status).toBe('pass');

    // --- Tensor metrics ---
    console.log('\n========== Verify tensor metrics ==========');
    const tensorSection = page.locator('h2', { hasText: 'テンソル変換メトリクス' }).locator('..');
    await expect(tensorSection).toBeVisible({ timeout: 10_000 });

    const summaryText = await tensorSection.locator('text=変換済み').locator('..').textContent();
    console.log(`  ${summaryText}`);

    const tensorTable = tensorSection.locator('table');
    await expect(tensorTable).toBeVisible();
    const rowCount = await tensorTable.locator('tbody tr').count();
    console.log(`  Tensor rows: ${rowCount}`);
    expect(rowCount).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/lowbit-q-step1-result.png', fullPage: true });
    console.log('Step 1 PASS');
  });

  // =========================================================================
  // Step 2: Original model — 9 prompts, one by one
  // =========================================================================
  test('Step 2: original model 9 prompts', async () => {
    test.setTimeout(30 * 60_000);
    const page = sharedPage;

    // Reload to fresh state but OPFS is preserved
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    await page.locator('input[type="number"][min="8"]').fill(String(MAX_TOKENS));

    const promptSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Greeting' }),
    });
    const promptOptions = await promptSelect.locator('option').allTextContents();
    console.log(`\nPrompts: ${promptOptions.length}`);

    const results: Array<{ label: string; status: string; chars: number }> = [];

    for (let i = 0; i < promptOptions.length; i++) {
      const label = promptOptions[i];
      console.log(`\nOriginal ${i + 1}/${promptOptions.length}: ${label}`);

      await promptSelect.selectOption({ index: i });
      await page.waitForTimeout(200);
      await clickActionButton(page, '原本を実行');

      const result = await waitForStepStatus(page, '原本 load/generate', 15 * 60_000);
      console.log(`  ${result.status} - ${result.detail}`);

      const outputPre = page.locator('.text-slate-600:has-text("original")').locator('..').locator('pre');
      const output = await outputPre.textContent().catch(() => '');
      const chars = output?.length ?? 0;
      console.log(`  ${chars} chars`);

      results.push({ label, status: result.status, chars });
      expect(result.status).toBe('pass');
    }

    // Summary
    console.log('\n--- Original Summary ---');
    for (const r of results) {
      console.log(`  ${r.label}: ${r.status} (${r.chars} chars)`);
    }

    // Save results to file for cross-step reference
    fs.writeFileSync(
      path.join(path.resolve('tests'), 'lowbit-q-step2-original.json'),
      JSON.stringify(results, null, 2),
    );

    await page.screenshot({ path: 'tests/lowbit-q-step2-result.png', fullPage: true });
    console.log('Step 2 PASS');
  });

  // =========================================================================
  // Step 3: lowbit-Q model — 9 prompts, one by one
  // =========================================================================
  test('Step 3: lowbit-Q model 9 prompts', async () => {
    test.setTimeout(45 * 60_000);
    const page = sharedPage;

    // Reload
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    await page.locator('input[type="number"][min="8"]').fill(String(MAX_TOKENS));

    const promptSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Greeting' }),
    });
    const promptOptions = await promptSelect.locator('option').allTextContents();

    const results: Array<{ label: string; status: string; chars: number }> = [];

    for (let i = 0; i < promptOptions.length; i++) {
      const label = promptOptions[i];
      console.log(`\nlowbit-Q ${i + 1}/${promptOptions.length}: ${label}`);

      await promptSelect.selectOption({ index: i });
      await page.waitForTimeout(200);
      await clickActionButton(page, 'lowbit-Qを実行');

      const result = await waitForStepStatus(page, 'lowbit-Q load/generate', 15 * 60_000);
      console.log(`  ${result.status} - ${result.detail}`);

      const outputPre = page.locator('.text-slate-600:has-text("lowbit-Q")').locator('..').locator('pre');
      const output = await outputPre.textContent().catch(() => '');
      const chars = output?.length ?? 0;
      console.log(`  ${chars} chars`);

      results.push({ label, status: result.status, chars });
      expect(result.status).toBe('pass');
    }

    // Summary
    console.log('\n--- lowbit-Q Summary ---');
    for (const r of results) {
      console.log(`  ${r.label}: ${r.status} (${r.chars} chars)`);
    }

    fs.writeFileSync(
      path.join(path.resolve('tests'), 'lowbit-q-step3-lowbit-q.json'),
      JSON.stringify(results, null, 2),
    );

    await page.screenshot({ path: 'tests/lowbit-q-step3-result.png', fullPage: true });
    console.log('Step 3 PASS');
  });

  // =========================================================================
  // Step 4: JSON export + comparison report
  // =========================================================================
  test('Step 4: export and comparison', async () => {
    test.setTimeout(5 * 60_000);
    const page = sharedPage;

    // Page should still have run history from Steps 2 & 3
    const historySection = page.locator('h2', { hasText: '保存済み実行履歴' }).locator('..');
    const historyPre = historySection.locator('pre');
    const historyText = await historyPre.textContent().catch(() => '[]');
    const history = JSON.parse(historyText || '[]');
    console.log(`Run history: ${history.length} entries`);
    expect(history.length).toBeGreaterThanOrEqual(9);

    // Export
    console.log('\n========== JSON export ==========');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('button', { hasText: 'JSONを書き出す' }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const exportContent = fs.readFileSync(downloadPath!, 'utf-8');
    const exportJson = JSON.parse(exportContent);

    const savePath = path.join(path.resolve('tests'), 'lowbit-q-diagnosis-export.json');
    fs.writeFileSync(savePath, JSON.stringify(exportJson, null, 2));
    console.log(`Saved to: ${savePath}`);

    // Comparison
    if (Array.isArray(exportJson)) {
      const originalRuns = exportJson.filter((r: Record<string, unknown>) => r.variant === 'original');
      const lowbitQRuns = exportJson.filter((r: Record<string, unknown>) => r.variant === 'lowbit-q');
      console.log(`Original: ${originalRuns.length} runs, lowbit-Q: ${lowbitQRuns.length} runs`);

      console.log('\n--- Quality Comparison ---');
      console.log('Prompt                   | Orig chars | 1bit chars | Delta');
      console.log('-------------------------|------------|------------|------');
      for (const lowbitQ of lowbitQRuns) {
        const orig = originalRuns.find((r: Record<string, unknown>) => r.promptId === lowbitQ.promptId);
        const origLen = typeof orig?.output === 'string' ? orig.output.length : 0;
        const lowbitQLen = typeof lowbitQ.output === 'string' ? lowbitQ.output.length : 0;
        const pid = String(lowbitQ.promptId ?? '').padEnd(24);
        console.log(`${pid} | ${String(origLen).padStart(10)} | ${String(lowbitQLen).padStart(10)} | ${lowbitQLen - origLen}`);
      }
    }

    await page.screenshot({ path: 'tests/lowbit-q-step4-result.png', fullPage: true });
    console.log('\nStep 4 PASS');
  });
});
