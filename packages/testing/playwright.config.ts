import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../tests/e2e',
  outputDir: '../../test-results',
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  webServer: [
    {
      command: 'pnpm --filter @pitstop/api start',
      env: {
        CORS_ALLOWED_ORIGINS:
          'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001',
        PUBLIC_RATE_LIMIT_MAX: '1000',
        RECOMMENDATION_RATE_LIMIT_MAX: '1000',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3002/health/live',
    },
    {
      command: 'pnpm --filter @pitstop/web dev',
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3002/api/v1',
        NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'false',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: 'Kalideres, Jakarta Barat',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: '-6.138',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: '106.703',
        NEXT_PUBLIC_MAP_TILES_DISABLED: 'true',
      },
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
    {
      grepInvert: /@guest-core/,
      name: 'mobile-320',
      use: { viewport: { height: 568, width: 320 } },
    },
    {
      grepInvert: /@guest-core/,
      name: 'mobile-360',
      use: { viewport: { height: 800, width: 360 } },
    },
    { name: 'mobile-390', use: { viewport: { height: 844, width: 390 } } },
    {
      grepInvert: /@guest-core/,
      name: 'mobile-430',
      use: { viewport: { height: 932, width: 430 } },
    },
    {
      grepInvert: /@guest-core/,
      name: 'tablet-768',
      use: { viewport: { height: 1024, width: 768 } },
    },
    {
      grepInvert: /@guest-core/,
      name: 'desktop-1280',
      use: { viewport: { height: 800, width: 1280 } },
    },
  ],
});
