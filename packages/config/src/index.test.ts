import { describe, expect, it } from 'vitest';

import { parseApiEnvironment } from './index';

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
      }).PUBLIC_CURSOR_SIGNING_SECRET,
    ).toBe('production-cursor-signing-secret-0123456789');
  });
});
