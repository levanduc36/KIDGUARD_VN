import { defineConfig, devices } from '@playwright/test';

const testDatabase = process.env.KIDGUARD_E2E_DATABASE ??= `.artifacts/e2e-${Date.now()}.sqlite`;

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  timeout: 60_000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium', channel: 'msedge' } },
  ],
  webServer: {
    command: 'node tests/browser/server.mjs', url: 'http://127.0.0.1:4173/api/health', reuseExistingServer: false,
    env: { PORT: '4173', HOST: '127.0.0.1', APP_ORIGIN: 'http://127.0.0.1:4173', DATABASE_PATH: testDatabase, NODE_ENV: 'test' },
  },
});
