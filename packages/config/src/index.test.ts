import { describe, expect, it } from 'vitest';

import { parseAdminEnvironment, parseApiEnvironment, parseWebEnvironment } from './index';

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

describe('API environment parser', () => {
  it('accepts and coerces a complete valid environment', () => {
    const parsed = parseApiEnvironment(validEnvironment);

    expect(parsed.API_PORT).toBe(3002);
    expect(parsed.S3_FORCE_PATH_STYLE).toBe(true);
    expect(parsed.PUBLIC_RATE_LIMIT_MAX).toBe(60);
    expect(parsed.CACHE_CATEGORIES_TTL_SECONDS).toBe(300);
    expect(parsed.AUTH_MAGIC_LINK_TTL_SECONDS).toBe(900);
    expect(parsed.AUTH_SESSION_TTL_SECONDS).toBe(2_592_000);
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
    expect(
      parseApiEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PUBLIC_CURSOR_SIGNING_SECRET: 'production-cursor-signing-secret-0123456789',
        AUTH_TOKEN_SECRET: 'production-auth-token-secret-0123456789',
        AUTH_SESSION_SECRET: 'production-session-secret-0123456789',
        AUTH_COOKIE_SECURE: 'true',
        WEB_BASE_URL: 'https://pitstop.example',
        ADMIN_BASE_URL: 'https://admin.pitstop.example',
        MAIL_HOST: 'smtp.example',
      }).PUBLIC_CURSOR_SIGNING_SECRET,
    ).toBe('production-cursor-signing-secret-0123456789');
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
});

describe('web environment parser', () => {
  const webEnvironment: NodeJS.ProcessEnv = {
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3002/api/v1',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'false',
    NODE_ENV: 'development',
    WEB_PORT: '3000',
  };

  it('keeps the location preview disabled by default', () => {
    expect(parseWebEnvironment(webEnvironment).NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED).toBe(
      false,
    );
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
});

describe('admin environment parser', () => {
  it('rejects a localhost API URL in production', () => {
    expect(() =>
      parseAdminEnvironment({
        ADMIN_PORT: '3001',
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3002/api/v1',
        NODE_ENV: 'production',
      }),
    ).toThrow(/Production API base URL cannot use localhost/);
  });
});
