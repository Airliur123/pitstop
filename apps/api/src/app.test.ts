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
  });
});
