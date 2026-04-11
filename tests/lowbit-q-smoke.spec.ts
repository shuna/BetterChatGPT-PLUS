/**
 * lowbit-Q smoke test — quick verification of WASM + conversion + load.
 *
 * Uses ErrorCapture for immediate error reporting.
 * Tests: SmolLM2 (small, fast), Qwen 3.5 (non-llama arch), Gemma 4 (large, Memory64).
 *
 * Run:
 *   npx playwright test tests/lowbit-q-smoke.spec.ts --headed
 */

import { test, expect } from './helpers/persistent-chrome';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ErrorCapture, waitForStepStatus, clickButton, detectCollapse } from './helpers/error-capture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5175/?lowbit-q-validation=1';

interface ModelSpec {
  name: string;
  ggufPath: string;
  expectedArch: string;
  /** Expected to pass load? false for known-broken cases */
  expectLoad: boolean;
}

const MODELS: ModelSpec[] = [
  {
    name: 'SmolLM2-1.7B Q4_K_M',
    ggufPath: '/tmp/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    expectedArch: 'llama',
    expectLoad: true,
  },
  {
    name: 'Qwen 3.5 2B Q4_K_M',
    ggufPath: '/tmp/Qwen3.5-2B-Q4_K_M.gguf',
    expectedArch: 'qwen35',
    expectLoad: true,
  },
  {
    name: 'Gemma 4 E2B Q4_K_M',
    ggufPath: '/tmp/gemma-4-E2B-it-Q4_K_M.gguf',
    expectedArch: 'gemma4',
    expectLoad: true,  // Now expecting success with Memory64
  },
];

// Single smoke prompt for quick validation
const SMOKE_PROMPT = { id: 'tiny-reasoning', expectPattern: /[0-9５]/ };

interface TestResult {
  model: string;
  available: boolean;
  fileSizeMB: number | null;
  importSuccess: boolean;
  conversionSuccess: boolean;
  loadSuccess: boolean;
  inferenceOutput: string;
  functionalSuccess: boolean;
  errors: string[];
}

const RESULTS_FILE = path.join(__dirname, 'lowbit-q-smoke-results.json');

test.describe.serial('lowbit-Q Smoke Test (Memory64 WASM)', () => {
  let sharedContext: BrowserContext;
  let sharedPage: Page;
  let capture: ErrorCapture;
  const allResults: TestResult[] = [];

  test.beforeAll(async ({ persistentContext, persistentPage }) => {
    sharedContext = persistentContext;
    sharedPage = persistentPage;
    capture = new ErrorCapture(sharedPage);
    capture.install();
  });

  test.afterAll(async () => {
    capture.dispose();
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
    console.log('\n========== Smoke Test Results ==========');
    console.log('| Model | Size | Import | Convert | Load | Func |');
    console.log('|-------|------|--------|---------|------|------|');
    for (const r of allResults) {
      if (!r.available) {
        console.log(`| ${r.model} | (not found) | - | - | - | - |`);
        continue;
      }
      console.log(
        `| ${r.model} | ${r.fileSizeMB?.toFixed(0) ?? '?'} MB` +
        ` | ${r.importSuccess ? 'YES' : 'NO'}` +
        ` | ${r.conversionSuccess ? 'YES' : 'NO'}` +
        ` | ${r.loadSuccess ? 'YES' : 'NO'}` +
        ` | ${r.functionalSuccess ? 'YES' : 'NO'} |`,
      );
      if (r.errors.length > 0) {
        console.log(`  Errors: ${r.errors.join('; ')}`);
      }
    }
    console.log(`\nResults saved to: ${RESULTS_FILE}`);
    await sharedContext.close();
  });

  for (const model of MODELS) {
    test(`${model.name}: import → convert → load → infer`, async () => {
      test.setTimeout(30 * 60_000);

      const result: TestResult = {
        model: model.name,
        available: false,
        fileSizeMB: null,
        importSuccess: false,
        conversionSuccess: false,
        loadSuccess: false,
        inferenceOutput: '',
        functionalSuccess: false,
        errors: [],
      };

      // Check GGUF availability
      if (!fs.existsSync(model.ggufPath)) {
        console.log(`  SKIP: ${model.ggufPath} not found`);
        allResults.push(result);
        test.skip(true, `GGUF not found: ${model.ggufPath}`);
        return;
      }

      result.available = true;
      result.fileSizeMB = fs.statSync(model.ggufPath).size / (1024 * 1024);
      console.log(`\n--- ${model.name} (${result.fileSizeMB.toFixed(0)} MB) ---`);

      // Clear previous error context
      capture.clear();

      const page = sharedPage;
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
      await expect(page.locator('text=wllama lowbit-Q 品質診断UI')).toBeVisible();

      // Clear OPFS and check quota before importing large files
      const storageInfo = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const names: string[] = [];
        // @ts-ignore — entries() is available in Chrome
        for await (const [name] of root.entries()) {
          names.push(name);
          await root.removeEntry(name, { recursive: true });
        }
        const est = await navigator.storage.estimate();
        return {
          cleared: names,
          quotaMB: Math.round((est.quota ?? 0) / 1024 / 1024),
          usageMB: Math.round((est.usage ?? 0) / 1024 / 1024),
        };
      });
      console.log(`[${model.name}] OPFS cleared: ${storageInfo.cleared.length} entries (${storageInfo.cleared.join(', ') || 'none'})`);
      console.log(`[${model.name}] Storage: quota=${storageInfo.quotaMB} MB, usage=${storageInfo.usageMB} MB, available=${storageInfo.quotaMB - storageInfo.usageMB} MB`);

      // --- Step 1: Import ---
      //
      // Large-file handling is browser-launch dependent. Ephemeral Playwright
      // Chromium builds may fail around ~2 GB, while persistent system Chrome
      // can import larger GGUFs successfully. By default we now attempt the
      // full E2E path and only fall back to header-parse mode when explicitly
      // requested for constrained environments.
      const OPFS_PER_FILE_LIMIT = 2 * 1024 * 1024 * 1024;
      const fileSizeBytes = result.fileSizeMB! * 1024 * 1024;
      const isLargeFile = fileSizeBytes > OPFS_PER_FILE_LIMIT;
      const forceHeaderParseOnly = process.env.PLAYWRIGHT_HEADER_PARSE_ONLY === '1';

      if (isLargeFile && forceHeaderParseOnly) {
        // ---------------------------------------------------------------
        // LARGE FILE PATH: GGUF header parse test only
        // ---------------------------------------------------------------
        console.log(`[${model.name}] File > 2 GB — OPFS per-file limit prevents full E2E.`);
        console.log(`[${model.name}] Running GGUF header parse validation...`);

        const http = await import('http');
        const servePort = 9876;
        const server = http.createServer((req, res) => {
          // Serve first 16 MB for header parsing (Gemma 4 has ~500 tensors → large header)
          const HEADER_SIZE = 16 * 1024 * 1024;
          const stat = fs.statSync(model.ggufPath);
          const end = Math.min(stat.size, HEADER_SIZE);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': end,
            'Access-Control-Allow-Origin': '*',
          });
          fs.createReadStream(model.ggufPath, { start: 0, end: end - 1 }).pipe(res);
        });
        await new Promise<void>((resolve) => server.listen(servePort, resolve));

        const parseResult = await page.evaluate(async ({ fetchUrl }) => {
          try {
            const response = await fetch(fetchUrl);
            const buffer = await response.arrayBuffer();
            const { parseGGUFHeader } = await import('/src/local-llm/lowbit-q/ggufParser.ts');
            const header = parseGGUFHeader(buffer);

            const arch = header.metadata.get('general.architecture') ?? 'unknown';
            const tensorCount = header.tensors.length;
            const tensorTypes = new Set<number>();
            for (const t of header.tensors) tensorTypes.add(t.type);
            const hasBF16 = tensorTypes.has(30); // GGMLType.BF16

            return {
              success: true,
              arch: String(arch),
              tensorCount,
              tensorTypes: Array.from(tensorTypes).sort((a, b) => a - b),
              hasBF16,
              dataOffset: Number(header.dataOffset),
            };
          } catch (e: any) {
            return { success: false, error: e.message ?? String(e) };
          }
        }, { fetchUrl: `http://localhost:${servePort}/header` });

        server.close();

        if (parseResult.success) {
          console.log(`[${model.name}] GGUF Parse OK: arch=${parseResult.arch}, tensors=${parseResult.tensorCount}, types=${JSON.stringify(parseResult.tensorTypes)}, BF16=${parseResult.hasBF16}`);
          result.importSuccess = true;
          result.errors.push('Header-parse-only mode: conversion/load/infer skipped');
        } else {
          console.log(`[${model.name}] GGUF Parse FAILED: ${parseResult.error}`);
          result.errors.push(`Parse failed: ${(parseResult as { error: string }).error}`);
        }

        allResults.push(result);
        return;
      }

      // ---------------------------------------------------------------
      // NORMAL PATH: full E2E pipeline
      // ---------------------------------------------------------------
      console.log(`[${model.name}] Importing (setFiles)...`);
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 30_000 }),
          clickButton(page, 'ローカルGGUFを読込'),
        ]);
        await fileChooser.setFiles(model.ggufPath);
        const importResult = await waitForStepStatus(page, '元GGUFダウンロード', 10 * 60_000, capture);
        result.importSuccess = importResult.status === 'pass';
        console.log(`[${model.name}] Import: ${importResult.status} — ${importResult.detail}`);
      } catch (err) {
        result.errors.push(`Import failed: ${(err as Error).message.slice(0, 200)}`);
        console.log(`[${model.name}] Import FAILED: ${(err as Error).message.slice(0, 200)}`);
        allResults.push(result);
        return;
      }

      if (!result.importSuccess) {
        result.errors.push('Import status was not PASS');
        allResults.push(result);
        return;
      }

      // --- Step 2: Select NATIVE-DIRECT (PASSTHROUGH) preset ---
      const presetSelect = page.locator('[data-testid="allocator-preset-select"]');
      await presetSelect.selectOption('v2-native-direct');
      await page.waitForTimeout(300);

      // --- Step 3: Convert ---
      const preConvertStorage = await page.evaluate(async () => {
        const est = await navigator.storage.estimate();
        return {
          quotaMB: Math.round((est.quota ?? 0) / 1024 / 1024),
          usageMB: Math.round((est.usage ?? 0) / 1024 / 1024),
        };
      });
      console.log(`[${model.name}] Pre-convert storage: usage=${preConvertStorage.usageMB} MB / quota=${preConvertStorage.quotaMB} MB`);

      console.log(`[${model.name}] Converting (PASSTHROUGH)...`);
      try {
        await clickButton(page, 'lowbit-Q変換', 30_000);
        const convertResult = await waitForStepStatus(page, 'lowbit-Q変換', 10 * 60_000, capture);
        result.conversionSuccess = convertResult.status === 'pass';
        console.log(`[${model.name}] Convert: ${convertResult.status} — ${convertResult.detail}`);

        if (result.conversionSuccess) {
          await waitForStepStatus(page, 'OPFS保存', 60_000, capture);
        }
      } catch (err) {
        result.errors.push(`Convert failed: ${(err as Error).message.slice(0, 200)}`);
        console.log(`[${model.name}] Convert FAILED`);
        allResults.push(result);
        return;
      }

      if (!result.conversionSuccess) {
        result.errors.push('Conversion status was not PASS');
        allResults.push(result);
        return;
      }

      // --- Step 4: Load + Infer ---
      console.log(`[${model.name}] Loading and inferring...`);
      try {
        await page.locator('input[type="number"][min="8"]').fill('50');
        const promptSelect = page.locator('select').filter({
          has: page.locator('option', { hasText: 'Greeting' }),
        });
        await promptSelect.selectOption({ value: SMOKE_PROMPT.id }).catch(() => undefined);
        await page.waitForTimeout(300);

        await clickButton(page, 'lowbit-Qを実行', 30_000);
        const runResult = await waitForStepStatus(page, 'lowbit-Q load/generate', 5 * 60_000, capture);
        result.loadSuccess = runResult.status === 'pass';
        console.log(`[${model.name}] Run: ${runResult.status} — ${runResult.detail}`);

        if (result.loadSuccess) {
          const outputPre = page.locator('.text-slate-600:has-text("lowbit-Q")').locator('..').locator('pre');
          const output = (await outputPre.textContent().catch(() => '')) ?? '';
          result.inferenceOutput = output.slice(0, 500);
          result.functionalSuccess = SMOKE_PROMPT.expectPattern.test(output) && !detectCollapse(output);
          console.log(`[${model.name}] Output (${output.length} chars): ${output.slice(0, 120)}`);
          console.log(`[${model.name}] Functional: ${result.functionalSuccess}`);
        }
      } catch (err) {
        result.errors.push(`Load/Infer failed: ${(err as Error).message.slice(0, 200)}`);
        console.log(`[${model.name}] Load/Infer FAILED`);
      }

      // Capture any remaining errors
      const capturedErrors = capture.getErrors();
      if (capturedErrors.length > 0) {
        for (const e of capturedErrors.slice(-5)) {
          if (!result.errors.some((existing) => existing.includes(e.message.slice(0, 50)))) {
            result.errors.push(`[${e.type}] ${e.message.slice(0, 200)}`);
          }
        }
      }

      allResults.push(result);
    });
  }
});
