import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDatabaseConnectionConfig,
  createDatabasePool,
  migrateDatabase,
  seedDatabase,
} from '@pitstop/database';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from '../../src/bootstrap';
import { createCacheKey } from '../../src/common/cache/cache-key';
import { RedisService } from '../../src/common/redis/redis.service';

describe.sequential('Phase 3 public API E2E', () => {
  let app: NestFastifyApplication | undefined;
  let mysql: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;

  const getApp = (): NestFastifyApplication => {
    if (!app) throw new Error('API integration application is not initialized');
    return app;
  };

  beforeAll(async () => {
    [mysql, redis] = await Promise.all([
      new GenericContainer('mysql:8.4.10')
        .withEnvironment({
          MYSQL_DATABASE: 'pitstop_api_test',
          MYSQL_PASSWORD: 'pitstop_api_test',
          MYSQL_ROOT_PASSWORD: 'pitstop_root_test',
          MYSQL_USER: 'pitstop_api_test',
          TZ: 'UTC',
        })
        .withCommand([
          '--character-set-server=utf8mb4',
          '--collation-server=utf8mb4_0900_ai_ci',
          '--default-time-zone=+00:00',
        ])
        .withExposedPorts(3306)
        .withWaitStrategy(Wait.forLogMessage(/port: 3306.*MySQL Community Server/i))
        .withStartupTimeout(150_000)
        .start(),
      new GenericContainer('redis:8.2.7-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/i))
        .start(),
    ]);
    const databaseUrl = `mysql://pitstop_api_test:pitstop_api_test@${mysql.getHost()}:${mysql.getMappedPort(3306)}/pitstop_api_test`;
    const pool = createDatabasePool(createDatabaseConnectionConfig({ DATABASE_URL: databaseUrl }));
    try {
      await migrateDatabase(pool);
      await seedDatabase(pool);
    } finally {
      await pool.end();
    }

    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_PORT: '3002',
      API_SWAGGER_ENABLED: 'true',
      DATABASE_URL: databaseUrl,
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
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
      PUBLIC_RATE_LIMIT_MAX: '20',
      RECOMMENDATION_RATE_LIMIT_MAX: '5',
      CACHE_REDIS_TIMEOUT_MS: '500',
      PUBLIC_CURSOR_SIGNING_SECRET: 'test-public-cursor-signing-secret-0123456789',
    });
    app = await createApiApplication();
  });

  afterAll(async () => {
    await app?.close();
    await redis?.stop();
    await mysql?.stop();
  });

  it('serves categories with budget capability and security headers', async () => {
    const response = await request(getApp().getHttpServer())
      .get('/api/v1/public/categories')
      .expect(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data[0]).toMatchObject({
      code: 'MAKAN_MURAH',
      supportsBudget: true,
    });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('searches spatially with budget and returns a stable cursor page', async () => {
    const first = await request(getApp().getHttpServer())
      .get('/api/v1/public/places')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        radiusMeters: '5000',
        limit: '1',
      })
      .expect(200);
    expect(first.body.data[0]).toMatchObject({
      name: 'Warung Bu Ani',
      distanceMeters: 0,
      placeStatus: 'ACTIVE',
      verificationStatus: 'ADMIN_VERIFIED',
    });
    expect(first.body.meta.pagination.hasMore).toBe(true);

    const second = await request(getApp().getHttpServer())
      .get('/api/v1/public/places')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        radiusMeters: '5000',
        limit: '1',
        cursor: first.body.meta.pagination.nextCursor,
      })
      .expect(200);
    expect(second.body.data.map((place: { readonly name: string }) => place.name)).toEqual([
      'Warkop Bang Udin',
    ]);
  });

  it('enforces Makan Murah and Ngopi budget behavior', async () => {
    const makan = await request(getApp().getHttpServer())
      .get('/api/v1/public/places')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        category: 'MAKAN_MURAH',
        budgetAmount: '12000',
      })
      .expect(200);
    expect(makan.body.data[0]).toMatchObject({
      name: 'Warung Bu Ani',
      budgetMatch: true,
      cheapestAvailableMainItem: { priceAmount: 12_000 },
    });

    const ngopi = await request(getApp().getHttpServer())
      .get('/api/v1/public/places')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        category: 'NGOPI',
        budgetAmount: '5000',
      })
      .expect(200);
    expect(ngopi.body.data[0]).toMatchObject({
      name: 'Warkop Bang Udin',
      budgetMatch: true,
    });
  });

  it('returns detail by slug and never exposes object storage keys', async () => {
    const response = await request(getApp().getHttpServer())
      .get('/api/v1/public/places/data-simulasi-warung-bu-ani')
      .expect(200);
    expect(response.body.data).toMatchObject({
      name: 'Warung Bu Ani',
      menus: [{ name: 'Nasi telur', priceAmount: 12_000 }],
      photos: { available: false, count: 0 },
    });
    expect(response.text).not.toContain('object_key');
    expect(response.text).not.toContain('verified_by');
  });

  it('returns Problem Details for missing or ineligible detail', async () => {
    const response = await request(getApp().getHttpServer())
      .get('/api/v1/public/places/data-simulasi-nasi-uduk-ibu-rini')
      .expect(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      success: false,
      status: 404,
      code: 'PLACE_NOT_FOUND',
      requestId: expect.any(String),
    });
    expect(response.text).not.toContain('stack');
  });

  it('returns ranked recommendations and typed budget/outside fallbacks', async () => {
    const recommendation = await request(getApp().getHttpServer())
      .get('/api/v1/public/recommendations')
      .query({
        latitude: '-6.1380',
        longitude: '106.7030',
        category: 'ISTIRAHAT',
      })
      .expect(200);
    expect(recommendation.body.data.primary).toMatchObject({
      name: 'Warung Madura 24 Jam',
      budgetMatch: null,
      score: {
        total: expect.any(Number),
        distance: expect.any(Number),
      },
    });

    const budget = await request(getApp().getHttpServer())
      .get('/api/v1/public/recommendations')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        category: 'MAKAN_MURAH',
        budgetAmount: '10000',
      })
      .expect(200);
    expect(budget.body.data.primary).toBeNull();
    expect(budget.body.meta.fallback).toEqual({
      reason: 'BUDGET_TOO_LOW',
      minimumRequiredBudgetAmount: 12_000,
    });

    const outside = await request(getApp().getHttpServer())
      .get('/api/v1/public/recommendations')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        radiusMeters: '100',
        category: 'NGOPI',
        budgetAmount: '5000',
      })
      .expect(200);
    expect(outside.body.meta.fallback).toMatchObject({
      reason: 'OUTSIDE_RADIUS',
      nearestDistanceMeters: expect.any(Number),
      nearestPlace: { name: 'Warkop Bang Udin' },
    });
  });

  it('rejects malformed, extreme, duplicate, injection-like, and arbitrary inputs', async () => {
    const cases = [
      '?latitude=91&longitude=106.8',
      '?latitude=-6.1&longitude=106.8&radiusMeters=5001',
      '?latitude=-6.1&longitude=106.8&budgetAmount=1e4',
      '?latitude=-6.1&longitude=106.8&cursor=JyBPUiAxPTEgLS0',
      '?latitude=-6.1&longitude=106.8&sort=distance_meters',
      '?latitude=-6.1&latitude=-6.2&longitude=106.8',
      "?latitude=-6.1&longitude=106.8&category=MAKAN_MURAH'%20OR%201=1--",
    ];
    for (const query of cases) {
      const response = await request(getApp().getHttpServer())
        .get(`/api/v1/public/places${query}`)
        .expect(400);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.body.requestId).toEqual(expect.any(String));
    }
  });

  it('serves runtime OpenAPI matching every public route', async () => {
    const response = await request(getApp().getHttpServer()).get('/api/openapi.json').expect(200);
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/public/categories',
        '/api/v1/public/places',
        '/api/v1/public/places/{slug}',
        '/api/v1/public/recommendations',
      ]),
    );
  });

  it('caches successful reads while regenerating request metadata', async () => {
    const redisService = getApp().get(RedisService);
    await redisService.run((client) => client.flushdb());
    const key = createCacheKey('categories', { active: true });
    await redisService.run((client) => client.set(key, 'null'));
    const first = await request(getApp().getHttpServer())
      .get('/api/v1/public/categories')
      .expect(200);
    const second = await request(getApp().getHttpServer())
      .get('/api/v1/public/categories')
      .expect(200);
    expect(first.body.meta.cache).toBe('MISS');
    expect(second.body.meta.cache).toBe('HIT');
    expect(first.body.meta.requestId).not.toBe(second.body.meta.requestId);
    const ttl = await redisService.run((client) => client.ttl(key));
    expect(ttl).toBeGreaterThan(250);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('returns 429 with Retry-After and Problem Details', async () => {
    const redisService = getApp().get(RedisService);
    await redisService.run((client) => client.flushdb());
    let limited: request.Response | undefined;
    for (let count = 0; count < 6; count += 1) {
      const response = await request(getApp().getHttpServer())
        .get('/api/v1/public/recommendations')
        .query({
          latitude: '-6.1380',
          longitude: '106.7030',
          category: 'ISTIRAHAT',
        });
      if (response.status === 429) limited = response;
    }
    expect(limited?.headers['retry-after']).toBeDefined();
    expect(limited?.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('fails open to MySQL when Redis is unavailable', async () => {
    await redis?.stop();
    redis = undefined;
    const response = await request(getApp().getHttpServer())
      .get('/api/v1/public/places')
      .query({
        latitude: '-6.1468',
        longitude: '106.8061',
        category: 'MAKAN_MURAH',
        budgetAmount: '15000',
      })
      .expect(200);
    expect(response.body.data[0]?.name).toBe('Warung Bu Ani');
    expect(response.body.meta.cache).toBe('BYPASS');
  });
});
