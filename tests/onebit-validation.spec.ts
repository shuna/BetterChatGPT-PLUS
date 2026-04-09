/**
 * Playwright E2E test for onebit validation.
 *
 * Pre-requisite:
 *   curl -L -o /tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf \
 *     "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q8_0.gguf"
 *
 * Run:
 *   npx playwright test tests/onebit-validation.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

const GGUF_PATH = '/tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf';
const CONVERSION_TIMEOUT = 10 * 60_000;
const INFERENCE_TIMEOUT = 15 * 60_000;

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
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
}

/** Dump native/worker logs from the page. */
async function dumpLogs(page: Page, label: string) {
  const logsSection = page.locator('h2', { hasText: 'native / worker logs' }).locator('..');
  const logsText = await logsSection.locator('pre').textContent().catch(() => '(empty)');
  const lines = logsText?.split('\n').slice(-30) ?? [];
  console.log(`--- ${label} (last 30 native logs) ---`);
  for (const line of lines) console.log(`  ${line}`);
}

/** Dump diagnostics from the page. */
async function dumpDiagnostics(page: Page, label: string) {
  const diagSection = page.locator('h2', { hasText: 'diagnostics' }).locator('..');
  const diagText = await diagSection.locator('pre').textContent().catch(() => '(empty)');
  console.log(`--- ${label} diagnostics ---`);
  console.log(diagText?.slice(0, 2000));
}

test.describe('Onebit Validation', () => {
  test.setTimeout(30 * 60_000);

  test('full validation flow: import, convert, infer, compare', async ({ page }) => {
    // Stream ALL browser console to stdout in real time
    page.on('console', (msg) => {
      const text = msg.text();
      // Filter for relevant messages
      if (
        text.includes('wllama') ||
        text.includes('onebit') ||
        text.includes('model') ||
        text.includes('load') ||
        text.includes('error') ||
        text.includes('Error') ||
        text.includes('worker') ||
        text.includes('WASM') ||
        text.includes('generate') ||
        text.includes('tensor') ||
        text.includes('runtime')
      ) {
        console.log(`[browser:${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`[PAGE_ERROR] ${err.message}`);
    });

    await page.goto('http://localhost:5175/?onebit-validation=1', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await expect(page.locator('text=wllama onebit 品質診断UI')).toBeVisible();

    // Set maxTokens to 2000
    await page.locator('input[type="number"][min="8"]').fill('2000');

    // =============================================
    // Step 1: Import local GGUF
    // =============================================
    console.log('\n========== Step 1: Import local GGUF ==========');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickActionButton(page, 'ローカルGGUFを読込'),
    ]);
    await fileChooser.setFiles(GGUF_PATH);

    const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 120_000);
    console.log(`Import: ${importResult.status} - ${importResult.detail}`);
    expect(importResult.status).toBe('pass');

    // =============================================
    // Step 2: Convert to onebit
    // =============================================
    console.log('\n========== Step 2: Convert to onebit ==========');
    await clickActionButton(page, 'onebit変換');

    const convertProgressCheck = setInterval(async () => {
      try {
        const text = await page.locator('text=convert:').textContent({ timeout: 1000 });
        if (text) console.log(`  ${text.trim()}`);
      } catch { /* noop */ }
    }, 10_000);

    const convertResult = await waitForStepStatus(page, 'onebit変換', CONVERSION_TIMEOUT);
    clearInterval(convertProgressCheck);
    console.log(`Convert: ${convertResult.status} - ${convertResult.detail}`);
    expect(convertResult.status).toBe('pass');

    const opfsResult = await waitForStepStatus(page, 'OPFS保存', 60_000);
    console.log(`OPFS: ${opfsResult.status} - ${opfsResult.detail}`);
    expect(opfsResult.status).toBe('pass');

    const metadataResult = await waitForStepStatus(page, 'onebit metadata 検出', 60_000);
    console.log(`Metadata: ${metadataResult.status} - ${metadataResult.detail}`);
    expect(metadataResult.status).toBe('pass');

    // Verify metadata
    const metadataSection = page.locator('h2', { hasText: 'metadata' }).locator('..');
    const metadataText = await metadataSection.locator('pre').textContent();
    if (metadataText) {
      try {
        const metadata = JSON.parse(metadataText.trim());
        console.log(`  onebit.version: ${metadata.onebitVersion}`);
        console.log(`  layers: [${metadata.layers?.join(', ')}] (${metadata.layers?.length} layers)`);
        console.log(`  onebit tensors: ${metadata.onebitTensorCount} / ${metadata.tensorCount}`);
        expect(metadata.hasOnebitVersion).toBe(true);
        expect(metadata.layers.length).toBeGreaterThan(0);
      } catch (e) {
        console.log(`  metadata parse error: ${e}`);
      }
    }

    // =============================================
    // Step 4: Run original model
    // =============================================
    console.log('\n========== Step 3: Run original model ==========');
    console.log('  Clicking "原本を実行"...');
    await clickActionButton(page, '原本を実行');

    // Log progress every 10s while waiting
    const originalLogCheck = setInterval(async () => {
      try {
        const stepCard = getStepCard(page, '原本 load/generate');
        const detail = await stepCard.locator('.opacity-80').textContent({ timeout: 1000 }).catch(() => null);
        const status = await stepCard.locator('.uppercase.tracking-wide').textContent({ timeout: 1000 }).catch(() => null);
        console.log(`  [original] status=${status} detail=${detail}`);
        // Also dump latest native logs
        await dumpLogs(page, 'original-progress');
      } catch { /* noop */ }
    }, 10_000);

    const originalResult = await waitForStepStatus(page, '原本 load/generate', INFERENCE_TIMEOUT);
    clearInterval(originalLogCheck);
    console.log(`Original: ${originalResult.status} - ${originalResult.detail}`);

    await dumpLogs(page, 'after-original');

    if (originalResult.status === 'fail') {
      await dumpDiagnostics(page, 'original-fail');
      await page.screenshot({ path: 'tests/onebit-original-fail.png', fullPage: true });
    }
    expect(originalResult.status).toBe('pass');

    // Capture output
    const originalOutputPre = page.locator('.text-slate-600:has-text("original")').locator('..').locator('pre');
    const originalOutput = await originalOutputPre.textContent().catch(() => '(not captured)');
    console.log(`  Output (first 500): ${originalOutput?.slice(0, 500)}`);

    // =============================================
    // Step 5: Run onebit model
    // =============================================
    console.log('\n========== Step 4: Run onebit model ==========');
    console.log('  Clicking "onebitを実行"...');
    await clickActionButton(page, 'onebitを実行');

    const onebitLogCheck = setInterval(async () => {
      try {
        const stepCard = getStepCard(page, 'onebit load/generate');
        const detail = await stepCard.locator('.opacity-80').textContent({ timeout: 1000 }).catch(() => null);
        const status = await stepCard.locator('.uppercase.tracking-wide').textContent({ timeout: 1000 }).catch(() => null);
        console.log(`  [onebit] status=${status} detail=${detail}`);
        await dumpLogs(page, 'onebit-progress');
      } catch { /* noop */ }
    }, 10_000);

    const onebitResult = await waitForStepStatus(page, 'onebit load/generate', INFERENCE_TIMEOUT);
    clearInterval(onebitLogCheck);
    console.log(`Onebit: ${onebitResult.status} - ${onebitResult.detail}`);

    await dumpLogs(page, 'after-onebit');
    await dumpDiagnostics(page, 'after-onebit');

    // Capture output
    const onebitOutputPre = page.locator('.text-slate-600:has-text("onebit")').locator('..').locator('pre');
    const onebitOutput = await onebitOutputPre.textContent().catch(() => '(not captured)');
    console.log(`  Output (first 500): ${onebitOutput?.slice(0, 500)}`);

    // =============================================
    // Path verification
    // =============================================
    console.log('\n========== Onebit Path Verification ==========');
    const pathSection = page.locator('h2', { hasText: 'onebit 経路の証跡' }).locator('..');
    const pathCards = pathSection.locator('.rounded-xl.border.p-4');
    const pathCount = await pathCards.count();
    for (let i = 0; i < pathCount; i++) {
      const cardText = await pathCards.nth(i).textContent();
      console.log(`  ${cardText?.replace(/\s+/g, ' ').trim()}`);
    }

    // Screenshot
    await page.screenshot({ path: 'tests/onebit-validation-result.png', fullPage: true });
    console.log('\nScreenshot: tests/onebit-validation-result.png');

    // Run history
    const historySection = page.locator('h2', { hasText: '保存済み実行履歴' }).locator('..');
    const historyText = await historySection.locator('pre').textContent().catch(() => '[]');
    console.log('\n========== Run History ==========');
    console.log(historyText?.slice(0, 3000));

    // Final
    console.log(`\n========== FINAL ==========`);
    console.log(`Original: ${originalResult.status}`);
    console.log(`Onebit:   ${onebitResult.status}`);

    expect(originalResult.status).toBe('pass');
  });
});
