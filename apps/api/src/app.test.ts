import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from './bootstrap';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';

const testEnvironment = {
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
  METRICS_ENABLED: 'false',
} as const;

describe('API foundation', () => {
  let app: NestFastifyApplication | undefined;

  function getApplication(): NestFastifyApplication {
    if (!app) throw new Error('API test application has not been bootstrapped');
    return app;
  }

  beforeAll(async () => {
    Object.assign(process.env, testEnvironment);
    app = await createApiApplication();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the exact live health response', async () => {
    const response = await request(getApplication().getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', service: 'pitstop-api' });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
    expect(response.headers['x-correlation-id']).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('injects the readiness health service', () => {
    const controller = getApplication().get(HealthController);

    expect(Reflect.get(controller, 'healthService')).toBeInstanceOf(HealthService);
  });

  it('returns a consistent error envelope with a request ID', async () => {
    const response = await request(getApplication().getHttpServer())
      .get('/api/v1/not-a-route')
      .set('x-request-id', 'phase-zero-request')
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_404' },
      requestId: 'phase-zero-request',
    });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('validates and returns a bounded correlation ID independently of the request ID', async () => {
    const valid = await request(getApplication().getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'browser-trace_11')
      .set('x-request-id', 'request:legacy-11')
      .expect(200);
    expect(valid.headers['x-correlation-id']).toBe('browser-trace_11');
    expect(valid.headers['x-request-id']).toBe('request:legacy-11');

    const invalid = await request(getApplication().getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'x'.repeat(65))
      .expect(200);
    expect(invalid.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(invalid.headers['x-correlation-id']).not.toBe('x'.repeat(65));
  });

  it('rejects arbitrary browser origins instead of merely omitting CORS headers', async () => {
    const response = await request(getApplication().getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://attacker.example')
      .expect(403);

    expect(response.body).toMatchObject({
      code: 'CORS_ORIGIN_INVALID',
      status: 403,
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('allows configured origins and never reflects a forwarded host into Problem Details', async () => {
    const response = await request(getApplication().getHttpServer())
      .get('/api/v1/not-a-route')
      .set('Host', 'api.internal.test')
      .set('Origin', 'http://localhost:3000')
      .set('X-Forwarded-Host', 'attacker.example')
      .set('X-Forwarded-Proto', 'https')
      .expect(404);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-expose-headers']).toContain('X-Correlation-Id');
    expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
    expect(response.body.instance).toBe('/api/v1/not-a-route');
    expect(JSON.stringify(response.body)).not.toContain('attacker.example');
  });

  it('keeps metrics disabled and protected from unauthenticated callers', async () => {
    const response = await request(getApplication().getHttpServer())
      .get('/api/v1/admin/metrics')
      .expect(401);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });
});
