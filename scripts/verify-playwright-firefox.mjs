import { firefox } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const userDataDir = resolve('.playwright-firefox-profile');
mkdirSync(userDataDir, { recursive: true });

const executablePath = '/Applications/Firefox.app/Contents/MacOS/firefox';

async function tryLaunch(opts, label) {
  console.log(`[try] ${label}`);
  const ctx = await firefox.launchPersistentContext(userDataDir, opts);
  const page = await ctx.newPage();
  await page.goto('https://example.com/');
  const title = await page.title();
  await page.screenshot({ path: 'firefox-verify.png' });
  console.log(`[ok] ${label} title="${title}"`);
  await ctx.close();
}

try {
  await tryLaunch(
    { channel: 'moz-firefox', headless: false, executablePath },
    "channel: 'moz-firefox'"
  );
} catch (e) {
  console.log(`[fallback] channel failed: ${e.message}`);
  await tryLaunch(
    { headless: false, executablePath },
    'executablePath only'
  );
}
