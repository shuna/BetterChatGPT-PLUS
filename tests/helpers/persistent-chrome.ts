import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type PersistentFixtures = {
  persistentContext: BrowserContext;
  persistentPage: Page;
};

const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function resolveChromeExecutable(): string {
  const configured = process.env.PLAYWRIGHT_CHROME_EXECUTABLE?.trim();
  if (configured) return configured;
  if (fs.existsSync(DEFAULT_CHROME_PATH)) return DEFAULT_CHROME_PATH;
  return chromium.executablePath();
}

function sanitizeSegment(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export const test = base.extend<PersistentFixtures>({
  persistentContext: [async ({}, use, testInfo) => {
    const userDataDir = path.join(
      os.tmpdir(),
      'weavelet-playwright-persistent',
      sanitizeSegment(testInfo.project.name),
      `worker-${testInfo.workerIndex}`,
    );
    fs.rmSync(userDataDir, { recursive: true, force: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: resolveChromeExecutable(),
      headless: process.env.PLAYWRIGHT_HEADLESS === '1',
      viewport: { width: 1440, height: 900 },
      args: [
        '--enable-features=SharedArrayBuffer',
        '--enable-experimental-web-platform-features',
        '--unlimited-storage',
        '--enable-unsafe-webgpu',
      ],
    });

    await use(context);
    await context.close();
  }, { scope: 'worker' }],

  persistentPage: [async ({ persistentContext }, use) => {
    const page = persistentContext.pages()[0] ?? await persistentContext.newPage();
    await use(page);
  }, { scope: 'worker' }],
});

export { expect };
