import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:5175',
    headless: false,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        '--enable-features=SharedArrayBuffer',
        '--enable-experimental-web-platform-features',
        '--unlimited-storage',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
