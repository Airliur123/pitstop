import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../tests/e2e',
  outputDir: '../../test-results',
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  webServer: [
    {
      command: 'pnpm --filter @pitstop/web dev',
      env: { NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true' },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3000',
    },
    {
      command: 'pnpm --filter @pitstop/admin dev',
      env: { NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true' },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3001',
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360', use: { viewport: { height: 800, width: 360 } } },
    { name: 'mobile-390', use: { viewport: { height: 844, width: 390 } } },
    { name: 'desktop-1280', use: { viewport: { height: 800, width: 1280 } } },
    { name: 'desktop-1440', use: { viewport: { height: 900, width: 1440 } } },
  ],
});
