import { describe, expect, it } from 'vitest';

import {
  buildFastifyTrustProxy,
  parseAdminEnvironment,
  parseApiEnvironment,
  parseCorsOrigins,
  parseTrustedProxyCidrs,
  parseWebEnvironment,
  parseWorkerEnvironment,
  resolveTrustedProxyConfiguration,
} from './index';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  API_PORT: '3002',
  DATABASE_URL: 'mysql://pitstop:local@localhost:3306/pitstop',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'pitstop-test',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-secret',
  S3_FORCE_PATH_STYLE: 'true',
  MAIL_HOST: 'localhost',
  MAIL_PORT: '1025',
  MAIL_SECURE: 'false',
  MAIL_FROM_ADDRESS: 'noreply@pitstop.local',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  LOG_LEVEL: 'silent',
  API_SWAGGER_ENABLED: 'true',
};

const validProductionApiEnvironment: NodeJS.ProcessEnv = {
  ...validEnvironment,
  ADMIN_BASE_URL: 'https://admin.pitstop.example',
  API_BASE_URL: 'https://api.pitstop.example',
  API_SWAGGER_ENABLED: 'false',
  AUTH_COOKIE_SECURE: 'true',
  AUTH_SESSION_SECRET: 'production-session-secret-0123456789',
  AUTH_TOKEN_SECRET: 'production-auth-token-secret-0123456789',
  CORS_ALLOWED_ORIGINS: 'https://pitstop.example,https://admin.pitstop.example',
  LOG_LEVEL: 'info',
  MAIL_HOST: 'smtp.example',
  NODE_ENV: 'production',
  PUBLIC_CURSOR_SIGNING_SECRET: 'production-cursor-signing-secret-0123456789',
  WEB_BASE_URL: 'https://pitstop.example',
};

describe('API environment parser', () => {
  it('accepts and coerces a complete valid environment', () => {
    const parsed = parseApiEnvironment(validEnvironment);

    expect(parsed.API_PORT).toBe(3002);
    expect(parsed.S3_FORCE_PATH_STYLE).toBe(true);
    expect(parsed.PUBLIC_RATE_LIMIT_MAX).toBe(60);
    expect(parsed.CACHE_CATEGORIES_TTL_SECONDS).toBe(300);
    expect(parsed.AUTH_MAGIC_LINK_TTL_SECONDS).toBe(900);
    expect(parsed.AUTH_SESSION_TTL_SECONDS).toBe(2_592_000);
    expect(parsed.HEALTH_DEPENDENCY_TIMEOUT_MS).toBe(1_000);
    expect(parsed.METRICS_ENABLED).toBe(false);
    expect(parsed.RELEASE_VERSION).toBe('development');
    expect(parsed.TRUST_PROXY_CIDRS).toEqual([]);
    expect(parsed.WORKER_HEARTBEAT_TTL_SECONDS).toBe(30);
  });

  it('rejects invalid ports and missing secrets with clear paths', () => {
    const invalid = { ...validEnvironment, API_PORT: '70000', S3_SECRET_KEY: undefined };

    expect(() => parseApiEnvironment(invalid)).toThrow(/API_PORT/);
    expect(() => parseApiEnvironment(invalid)).toThrow(/S3_SECRET_KEY/);
  });

  it('rejects dangerous production logging configuration', () => {
    expect(() =>
      parseApiEnvironment({ ...validEnvironment, NODE_ENV: 'production', LOG_LEVEL: 'silent' }),
    ).toThrow(/LOG_LEVEL/);
  });

  it('requires a sufficiently long cursor signing secret in production', () => {
    expect(() =>
      parseApiEnvironment({ ...validEnvironment, NODE_ENV: 'production', LOG_LEVEL: 'info' }),
    ).toThrow(/PUBLIC_CURSOR_SIGNING_SECRET/);
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PUBLIC_CURSOR_SIGNING_SECRET: 'too-short',
      }),
    ).toThrow(/PUBLIC_CURSOR_SIGNING_SECRET/);
    expect(parseApiEnvironment(validProductionApiEnvironment).PUBLIC_CURSOR_SIGNING_SECRET).toBe(
      'production-cursor-signing-secret-0123456789',
    );
  });

  it('fails closed for unsafe production authentication configuration', () => {
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PUBLIC_CURSOR_SIGNING_SECRET: 'production-cursor-signing-secret-0123456789',
      }),
    ).toThrow(/AUTH_TOKEN_SECRET/);
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PUBLIC_CURSOR_SIGNING_SECRET: 'production-cursor-signing-secret-0123456789',
        AUTH_TOKEN_SECRET: 'production-auth-token-secret-0123456789',
        AUTH_SESSION_SECRET: 'production-session-secret-0123456789',
        AUTH_COOKIE_SECURE: 'false',
        WEB_BASE_URL: 'https://pitstop.example',
        MAIL_HOST: 'smtp.example',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('requires strict canonical production URLs and matching exact CORS origins', () => {
    expect(() =>
      parseApiEnvironment({
        ...validProductionApiEnvironment,
        API_BASE_URL: 'http://api.pitstop.example',
      }),
    ).toThrow(/Production API base URL must use HTTPS/);
    expect(() =>
      parseApiEnvironment({
        ...validProductionApiEnvironment,
        WEB_BASE_URL: 'https://driver:secret@pitstop.example',
      }),
    ).toThrow(/credentials/);
    expect(() =>
      parseApiEnvironment({
        ...validProductionApiEnvironment,
        CORS_ALLOWED_ORIGINS: 'https://pitstop.example/path,https://admin.pitstop.example',
      }),
    ).toThrow(/exact origin/);
    expect(() =>
      parseApiEnvironment({
        ...validProductionApiEnvironment,
        CORS_ALLOWED_ORIGINS: 'https://pitstop.example',
      }),
    ).toThrow(/ADMIN_BASE_URL/);
    expect(() =>
      parseApiEnvironment({
        ...validProductionApiEnvironment,
        API_SWAGGER_ENABLED: 'true',
      }),
    ).toThrow(/API_SWAGGER_ENABLED/);
  });

  it('uses an explicit trusted proxy CIDR list and rejects an unbounded boolean', () => {
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        TRUST_PROXY: 'true',
      }),
    ).toThrow(/TRUST_PROXY_CIDRS/);

    const parsed = parseApiEnvironment({
      ...validEnvironment,
      TRUST_PROXY: 'true',
      TRUST_PROXY_CIDRS: '10.20.0.0/16,2001:db8::/32,192.0.2.10',
    });
    expect(resolveTrustedProxyConfiguration(parsed)).toEqual([
      '10.20.0.0/16',
      '2001:db8::/32',
      '192.0.2.10',
    ]);
    expect(resolveTrustedProxyConfiguration(parseApiEnvironment(validEnvironment))).toBe(false);
    expect(() => parseTrustedProxyCidrs('10.0.0.0/99')).toThrow(/Invalid trusted proxy/);
  });

  it('leaves spoofed forwarded chains entirely to Fastify when trust is disabled', () => {
    const spoofedForwardedFor = '203.0.113.50, 10.20.30.40';
    const parsed = parseApiEnvironment({
      ...validEnvironment,
      TRUST_PROXY: 'false',
      TRUST_PROXY_CIDRS: '10.20.0.0/16',
    });

    expect(spoofedForwardedFor).toContain('203.0.113.50');
    expect(buildFastifyTrustProxy(parsed)).toBe(false);
  });

  it('validates bounded observability configuration with metrics disabled by default', () => {
    const parsed = parseApiEnvironment({
      ...validEnvironment,
      GRACEFUL_SHUTDOWN_TIMEOUT_MS: '45000',
      HEALTH_DEPENDENCY_TIMEOUT_MS: '750',
      METRICS_ENABLED: 'true',
      RELEASE_VERSION: 'phase-11.abc123',
    });

    expect(parsed.GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBe(45_000);
    expect(parsed.HEALTH_DEPENDENCY_TIMEOUT_MS).toBe(750);
    expect(parsed.METRICS_ENABLED).toBe(true);
    expect(parsed.RELEASE_VERSION).toBe('phase-11.abc123');
    expect(parseApiEnvironment(validEnvironment).METRICS_ENABLED).toBe(false);
  });

  it('requires integration key material only when the Google Form source is enabled', () => {
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        GOOGLE_FORM_SOURCE_ENABLED: 'true',
      }),
    ).toThrow(/GOOGLE_FORM_CURRENT_SECRET/);
    expect(
      parseApiEnvironment({
        ...validEnvironment,
        GOOGLE_FORM_CURRENT_KEY_ID: 'test-v1',
        GOOGLE_FORM_CURRENT_SECRET: 'test-google-form-key-material-0123456789',
        GOOGLE_FORM_SOURCE_ENABLED: 'true',
      }).GOOGLE_FORM_SOURCE_ENABLED,
    ).toBe(true);
  });

  it('requires complete and distinct previous rotation key configuration', () => {
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        GOOGLE_FORM_PREVIOUS_KEY_ID: 'old-v1',
      }),
    ).toThrow(/GOOGLE_FORM_PREVIOUS_SECRET/);
    expect(() =>
      parseApiEnvironment({
        ...validEnvironment,
        GOOGLE_FORM_CURRENT_KEY_ID: 'same-v1',
        GOOGLE_FORM_PREVIOUS_KEY_ID: 'same-v1',
        GOOGLE_FORM_PREVIOUS_SECRET: 'previous-google-form-key-material-01234567',
      }),
    ).toThrow(/GOOGLE_FORM_PREVIOUS_KEY_ID/);
  });
});

describe('worker environment parser', () => {
  it('uses deterministic offline geocoding outside production', () => {
    const parsed = parseWorkerEnvironment({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      REDIS_URL: validEnvironment.REDIS_URL,
    });
    expect(parsed.GEOCODING_PROVIDER).toBe('deterministic');
    expect(parsed.WORKER_RECONCILE_INTERVAL_MS).toBe(5000);
    expect(parsed.WORKER_STAGE_LEASE_SECONDS).toBe(300);
    expect(parsed.WORKER_HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(parsed.WORKER_HEARTBEAT_TTL_SECONDS).toBe(30);
  });

  it('rejects deterministic geocoding in production', () => {
    expect(() =>
      parseWorkerEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        GEOCODING_PROVIDER: 'deterministic',
        LOG_LEVEL: 'info',
        NODE_ENV: 'production',
        REDIS_URL: validEnvironment.REDIS_URL,
      }),
    ).toThrow(/GEOCODING_PROVIDER/);
  });

  it('requires a heartbeat TTL that tolerates two missed intervals', () => {
    expect(() =>
      parseWorkerEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        LOG_LEVEL: 'silent',
        NODE_ENV: 'test',
        REDIS_URL: validEnvironment.REDIS_URL,
        WORKER_HEARTBEAT_INTERVAL_MS: '10000',
        WORKER_HEARTBEAT_TTL_SECONDS: '10',
      }),
    ).toThrow(/WORKER_HEARTBEAT_TTL_SECONDS/);
  });
});

describe('web environment parser', () => {
  const webEnvironment: NodeJS.ProcessEnv = {
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3002/api/v1',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'false',
    NODE_ENV: 'development',
    WEB_PORT: '3000',
  };

  it('keeps the location preview disabled by default', () => {
    const parsed = parseWebEnvironment(webEnvironment);
    expect(parsed.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED).toBe(false);
    expect(parsed.NEXT_PUBLIC_PWA_ENABLED).toBe(false);
    expect(parsed.NEXT_PUBLIC_PWA_TEST_MODE).toBe(false);
    expect(parsed.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED).toBe(false);
    expect(parsed.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT).toBe('/api/observability/client');
    expect(parseCorsOrigins(parsed.NEXT_PUBLIC_MAP_TILE_ORIGINS)).toEqual([
      'https://a.tile.openstreetmap.org',
      'https://b.tile.openstreetmap.org',
      'https://c.tile.openstreetmap.org',
    ]);
  });

  it('requires a complete preview fixture when enabled', () => {
    expect(() =>
      parseWebEnvironment({
        ...webEnvironment,
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'true',
      }),
    ).toThrow(/NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED/);
  });

  it('rejects preview fixtures and localhost API URLs in production', () => {
    expect(() =>
      parseWebEnvironment({
        ...webEnvironment,
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'true',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: 'Data Simulasi',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: '-6.1',
        NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: '106.8',
        NODE_ENV: 'production',
      }),
    ).toThrow(/Guest preview location must be disabled in production/);
    expect(() => parseWebEnvironment({ ...webEnvironment, NODE_ENV: 'production' })).toThrow(
      /Production API base URL cannot use localhost/,
    );
  });

  it('enables development service workers only through controlled PWA test mode', () => {
    expect(() =>
      parseWebEnvironment({
        ...webEnvironment,
        NEXT_PUBLIC_PWA_ENABLED: 'true',
      }),
    ).toThrow(/PWA test mode/);

    expect(
      parseWebEnvironment({
        ...webEnvironment,
        NEXT_PUBLIC_PWA_ENABLED: 'true',
        NEXT_PUBLIC_PWA_TEST_MODE: 'true',
      }).NEXT_PUBLIC_PWA_ENABLED,
    ).toBe(true);
  });

  it('accepts strict production web, API, map, and local telemetry configuration', () => {
    const parsed = parseWebEnvironment({
      NEXT_PUBLIC_API_BASE_URL: 'https://api.pitstop.example/api/v1',
      NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED: 'true',
      NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT: '/api/observability/client',
      NEXT_PUBLIC_MAP_TILE_ORIGINS:
        'https://a.tile.openstreetmap.org,https://b.tile.openstreetmap.org',
      NEXT_PUBLIC_PWA_ENABLED: 'true',
      NODE_ENV: 'production',
      WEB_BASE_URL: 'https://pitstop.example',
      WEB_PORT: '3000',
    });

    expect(parsed.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED).toBe(true);
    expect(parsed.NEXT_PUBLIC_PWA_ENABLED).toBe(true);
    expect(() =>
      parseWebEnvironment({
        ...webEnvironment,
        NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT: 'https://telemetry.example/collect',
      }),
    ).toThrow(/same-origin path/);
  });
});

describe('admin environment parser', () => {
  it('accepts separately hosted admin and API origins', () => {
    const parsed = parseAdminEnvironment({
      ADMIN_BASE_URL: 'https://admin.example.test',
      ADMIN_PORT: '3001',
      NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
      NODE_ENV: 'production',
    });

    expect(parsed.ADMIN_BASE_URL).toBe('https://admin.example.test');
    expect(parsed.NEXT_PUBLIC_API_BASE_URL).toBe('https://api.example.test/api/v1');
  });

  it('rejects localhost admin and API URLs in production', () => {
    expect(() =>
      parseAdminEnvironment({
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_PORT: '3001',
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3002/api/v1',
        NODE_ENV: 'production',
      }),
    ).toThrow(/Production API base URL cannot use localhost/);
    expect(() =>
      parseAdminEnvironment({
        ADMIN_BASE_URL: 'http://localhost:3001',
        ADMIN_PORT: '3001',
        NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
        NODE_ENV: 'production',
      }),
    ).toThrow(/Production admin base URL cannot use localhost/);
  });
});
