/**
 * Phase 3: lowbit-Q v2 allocator comparison test.
 *
 * Runs 3 allocator presets (DEFAULT / AGGRESSIVE / CONSERVATIVE) against
 * TinyLlama-1.1B-Chat-v1.0.Q8_0.gguf and records:
 *   - Conversion: original size, converted size, compression ratio
 *   - Allocation breakdown: SVID_1BIT / Q4_0 / passthrough counts
 *   - Quality: NMSE mean / max (SVID tensors only)
 *   - Load: success / fail
 *   - Inference smoke test: 3 prompts, output quality assessment
 *
 * Prerequisites:
 *   TinyLlama Q8_0 at /tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf
 *
 * Run:
 *   npx playwright test tests/lowbit-q-phase3-comparison.spec.ts --headed
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const GGUF_PATH = '/tmp/tinyllama-1.1b-chat-v1.0.Q8_0.gguf';
const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';
const CONVERSION_TIMEOUT = 15 * 60_000;
const INFERENCE_TIMEOUT = 10 * 60_000;
const MAX_TOKENS = 150;

// ---------------------------------------------------------------------------
// Smoke test prompts
// ---------------------------------------------------------------------------

const SMOKE_PROMPTS = [
  {
    id: 'tiny-reasoning',
    label: 'Reasoning',
    prompt: 'Q: りんごが3個あり、2個もらいました。合計はいくつですか？ A:',
    expectPattern: /[0-9５]/,  // Should contain a number
  },
  {
    id: 'short-qa-en',
    label: 'Short QA',
    prompt: 'What is the capital of France? Answer in one word.',
    expectPattern: /paris/i,
  },
  {
    id: 'list-generation',
    label: 'List',
    prompt: '日本の四季の名前を箇条書きで4つ挙げてください。',
    expectPattern: /春|夏|秋|冬/,
  },
];

// ---------------------------------------------------------------------------
// Allocator presets
// ---------------------------------------------------------------------------

const ALLOCATOR_PRESETS = [
  {
    value: 'v2-default',
    label: 'DEFAULT',
    description: 'attnQK=Q4_0, attnVO+FFN=SVID_1BIT',
    budgetPct: 27,
  },
  {
    value: 'v2-aggressive',
    label: 'AGGRESSIVE',
    description: 'all=SVID_1BIT except first/last layers',
    budgetPct: 20,
  },
  {
    value: 'v2-conservative',
    label: 'CONSERVATIVE',
    description: 'attn=Q4_0, FFN=SVID_1BIT',
    budgetPct: 38,
  },
  {
    value: 'v2-q4only',
    label: 'Q4_0-ONLY',
    description: 'all weights Q4_0 — native quant baseline (no SVID)',
    budgetPct: 53,
  },
  {
    value: 'v2-q3konly',
    label: 'Q3_K-ONLY',
    description: 'all weights Q3_K — native K-quant 3-bit baseline',
    budgetPct: 40,
  },
  {
    value: 'v2-q2konly',
    label: 'Q2_K-ONLY',
    description: 'all weights Q2_K — native K-quant 2-bit baseline',
    budgetPct: 31,
  },
] as const;

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
  }).toPass({ timeout, intervals: [3_000] });

  const status = (await card.locator('.uppercase.tracking-wide').textContent()) ?? '';
  const detailEl = card.locator('.opacity-80');
  const detail = (await detailEl.count()) > 0 ? ((await detailEl.textContent()) ?? '') : '';
  return { status: status.toLowerCase().trim(), detail };
}

interface ConversionMetrics {
  originalBytes: number;
  convertedBytes: number;
  compressionRatio: number;
  svidCount: number;
  q4_0Count: number;
  q3_kCount: number;
  q2_kCount: number;
  passthroughCount: number;
  totalAllocCount: number;
  nmseMean: number | null;
  nmseMax: number | null;
  loadSuccess: boolean;
}

interface SmokTestResult {
  promptId: string;
  label: string;
  output: string;
  charCount: number;
  matchedExpected: boolean;
  collapsed: boolean;
}

interface PresetResult {
  preset: string;
  label: string;
  description: string;
  conversionSuccess: boolean;
  metrics: ConversionMetrics | null;
  smokeTests: SmokTestResult[];
  /** true = at least one smoke test returned non-empty output (token generation worked).
   *  Does NOT indicate quality or semantic coherence — all outputs may still be collapsed. */
  tokenGenSuccess: boolean;
  /** true = at least one prompt matched the expected pattern AND was not collapsed.
   *  This indicates actual functional inference, not just token emission. */
  functionalSuccess: boolean;
  error?: string;
}

function detectCollapse(output: string): boolean {
  if (output.length === 0) return false;
  // Check for repetitive patterns (same short sequence repeating)
  const words = output.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;

  // Check top-5 word frequency
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] ?? 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(freq));
  const dominanceRatio = maxFreq / words.length;
  return dominanceRatio > 0.4; // One word dominates >40% → collapse
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

let sharedContext: BrowserContext;
let sharedPage: Page;

test.describe.serial('Phase 3: Allocator Comparison', () => {
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    sharedPage = await sharedContext.newPage();
    logBrowserEvents(sharedPage);
  });

  test.afterAll(async () => {
    await sharedContext.close();
  });

  // =========================================================================
  // Step 0: Import source model (once, shared across all preset tests)
  // =========================================================================
  test('Step 0: Import TinyLlama Q8_0', async () => {
    test.setTimeout(5 * 60_000);
    const page = sharedPage;

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

    // Check allocator preset selector is present
    const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
    await expect(presetSelect).toBeVisible();
    console.log('[Phase3] Allocator preset selector found');

    // Import the local GGUF
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickButton(page, 'ローカルGGUFを読込'),
    ]);
    await fileChooser.setFiles(GGUF_PATH);

    const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 120_000);
    console.log(`[Phase3] Import: ${importResult.status} — ${importResult.detail}`);
    expect(importResult.status).toBe('pass');
  });

  // =========================================================================
  // Preset comparison loop
  // =========================================================================
  const results: PresetResult[] = [];

  for (const preset of ALLOCATOR_PRESETS) {
    test(`Preset: ${preset.label}`, async () => {
      test.setTimeout(CONVERSION_TIMEOUT + INFERENCE_TIMEOUT * SMOKE_PROMPTS.length + 60_000);
      const page = sharedPage;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[Phase3] Running preset: ${preset.label} (${preset.description})`);
      console.log(`${'='.repeat(60)}`);

      const presetResult: PresetResult = {
        preset: preset.value,
        label: preset.label,
        description: preset.description,
        conversionSuccess: false,
        metrics: null,
        smokeTests: [],
        tokenGenSuccess: false,
        functionalSuccess: false,
      };

      try {
        // ---------------------------------------------------------------
        // Navigate to a fresh state
        // ---------------------------------------------------------------
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
        await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

        // ---------------------------------------------------------------
        // Select allocator preset
        // ---------------------------------------------------------------
        const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
        await presetSelect.selectOption(preset.value);
        console.log(`[Phase3] Selected preset: ${preset.value}`);
        await page.waitForTimeout(300);

        // ---------------------------------------------------------------
        // Convert
        // ---------------------------------------------------------------
        console.log(`[Phase3] Starting conversion...`);
        await clickButton(page, 'lowbit-Q変換');

        const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', CONVERSION_TIMEOUT);
        console.log(`[Phase3] Conversion: ${convertResult.status} — ${convertResult.detail}`);

        if (convertResult.status !== 'pass') {
          presetResult.error = `conversion failed: ${convertResult.detail}`;
          results.push(presetResult);
          return;
        }
        presetResult.conversionSuccess = true;

        // Wait for OPFS save
        const opfsResult = await waitForStepStatus(page, 'OPFS保存', 60_000);
        console.log(`[Phase3] OPFS: ${opfsResult.status} — ${opfsResult.detail}`);

        // Parse size info from conversion detail
        // Detail format: "1.1 GB -> 234.5 MB (preset: v2-default)"
        let originalBytes = 1_170_781_568; // known TinyLlama Q8_0 size
        let convertedBytes = 0;
        const sizeMatch = convertResult.detail.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)\s*->\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/);
        if (sizeMatch) {
          const parseBytes = (val: string, unit: string): number => {
            const n = parseFloat(val);
            const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
            return Math.round(n * (multipliers[unit] ?? 1));
          };
          originalBytes = parseBytes(sizeMatch[1], sizeMatch[2]);
          convertedBytes = parseBytes(sizeMatch[3], sizeMatch[4]);
        }

        // ---------------------------------------------------------------
        // Read metadata from GGUF metadata panel
        // ---------------------------------------------------------------
        const metadataResult = await waitForStepStatus(page, 'lowbit-Q metadata 検出', 60_000);
        console.log(`[Phase3] Metadata: ${metadataResult.status} — ${metadataResult.detail}`);

        // Extract v2 alloc breakdown from the evidence panel
        let svidCount = 0;
        let q4_0Count = 0;
        let q3_kCount = 0;
        let q2_kCount = 0;
        let passthroughCount = 0;
        let totalAllocCount = 0;
        let nmseMean: number | null = null;
        let nmseMax: number | null = null;

        // Read from the metadata JSON pre element
        const metadataPre = page.locator('h2:has-text("metadata")').locator('..').locator('pre');
        const metadataJson = await metadataPre.textContent().catch(() => '');
        if (metadataJson && metadataJson !== '(not inspected yet)') {
          try {
            const meta = JSON.parse(metadataJson);
            if (meta.v2) {
              svidCount = meta.v2.svidCount ?? 0;
              q4_0Count = meta.v2.q4_0Count ?? 0;
              q3_kCount = meta.v2.q3_kCount ?? 0;
              q2_kCount = meta.v2.q2_kCount ?? 0;
              passthroughCount = meta.v2.passthroughCount ?? 0;
              totalAllocCount = meta.v2.totalCount ?? 0;
              nmseMean = meta.v2.nmseMean ?? null;
              nmseMax = meta.v2.nmseMax ?? null;
            }
          } catch {
            // JSON parse failed — read from tensor metrics if available
          }
        }

        // Fallback: read from tensor metrics section
        if (totalAllocCount === 0) {
          const tensorMetricsEl = page.locator('h2:has-text("テンソル変換メトリクス")').locator('..');
          const avgNMSEEl = tensorMetricsEl.locator('.text-slate-500:has-text("Avg NMSE")').locator('..').locator('.font-medium');
          const maxNMSEEl = tensorMetricsEl.locator('.text-slate-500:has-text("Max NMSE")').locator('..').locator('.font-medium');
          const nmseAvgText = await avgNMSEEl.textContent().catch(() => null);
          const nmseMaxText = await maxNMSEEl.textContent().catch(() => null);
          if (nmseAvgText && nmseAvgText !== '-') nmseMean = parseFloat(nmseAvgText);
          if (nmseMaxText && nmseMaxText !== '-') nmseMax = parseFloat(nmseMaxText.split(' ')[0]);
        }

        const compressionRatio = originalBytes > 0 ? convertedBytes / originalBytes : 0;

        presetResult.metrics = {
          originalBytes,
          convertedBytes,
          compressionRatio,
          svidCount,
          q4_0Count,
          q3_kCount,
          q2_kCount,
          passthroughCount,
          totalAllocCount,
          nmseMean,
          nmseMax,
          loadSuccess: false,
        };

        console.log(`[Phase3] Size: ${(originalBytes / 1e6).toFixed(0)} MB → ${(convertedBytes / 1e6).toFixed(0)} MB (${(compressionRatio * 100).toFixed(1)}%)`);
        console.log(`[Phase3] Alloc: SVID=${svidCount} Q4_0=${q4_0Count} Q3_K=${q3_kCount} Q2_K=${q2_kCount} pass=${passthroughCount} total=${totalAllocCount}`);
        if (nmseMean !== null) console.log(`[Phase3] NMSE mean=${nmseMean.toFixed(4)} max=${nmseMax?.toFixed(4) ?? '-'}`);

        // ---------------------------------------------------------------
        // Inference smoke tests
        // ---------------------------------------------------------------
        await page.locator('input[type="number"][min="8"]').fill(String(MAX_TOKENS));

        const promptSelect = page.locator('select').filter({
          has: page.locator('option', { hasText: 'Greeting' }),
        });

        let firstInference = true;
        for (const smokePrompt of SMOKE_PROMPTS) {
          console.log(`\n[Phase3] Smoke test: ${smokePrompt.label}`);

          await promptSelect.selectOption({ value: smokePrompt.id }).catch(() => undefined);
          await page.waitForTimeout(300);

          try {
            await clickButton(page, 'lowbit-Qを実行', 30_000);
            const runResult = await waitForStepStatus(page, 'lowbit-Q load/generate', INFERENCE_TIMEOUT);
            console.log(`[Phase3]   run: ${runResult.status} — ${runResult.detail}`);

            if (runResult.status === 'pass' && firstInference) {
              presetResult.metrics!.loadSuccess = true;
              firstInference = false;
            }

            // Read output
            const outputPre = page.locator('.text-slate-600:has-text("lowbit-Q")').locator('..').locator('pre');
            const output = await outputPre.textContent().catch(() => '');
            const charCount = output?.length ?? 0;
            const matchedExpected = smokePrompt.expectPattern.test(output ?? '');
            const collapsed = detectCollapse(output ?? '');

            console.log(`[Phase3]   output (${charCount} chars): ${(output ?? '').slice(0, 120).replace(/\n/g, '↵')}`);
            console.log(`[Phase3]   expected pattern match: ${matchedExpected}, collapsed: ${collapsed}`);

            presetResult.smokeTests.push({
              promptId: smokePrompt.id,
              label: smokePrompt.label,
              output: (output ?? '').slice(0, 500),
              charCount,
              matchedExpected,
              collapsed,
            });
          } catch (err) {
            console.log(`[Phase3]   ERROR: ${(err as Error).message}`);
            presetResult.smokeTests.push({
              promptId: smokePrompt.id,
              label: smokePrompt.label,
              output: '',
              charCount: 0,
              matchedExpected: false,
              collapsed: false,
            });
          }
        }

        // tokenGenSuccess = true means tokens were emitted; quality is assessed per-prompt via matchedExpected/collapsed
        presetResult.tokenGenSuccess = presetResult.smokeTests.some((r) => r.charCount > 0);
        // functionalSuccess = true means at least one prompt matched expected pattern AND was not collapsed
        presetResult.functionalSuccess = presetResult.smokeTests.some(
          (r) => r.matchedExpected && !r.collapsed,
        );

      } catch (err) {
        presetResult.error = (err as Error).message;
        console.log(`[Phase3] ERROR for preset ${preset.label}: ${presetResult.error}`);
      }

      results.push(presetResult);

      // Screenshot for this preset
      await sharedPage.screenshot({
        path: `tests/phase3-${preset.value}-result.png`,
        fullPage: true,
      });
    });
  }

  // =========================================================================
  // Summary + report writing
  // =========================================================================
  test('Phase3: Summary + report', async () => {
    test.setTimeout(60_000);

    console.log('\n' + '='.repeat(70));
    console.log('PHASE 3 COMPARISON SUMMARY');
    console.log('='.repeat(84));

    // Table header
    // TokGen = any output produced (pipeline alive); Func = expected pattern matched + no collapse
    console.log(
      'Preset'.padEnd(14) +
      'ConvSize'.padStart(10) +
      'Ratio%'.padStart(8) +
      'SVID'.padStart(6) +
      'Q4_0'.padStart(6) +
      'Q3_K'.padStart(6) +
      'Q2_K'.padStart(6) +
      'Pass'.padStart(6) +
      'NMSE-m'.padStart(8) +
      'NMSE-M'.padStart(8) +
      'Load'.padStart(6) +
      'TokGen'.padStart(8) +
      'Func'.padStart(6),
    );
    console.log('-'.repeat(96));

    for (const r of results) {
      const m = r.metrics;
      console.log(
        r.label.padEnd(14) +
        (m ? `${(m.convertedBytes / 1e6).toFixed(0)} MB`.padStart(10) : 'N/A'.padStart(10)) +
        (m ? `${(m.compressionRatio * 100).toFixed(1)}%`.padStart(8) : '-'.padStart(8)) +
        (m ? String(m.svidCount).padStart(6) : '-'.padStart(6)) +
        (m ? String(m.q4_0Count).padStart(6) : '-'.padStart(6)) +
        (m ? String(m.q3_kCount).padStart(6) : '-'.padStart(6)) +
        (m ? String(m.q2_kCount).padStart(6) : '-'.padStart(6)) +
        (m ? String(m.passthroughCount).padStart(6) : '-'.padStart(6)) +
        (m?.nmseMean !== null && m?.nmseMean !== undefined ? m.nmseMean.toFixed(4).padStart(8) : '-'.padStart(8)) +
        (m?.nmseMax !== null && m?.nmseMax !== undefined ? m.nmseMax.toFixed(4).padStart(8) : '-'.padStart(8)) +
        (m?.loadSuccess ? 'YES'.padStart(6) : 'NO'.padStart(6)) +
        (r.tokenGenSuccess ? 'YES'.padStart(8) : 'NO'.padStart(8)) +
        (r.functionalSuccess ? 'YES'.padStart(6) : 'NO'.padStart(6)),
      );
    }

    console.log('='.repeat(96));

    // Smoke test output table
    for (const r of results) {
      if (r.smokeTests.length === 0) continue;
      console.log(`\n--- ${r.label} smoke tests ---`);
      for (const st of r.smokeTests) {
        console.log(
          `  ${st.label.padEnd(12)} chars=${String(st.charCount).padStart(4)}  match=${st.matchedExpected ? 'YES' : 'NO'}  collapse=${st.collapsed ? 'YES' : 'no'}`,
        );
        if (st.output) {
          console.log(`    "${st.output.slice(0, 100).replace(/\n/g, '↵')}"`);
        }
      }
    }

    // Save JSON report
    const reportJson = {
      date: new Date().toISOString(),
      model: 'TinyLlama-1.1B-Chat-v1.0.Q8_0',
      originalSizeMB: 1117,
      maxTokens: MAX_TOKENS,
      presets: results,
    };

    const jsonPath = path.join(path.resolve('tests'), 'phase3-comparison-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2));
    console.log(`\n[Phase3] Results saved to: ${jsonPath}`);

    // Assertions: at least one preset should succeed
    const anyConversionSuccess = results.some((r) => r.conversionSuccess);
    expect(anyConversionSuccess).toBe(true);
  });
});
