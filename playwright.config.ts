import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'packages/core/test/browser',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  workers: 1,
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1000, height: 800 },
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vp dev --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/packages/core/test/browser/fixtures/paused-resize.html',
  },
});
