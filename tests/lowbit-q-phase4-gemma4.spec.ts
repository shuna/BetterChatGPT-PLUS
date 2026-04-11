/**
 * Phase 4: Gemma 4 E2B native quant baseline E2E tests.
 *
 * Model: Gemma 4 E2B (architecture: gemma4)
 *   - Tertiary evaluation target for Phase 4
 *   - Non-Llama → arch guard forces SVID → Q4_0 (native quant only)
 *   - Requires llama.cpp submodule update to ≥2026-04 for gemma4 arch support
 *
 * UI: LowbitQValidationPage.tsx (same as Phase 3 comparison page)
 *   See lowbit-q-phase4-smollm2.spec.ts header for selector reference.
 *
 * GGUF prerequisites (download from HuggingFace before running):
 *   Q8_0: /tmp/gemma-4-e2b-it.Q8_0.gguf
 *   Q4_0: /tmp/gemma-4-e2b-it.Q4_0.gguf
 *   Q3_K: /tmp/gemma-4-e2b-it.Q3_K_S.gguf
 *   Q2_K: /tmp/gemma-4-e2b-it.Q2_K.gguf
 *
 * Download example (from Unsloth/bartowski):
 *   huggingface-cli download bartowski/gemma-4-e2b-it-GGUF \
 *     gemma-4-e2b-it-Q8_0.gguf \
 *     --local-dir /tmp/
 *
 * Run:
 *   npx playwright test tests/lowbit-q-phase4-gemma4.spec.ts --headed
 */

import { test, expect } from './helpers/persistent-chrome';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';
const IMPORT_TIMEOUT = 12 * 60_000;  // Gemma 4 E2B Q8_0 ≈ 2.0 GB
const CONVERT_TIMEOUT = 15 * 60_000;
const INFERENCE_TIMEOUT = 10 * 60_000;
const MAX_TOKENS = 150;

interface ModelVariant {
  label: string;
  ggufPath: string;
  quantType: string;
}

const MODEL_VARIANTS: ModelVariant[] = [
  {
    label: 'Q8_0 (reference)',
    ggufPath: '/tmp/gemma-4-e2b-it.Q8_0.gguf',
    quantType: 'Q8_0',
  },
  {
    label: 'Q4_0',
    ggufPath: '/tmp/gemma-4-e2b-it.Q4_0.gguf',
    quantType: 'Q4_0',
  },
  {
    label: 'Q3_K',
    ggufPath: '/tmp/gemma-4-e2b-it.Q3_K_S.gguf',
    quantType: 'Q3_K_S',
  },
  {
    label: 'Q2_K',
    ggufPath: '/tmp/gemma-4-e2b-it.Q2_K.gguf',
    quantType: 'Q2_K',
  },
];

// Smoke prompts mapped to validation page fixed prompt IDs
const SMOKE_PROMPTS = [
  { id: 'short-qa-en', label: 'Short QA', expectPattern: /paris/i },
  { id: 'list-generation', label: 'List', expectPattern: /春|夏|秋|冬/ },
  { id: 'tiny-reasoning', label: 'Reasoning', expectPattern: /[0-9５]/ },
];

interface SmokeTestResult {
  promptId: string;
  output: string;
  matchedExpected: boolean;
  collapsed: boolean;
}

interface VariantResult {
  label: string;
  quantType: string;
  ggufPath: string;
  available: boolean;
  conversionSuccess: boolean;
  loadSuccess: boolean;
  smokeTests: SmokeTestResult[];
  tokenGenSuccess: boolean;
  functionalSuccess: boolean;
  fileSizeBytes: number | null;
  error?: string;
}

function logBrowserEvents(page: Page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('@@INFO[lowbit-q]') ||
      text.includes('generate done') ||
      text.includes('error') ||
      text.includes('Error') ||
      text.includes('model loaded')
    ) {
      console.log(`[browser] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => console.log(`[PAGE_ERROR] ${err.message}`));
}

async function clickButton(page: Page, text: string, timeout = 60_000) {
  const button = page.locator('button', { hasText: text });
  await expect(button).toBeEnabled({ timeout });
  await button.click();
}

function getStepCard(page: Page, stepLabel: string) {
  return page
    .locator('div.rounded-xl.border.p-4')
    .filter({ has: page.locator('.font-medium', { hasText: stepLabel }) });
}

async function waitForStepStatus(page: Page, stepLabel: string, timeout: number) {
  const card = getStepCard(page, stepLabel);
  await expect(async () => {
    const text = await card.locator('.uppercase.tracking-wide').textContent();
    expect(text?.toLowerCase()).toMatch(/pass|fail/);
  }).toPass({ timeout, intervals: [3_000] });
  const status = (await card.locator('.uppercase.tracking-wide').textContent()) ?? '';
  const detail = (await card.locator('.opacity-80').count()) > 0
    ? ((await card.locator('.opacity-80').textContent()) ?? '')
    : '';
  return { status: status.toLowerCase().trim(), detail };
}

function detectCollapse(output: string): boolean {
  if (output.length === 0) return false;
  const words = output.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
  return Math.max(...Object.values(freq)) / words.length > 0.4;
}

const RESULTS_FILE = path.join(__dirname, 'phase4-gemma4-results.json');
const allResults: VariantResult[] = [];

test.describe.serial('Phase 4: Gemma 4 E2B Native Quant Baseline', () => {
  let sharedContext: BrowserContext;
  let sharedPage: Page;

  test.beforeAll(async ({ persistentContext, persistentPage }) => {
    sharedContext = persistentContext;
    sharedPage = persistentPage;
    logBrowserEvents(sharedPage);
  });

  test.afterAll(async () => {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
    console.log('\n========== Phase 4: Gemma 4 E2B Results ==========');
    console.log('| Model | fileSize | Load | TokGen | Func |');
    console.log('|-------|---------|------|--------|------|');
    for (const r of allResults) {
      if (!r.available) {
        console.log(`| ${r.label} | (skipped — GGUF not found) | — | — | — |`);
        continue;
      }
      const sizeStr = r.fileSizeBytes != null ? `${(r.fileSizeBytes / 1024 / 1024).toFixed(0)} MB` : '?';
      console.log(`| ${r.label} | ${sizeStr} | ${r.loadSuccess ? 'YES' : 'NO'} | ${r.tokenGenSuccess ? 'YES' : 'NO'} | ${r.functionalSuccess ? 'YES ✅' : 'NO'} |`);
    }
    console.log(`\nResults saved to: ${RESULTS_FILE}`);
    await sharedContext.close();
  });

  for (const variant of MODEL_VARIANTS) {
    test(`Gemma4 ${variant.label}: load and smoke test`, async () => {
      test.setTimeout(IMPORT_TIMEOUT + CONVERT_TIMEOUT + INFERENCE_TIMEOUT);

      const result: VariantResult = {
        label: variant.label,
        quantType: variant.quantType,
        ggufPath: variant.ggufPath,
        available: false,
        conversionSuccess: false,
        loadSuccess: false,
        smokeTests: [],
        tokenGenSuccess: false,
        functionalSuccess: false,
        fileSizeBytes: null,
      };

      if (!fs.existsSync(variant.ggufPath)) {
        console.log(`  SKIP: ${variant.ggufPath} not found`);
        allResults.push(result);
        test.skip(true, `GGUF not found: ${variant.ggufPath}`);
        return;
      }

      result.available = true;
      result.fileSizeBytes = fs.statSync(variant.ggufPath).size;

      const page = sharedPage;
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
      await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

      // Step 1: Import
      console.log(`\n--- Gemma4 ${variant.label}: Importing ---`);
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 30_000 }),
        clickButton(page, 'ローカルGGUFを読込'),
      ]);
      await fileChooser.setFiles(variant.ggufPath);
      const importResult = await waitForStepStatus(page, '元GGUFダウンロード', IMPORT_TIMEOUT);
      expect(importResult.status).toBe('pass');

      // Step 2: Select NATIVE-DIRECT
      const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
      await presetSelect.selectOption('v2-native-direct');
      await page.waitForTimeout(300);

      // Step 3: Convert (PASSTHROUGH)
      await clickButton(page, 'lowbit-Q変換', 30_000);
      const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', CONVERT_TIMEOUT);
      result.conversionSuccess = convertResult.status === 'pass';
      if (!result.conversionSuccess) {
        result.error = `Conversion failed: ${convertResult.detail}`;
        allResults.push(result);
        return;
      }
      await waitForStepStatus(page, 'OPFS保存', 60_000);

      // Step 4+5: Load + smoke tests
      await page.locator('input[type="number"][min="8"]').fill(String(MAX_TOKENS));
      const promptSelect = page.locator('select').filter({
        has: page.locator('option', { hasText: 'Greeting' }),
      });

      let firstInference = true;
      for (const prompt of SMOKE_PROMPTS) {
        await promptSelect.selectOption({ value: prompt.id }).catch(() => undefined);
        await page.waitForTimeout(300);
        await clickButton(page, 'lowbit-Qを実行', 30_000);
        const runResult = await waitForStepStatus(page, 'lowbit-Q load/generate', INFERENCE_TIMEOUT);

        if (runResult.status === 'pass' && firstInference) {
          result.loadSuccess = true;
          firstInference = false;
        }

        const outputPre = page.locator('.text-slate-600:has-text("lowbit-Q")').locator('..').locator('pre');
        const output = (await outputPre.textContent().catch(() => '')) ?? '';

        result.smokeTests.push({
          promptId: prompt.id,
          output: output.slice(0, 500),
          matchedExpected: prompt.expectPattern.test(output),
          collapsed: detectCollapse(output),
        });
      }

      result.tokenGenSuccess = result.smokeTests.some((s) => s.output.length > 5);
      result.functionalSuccess = result.smokeTests.some((s) => s.matchedExpected && !s.collapsed);
      allResults.push(result);
    });
  }
});
