import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 15_000 },
  testDir: '../../tests/e2e',
  outputDir: '../../test-results',
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  timeout: 60_000,
  webServer: [
    {
      command: 'pnpm --filter @pitstop/api start',
      env: {
        API_PORT: '3102',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_REQUEST_EMAIL_MAX: '20',
        AUTH_REQUEST_GLOBAL_MAX: '1000',
        AUTH_REQUEST_IP_MAX: '100',
        AUTH_SESSION_SECRET: 'e2e-auth-session-secret-01234567890123456789',
        AUTH_TOKEN_SECRET: 'e2e-auth-token-secret-0123456789012345678901',
        AUTH_VERIFY_GLOBAL_MAX: '1000',
        AUTH_VERIFY_IP_MAX: '200',
        CORS_ALLOWED_ORIGINS:
          'http://localhost:3100,http://localhost:3101,http://127.0.0.1:3100,http://127.0.0.1:3101',
        MAIL_FROM_ADDRESS: 'noreply@pitstop.test',
        MAIL_HOST: '127.0.0.1',
        MAIL_PORT: '1025',
        PUBLIC_RATE_LIMIT_MAX: '1000',
        RECOMMENDATION_RATE_LIMIT_MAX: '1000',
        WEB_BASE_URL: 'http://localhost:3100',
        ADMIN_BASE_URL: 'http://localhost:3101',
        ADMIN_READ_RATE_LIMIT_MAX: '1000',
        ADMIN_MUTATION_RATE_LIMIT_MAX: '1000',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3102/health/live',
    },
    {
      command: 'pnpm --filter @pitstop/web exec next dev --port 3100',
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3102/api/v1',
        NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'false',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: 'Kalideres, Jakarta Barat',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: '-6.138',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: '106.703',
        NEXT_PUBLIC_MAP_TILES_DISABLED: 'true',
        PITSTOP_E2E: 'true',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3100',
    },
    {
      command: 'pnpm --filter @pitstop/admin exec next dev --port 3101',
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3102/api/v1',
        NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true',
        PITSTOP_E2E: 'true',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3101',
    },
  ],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core/,
      name: 'mobile-320',
      use: { viewport: { height: 568, width: 320 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core/,
      name: 'mobile-360',
      use: { viewport: { height: 800, width: 360 } },
    },
    {
      grepInvert: /@admin-core/,
      name: 'mobile-390',
      use: { viewport: { height: 844, width: 390 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core/,
      name: 'mobile-430',
      use: { viewport: { height: 932, width: 430 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core/,
      name: 'tablet-768',
      use: { viewport: { height: 1024, width: 768 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core/,
      name: 'desktop-1280',
      use: { viewport: { height: 800, width: 1280 } },
    },
    {
      grep: /@admin-core/,
      name: 'admin-desktop-1280',
      use: { viewport: { height: 800, width: 1280 } },
    },
  ],
});
