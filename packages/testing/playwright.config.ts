import { defineConfig } from '@playwright/test';

const nativeTemporaryDirectoryEnvironment =
  process.platform === 'linux' &&
  [process.env.TMPDIR, process.env.TMP, process.env.TEMP].some((value) =>
    value?.startsWith('/mnt/'),
  )
    ? { TEMP: '/tmp', TMP: '/tmp', TMPDIR: '/tmp' }
    : {};

export default defineConfig({
  expect: { timeout: 15_000 },
  testDir: '../../tests/e2e',
  outputDir: '../../test-results',
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  timeout: 60_000,
  workers: 1,
  webServer: [
    {
      command: 'node --import tsx src/main.ts',
      cwd: '../../apps/api',
      env: {
        ...nativeTemporaryDirectoryEnvironment,
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
        GOOGLE_FORM_BODY_LIMIT_BYTES: '131072',
        GOOGLE_FORM_CURRENT_KEY_ID: 'e2e-v1',
        GOOGLE_FORM_CURRENT_SECRET: 'e2e-google-form-secret-material-0123456789',
        GOOGLE_FORM_RATE_LIMIT_MAX: '1000',
        GOOGLE_FORM_REPLAY_WINDOW_SECONDS: '300',
        GOOGLE_FORM_SOURCE_ENABLED: 'true',
        GOOGLE_FORM_SOURCE_ID: 'google-form-main',
      },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 35_000 },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3102/health/live',
    },
    {
      command: 'pnpm --filter @pitstop/web exec next dev --webpack --port 3100',
      env: {
        ...nativeTemporaryDirectoryEnvironment,
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3102/api/v1',
        NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'false',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: 'Kalideres, Jakarta Barat',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: '-6.138',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: '106.703',
        NEXT_PUBLIC_MAP_TILES_DISABLED: 'true',
        NEXT_PUBLIC_PWA_ENABLED: 'true',
        NEXT_PUBLIC_PWA_TEST_MODE: 'true',
        PITSTOP_E2E: 'true',
        PWA_TEST_MODE: 'true',
        WEB_BASE_URL: 'http://localhost:3100',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3100',
    },
    {
      command: 'pnpm --filter @pitstop/admin exec next dev --port 3101',
      env: {
        ...nativeTemporaryDirectoryEnvironment,
        ADMIN_BASE_URL: 'http://localhost:3101',
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3102/api/v1',
        NEXT_PUBLIC_ENABLE_UI_CATALOG: 'true',
        PITSTOP_E2E: 'true',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3101',
    },
    ...(process.env.PITSTOP_PWA_ONLY === 'true'
      ? []
      : [
          {
            command: 'node --import tsx src/main.ts',
            cwd: '../../apps/worker',
            env: {
              ...nativeTemporaryDirectoryEnvironment,
              DUPLICATE_RADIUS_METERS: '250',
              GEOCODING_CONFIDENCE_THRESHOLD: '0.7',
              GEOCODING_HTTP_TIMEOUT_MS: '30000',
              GEOCODING_PROVIDER: 'deterministic',
              WORKER_RECONCILE_INTERVAL_MS: '1000',
            },
            gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 35_000 },
            name: 'integration-worker',
            reuseExistingServer: false,
            stdout: 'pipe' as const,
            timeout: 120_000,
            wait: { stdout: /"status":"READY"/ },
          },
        ]),
  ],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core|@pwa-core/,
      name: 'mobile-320',
      use: { viewport: { height: 568, width: 320 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core|@pwa-core/,
      name: 'mobile-360',
      use: { viewport: { height: 800, width: 360 } },
    },
    {
      grepInvert: /@admin-core|@pwa-core/,
      name: 'mobile-390',
      use: { viewport: { height: 844, width: 390 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core|@pwa-core/,
      name: 'mobile-430',
      use: { viewport: { height: 932, width: 430 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core|@pwa-core/,
      name: 'tablet-768',
      use: { viewport: { height: 1024, width: 768 } },
    },
    {
      grepInvert: /@guest-core|@auth-core|@contribution-core|@admin-core|@pwa-core/,
      name: 'desktop-1280',
      use: { viewport: { height: 800, width: 1280 } },
    },
    {
      grep: /@admin-core/,
      grepInvert: /@pwa-core/,
      name: 'admin-desktop-1280',
      use: { viewport: { height: 800, width: 1280 } },
    },
    {
      grep: /@pwa-core/,
      name: 'pwa-chromium',
      use: {
        browserName: 'chromium',
        serviceWorkers: 'allow',
        viewport: { height: 844, width: 390 },
      },
    },
  ],
});
