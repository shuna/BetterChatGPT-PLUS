/**
 * Verify Firefox CPU fallback logic (runtime.ts isFirefoxRuntime branch).
 *
 * Checks:
 *  1. Firefox userAgent is detected in-page.
 *  2. With allowWebGPU=false + preferMemory64=true, the variant table picks
 *     a CPU variant (mt-cpu-mem64 or st-cpu-mem64), never a webgpu variant.
 *
 * Prereq: vite dev server on $BASE_URL (default http://localhost:5174/)
 *         Firefox app at /Applications/Firefox.app
 */
import { firefox } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174/';
const FIREFOX_EXE = '/Applications/Firefox.app/Contents/MacOS/firefox';
const USER_DATA_DIR = resolve('.playwright-firefox-profile');

mkdirSync(USER_DATA_DIR, { recursive: true });

let ctx;
try {
  ctx = await firefox.launchPersistentContext(USER_DATA_DIR, {
    channel: 'moz-firefox',
    headless: false,
    executablePath: FIREFOX_EXE,
  });
} catch (e) {
  console.log(`[fallback] channel failed (${e.message}); retrying without channel`);
  ctx = await firefox.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    executablePath: FIREFOX_EXE,
  });
}
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text().slice(0,400)}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const ua = navigator.userAgent;
    const isFirefox = /Firefox\//.test(ua);

    const mod = await import('/src/vendor/wllama/variant-table.ts');
    const { selectVariant } = mod;

    // Simulate caps a Firefox user would have after runtime.ts forces allowWebGPU=false
    // and when browser supports memory64 + multi-thread (Firefox 134+).
    const caps = { jspi: false, mt: true, memory64: true, webgpu: false, exnref: false };
    const sel = selectVariant(caps, { preferMemory64: true });

    // Also verify preferMemory64=false path still picks cpu-compat.
    const selNoMem64 = selectVariant({ ...caps, memory64: false }, { preferMemory64: false });

    return {
      ua,
      isFirefox,
      chosen: sel.chosen?.id ?? null,
      chosenGlue: sel.chosen?.glue ?? null,
      chosenNoMem64: selNoMem64.chosen?.id ?? null,
    };
  });

  console.log('[result]', JSON.stringify(result, null, 2));

  const checks = [
    ['userAgent contains Firefox', result.isFirefox === true],
    ['chosen is CPU (not webgpu)', result.chosen != null && !result.chosen.includes('webgpu')],
    ['chosen uses mem64 glue when preferMemory64=true', result.chosenGlue === 'cpu-mem64'],
    ['chosen is cpu-compat when memory64 unavailable', result.chosenNoMem64 === 'mt-cpu-compat'],
  ];

  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
} finally {
  await ctx.close();
}
