import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/artifacts',
  use: {
    baseURL: `http://localhost:${process.env.E2E_PORT || 3100}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'node scripts/e2e-server.js',
    url: `http://localhost:${process.env.E2E_PORT || 3100}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
