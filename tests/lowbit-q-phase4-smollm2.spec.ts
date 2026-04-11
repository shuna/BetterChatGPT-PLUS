/**
 * Phase 4: SmolLM2-1.7B-Instruct native quant baseline E2E tests.
 *
 * Tests native quantization quality on SmolLM2-1.7B-Instruct using
 * pre-quantized GGUFs from Unsloth/bartowski (no self-conversion).
 *
 * Model: SmolLM2-1.7B-Instruct (architecture: llama)
 *   - Primary evaluation target for Phase 4
 *   - Uses SVID dispatch (C++ patched), so SVID research track also applies
 *
 * UI: LowbitQValidationPage.tsx (existing comparison page)
 *   - Button "ローカルGGUFを読込" → file chooser
 *   - Step card "元GGUFダウンロード" → import status
 *   - [data-testid="allocator-preset-select"] → "v2-native-direct"
 *   - Button "lowbit-Q変換" → PASSTHROUGH conversion
 *   - Step card "lowbit-Q変換" + "OPFS保存" → conversion status
 *   - Prompt select (has option "Greeting") → select smoke prompt by ID
 *   - Button "lowbit-Qを実行" → load + inference
 *   - Step card "lowbit-Q load/generate" → load+inference status
 *   - Output: locator('.text-slate-600:has-text("lowbit-Q")')..locator('pre')
 *
 * GGUF prerequisites (download from HuggingFace before running):
 *   Q8_0: /tmp/smollm2-1.7b-instruct.Q8_0.gguf
 *   Q4_0: /tmp/smollm2-1.7b-instruct.Q4_0.gguf  (or symlink Q4_K_M)
 *   Q3_K: /tmp/smollm2-1.7b-instruct.Q3_K_S.gguf
 *   Q2_K: /tmp/smollm2-1.7b-instruct.Q2_K.gguf
 *
 * Download example (from Unsloth):
 *   huggingface-cli download unsloth/SmolLM2-1.7B-Instruct-GGUF \
 *     SmolLM2-1.7B-Instruct-Q8_0.gguf \
 *     --local-dir /tmp/
 *
 * Test strategy:
 *   - Import pre-quantized GGUF using "NATIVE-DIRECT" preset (PASSTHROUGH: no re-quantization)
 *   - Run 3 smoke prompts to assess functional quality
 *   - Compare functionalSuccess across Q8_0 / Q4_0 / Q3_K / Q2_K
 *
 * Run:
 *   npx playwright test tests/lowbit-q-phase4-smollm2.spec.ts --headed
 */

import { test, expect } from './helpers/persistent-chrome';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';
const IMPORT_TIMEOUT = 10 * 60_000;   // 10 min: SmolLM2 Q8_0 is ~1.8 GB
const CONVERT_TIMEOUT = 15 * 60_000;  // 15 min: PASSTHROUGH = file copy (fast for 1.7B)
const LOAD_TIMEOUT = 5 * 60_000;
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
    ggufPath: '/tmp/smollm2-1.7b-instruct.Q8_0.gguf',
    quantType: 'Q8_0',
  },
  {
    label: 'Q4_0',
    ggufPath: '/tmp/smollm2-1.7b-instruct.Q4_0.gguf',
    quantType: 'Q4_0',
  },
  {
    label: 'Q3_K',
    ggufPath: '/tmp/smollm2-1.7b-instruct.Q3_K_S.gguf',
    quantType: 'Q3_K_S',
  },
  {
    label: 'Q2_K',
    ggufPath: '/tmp/smollm2-1.7b-instruct.Q2_K.gguf',
    quantType: 'Q2_K',
  },
];

// Smoke prompts mapped to validation page fixed prompt IDs
const SMOKE_PROMPTS = [
  {
    id: 'short-qa-en',
    label: 'Short QA',
    expectPattern: /paris/i,
  },
  {
    id: 'list-generation',
    label: 'List',
    expectPattern: /春|夏|秋|冬/,
  },
  {
    id: 'tiny-reasoning',
    label: 'Reasoning',
    expectPattern: /[0-9５]/,
  },
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logBrowserEvents(page: Page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('@@INFO[lowbit-q]') ||
      text.includes('generate done') ||
      text.includes('error') ||
      text.includes('Error') ||
      text.includes('model loaded') ||
      text.includes('detected lowbit-Q') ||
      text.includes('PASS') ||
      text.includes('FAIL')
    ) {
      console.log(`[browser] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[PAGE_ERROR] ${err.message}`);
  });
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
    const statusEl = card.locator('.uppercase.tracking-wide');
    const text = await statusEl.textContent();
    expect(text?.toLowerCase()).toMatch(/pass|fail/);
  }).toPass({ timeout, intervals: [3_000] });
  const status = (await card.locator('.uppercase.tracking-wide').textContent()) ?? '';
  const detailEl = card.locator('.opacity-80');
  const detail = (await detailEl.count()) > 0 ? ((await detailEl.textContent()) ?? '') : '';
  return { status: status.toLowerCase().trim(), detail };
}

function detectCollapse(output: string): boolean {
  if (output.length === 0) return false;
  const words = output.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] ?? 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq / words.length > 0.4;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

const RESULTS_FILE = path.join(__dirname, 'phase4-smollm2-results.json');
const allResults: VariantResult[] = [];

test.describe.serial('Phase 4: SmolLM2-1.7B Native Quant Baseline', () => {
  let sharedContext: BrowserContext;
  let sharedPage: Page;

  test.beforeAll(async ({ persistentContext, persistentPage }) => {
    sharedContext = persistentContext;
    sharedPage = persistentPage;
    logBrowserEvents(sharedPage);
  });

  test.afterAll(async () => {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
    console.log('\n========== Phase 4: SmolLM2-1.7B Results ==========');
    console.log('| Model | fileSize | Load | TokGen | Func |');
    console.log('|-------|---------|------|--------|------|');
    for (const r of allResults) {
      if (!r.available) {
        console.log(`| ${r.label} | (skipped — GGUF not found at ${r.ggufPath}) | — | — | — |`);
        continue;
      }
      const sizeStr = r.fileSizeBytes != null ? `${(r.fileSizeBytes / 1024 / 1024).toFixed(0)} MB` : '?';
      console.log(`| ${r.label} | ${sizeStr} | ${r.loadSuccess ? 'YES' : 'NO'} | ${r.tokenGenSuccess ? 'YES' : 'NO'} | ${r.functionalSuccess ? 'YES ✅' : 'NO'} |`);
    }
    console.log(`\nResults saved to: ${RESULTS_FILE}`);
    await sharedContext.close();
  });

  for (const variant of MODEL_VARIANTS) {
    test(`SmolLM2 ${variant.label}: load and smoke test`, async () => {
      test.setTimeout(IMPORT_TIMEOUT + CONVERT_TIMEOUT + LOAD_TIMEOUT + INFERENCE_TIMEOUT);

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

      // --- Step 1: Import GGUF ---
      console.log(`\n--- ${variant.label}: Importing ${variant.ggufPath} ---`);
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 30_000 }),
        clickButton(page, 'ローカルGGUFを読込'),
      ]);
      await fileChooser.setFiles(variant.ggufPath);
      const importResult = await waitForStepStatus(page, '元GGUFダウンロード', IMPORT_TIMEOUT);
      console.log(`  Import: ${importResult.status} — ${importResult.detail.slice(0, 100)}`);
      expect(importResult.status).toBe('pass');

      // --- Step 2: Select NATIVE-DIRECT preset (PASSTHROUGH: no re-quantization) ---
      const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
      await presetSelect.selectOption('v2-native-direct');
      await page.waitForTimeout(300);

      // --- Step 3: Convert (= PASSTHROUGH copy) ---
      console.log(`  Converting with NATIVE-DIRECT (PASSTHROUGH) preset...`);
      await clickButton(page, 'lowbit-Q変換', 30_000);
      const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', CONVERT_TIMEOUT);
      result.conversionSuccess = convertResult.status === 'pass';
      console.log(`  Conversion: ${convertResult.status} — ${convertResult.detail.slice(0, 100)}`);

      if (!result.conversionSuccess) {
        result.error = `Conversion failed: ${convertResult.detail}`;
        allResults.push(result);
        return;
      }

      // Wait for OPFS save and log actual file size stored in step detail
      const opfsResult = await waitForStepStatus(page, 'OPFS保存', 60_000);
      console.log(`  OPFS保存: ${opfsResult.status} — ${opfsResult.detail}`);

      // --- Step 4+5: Load model and run smoke tests ---
      await page.locator('input[type="number"][min="8"]').fill(String(MAX_TOKENS));

      const promptSelect = page.locator('select').filter({
        has: page.locator('option', { hasText: 'Greeting' }),
      });

      let firstInference = true;
      for (const prompt of SMOKE_PROMPTS) {
        console.log(`  Running smoke prompt: ${prompt.id}`);
        await promptSelect.selectOption({ value: prompt.id }).catch(() => undefined);
        await page.waitForTimeout(300);

        await clickButton(page, 'lowbit-Qを実行', 30_000);
        const runResult = await waitForStepStatus(page, 'lowbit-Q load/generate', INFERENCE_TIMEOUT);
        console.log(`    run: ${runResult.status} — ${runResult.detail}`);

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
        console.log(`    matched=${result.smokeTests.at(-1)!.matchedExpected}, collapsed=${result.smokeTests.at(-1)!.collapsed}, chars=${output.length}`);
      }

      result.tokenGenSuccess = result.smokeTests.some((s) => s.output.length > 5);
      result.functionalSuccess = result.smokeTests.some((s) => s.matchedExpected && !s.collapsed);
      allResults.push(result);
    });
  }
});
