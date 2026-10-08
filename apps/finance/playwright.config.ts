import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.test.ts', fullyParallel: false, workers: 1,
  timeout: 30000, retries: 0, reporter: [['list']],
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 960 }, trace: 'retain-on-failure' },
});
