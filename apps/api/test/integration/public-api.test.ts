import { createHmac } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDatabaseConnectionConfig,
  createDatabasePool,
  createUlid,
  migrateDatabase,
  type Pool,
  seedDatabase,
} from '@pitstop/database';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from '../../src/bootstrap';
import { createCacheKey } from '../../src/common/cache/cache-key';
import { RedisService } from '../../src/common/redis/redis.service';

const AUTH_TOKEN_SECRET = 'test-auth-token-secret-01234567890123456789';

interface MailpitMessage {
  readonly ID: string;
  readonly To: readonly { readonly Address: string }[];
}

interface MailpitMessageList {
  readonly messages: readonly MailpitMessage[];
}

interface MailpitMessageDetail {
  readonly HTML?: string;
  readonly Text?: string;
}

let mailpit: StartedTestContainer | undefined;

describe.sequential('public and Phase 6 authentication API', () => {
  let app: NestFastifyApplication | undefined;
  let mysql: StartedTestContainer | undefined;
  let pool: Pool | undefined;
  let redis: StartedTestContainer | undefined;

  const getApp = (): NestFastifyApplication => {
    if (!app) throw new Error('API integration application is not initialized');
    return app;
  };

  beforeAll(async () => {
    [mysql, redis, mailpit] = await Promise.all([
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
      new GenericContainer('axllent/mailpit:v1.30.0')
        .withExposedPorts(1025, 8025)
        .withWaitStrategy(Wait.forHttp('/readyz', 8025))
        .start(),
    ]);
    const databaseUrl = `mysql://pitstop_api_test:pitstop_api_test@${mysql.getHost()}:${mysql.getMappedPort(3306)}/pitstop_api_test`;
    pool = createDatabasePool(createDatabaseConnectionConfig({ DATABASE_URL: databaseUrl }));
    await migrateDatabase(pool);
    await seedDatabase(pool);

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
      MAIL_HOST: mailpit.getHost(),
      MAIL_PORT: String(mailpit.getMappedPort(1025)),
      MAIL_FROM_ADDRESS: 'noreply@pitstop.test',
      WEB_BASE_URL: 'http://localhost:3000',
      AUTH_TOKEN_SECRET,
      AUTH_SESSION_SECRET: 'test-auth-session-secret-01234567890123456789',
      AUTH_COOKIE_SECURE: 'false',
      AUTH_MAGIC_LINK_TTL_SECONDS: '900',
      AUTH_SESSION_TTL_SECONDS: '3600',
      AUTH_REQUEST_IP_MAX: '20',
      AUTH_REQUEST_EMAIL_MAX: '3',
      AUTH_REQUEST_GLOBAL_MAX: '100',
      AUTH_VERIFY_IP_MAX: '20',
      AUTH_VERIFY_GLOBAL_MAX: '100',
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
    await pool?.end();
    await mailpit?.stop();
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

  it('requests, delivers, consumes once, persists, and revokes a passwordless session', async () => {
    const email = `auth-${createUlid().toLowerCase()}@example.test`;
    const agent = request.agent(getApp().getHttpServer());
    const requested = await agent
      .post('/api/v1/auth/email/request')
      .send({ email: `  ${email.toUpperCase()}  `, returnTo: '/activity' })
      .expect(202);
    expect(requested.body.data).toEqual({ accepted: true });
    expect(requested.headers['cache-control']).toContain('no-store');

    const token = await latestMagicLinkToken(email);
    const verified = await agent.post('/api/v1/auth/email/verify').send({ token }).expect(200);
    expect(verified.body.data).toMatchObject({
      authenticated: true,
      returnTo: '/activity',
      user: { role: 'USER' },
    });
    expect(verified.body.data.user.email).not.toBe(email);
    expect(verified.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(verified.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(verified.headers['set-cookie'][0]).not.toContain('Secure');

    const session = await agent.get('/api/v1/auth/session').expect(200);
    expect(session.body.data).toMatchObject({ authenticated: true, user: { role: 'USER' } });

    const replay = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/verify')
      .send({ token })
      .expect(401);
    expect(replay.body.code).toBe('AUTH_TOKEN_INVALID');
    expect(replay.headers['cache-control']).toContain('no-store');

    await agent.post('/api/v1/auth/logout').send({}).expect(403);
    const loggedOut = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .send({})
      .expect(200);
    expect(loggedOut.body.data).toEqual({ authenticated: false });
    expect(loggedOut.headers['set-cookie'][0]).toContain('Max-Age=0');
    expect((await agent.get('/api/v1/auth/session').expect(200)).body.data).toEqual({
      authenticated: false,
    });
  });

  it('returns safe invalid and expired link errors without leaking raw tokens', async () => {
    const invalid = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/verify')
      .send({ token: 'x'.repeat(43) })
      .expect(401);
    expect(invalid.body).toMatchObject({ code: 'AUTH_TOKEN_INVALID', status: 401 });
    expect(invalid.text).not.toContain('x'.repeat(43));

    const email = `expired-${createUlid().toLowerCase()}@example.test`;
    await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email, returnTo: '/' })
      .expect(202);
    const token = await latestMagicLinkToken(email);
    const tokenHash = createHmac('sha256', AUTH_TOKEN_SECRET).update(token).digest('hex');
    await pool?.execute(
      `UPDATE auth_login_tokens
       SET created_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE),
           expires_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 MINUTE)
       WHERE token_hash = ?`,
      [tokenHash],
    );
    const expired = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/verify')
      .send({ token })
      .expect(401);
    expect(expired.body.code).toBe('AUTH_TOKEN_EXPIRED');
    expect(expired.text).not.toContain(token);
  });

  it('normalizes requests, prevents enumeration, rejects open redirects, and rate limits by email', async () => {
    const redisService = getApp().get(RedisService);
    await redisService.run((client) => client.flushdb());
    const invalidEmail = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: 'not-an-email', returnTo: '/' })
      .expect(400);
    expect(invalidEmail.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });

    const firstEmail = `generic-${createUlid().toLowerCase()}@example.test`;
    const secondEmail = `generic-${createUlid().toLowerCase()}@example.test`;
    const first = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: firstEmail, returnTo: '/' })
      .expect(202);
    const second = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: secondEmail, returnTo: '/' })
      .expect(202);
    expect(second.body.data).toEqual(first.body.data);
    await expect(latestMagicLinkToken(firstEmail)).resolves.toHaveLength(43);
    await expect(latestMagicLinkToken(secondEmail)).resolves.toHaveLength(43);

    await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: 'user@example.test', returnTo: 'https://attacker.example' })
      .expect(400);

    await redisService.run((client) => client.flushdb());
    const limitedEmail = `limited-${createUlid().toLowerCase()}@example.test`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(getApp().getHttpServer())
        .post('/api/v1/auth/email/request')
        .send({ email: limitedEmail, returnTo: '/' })
        .expect(202);
    }
    const limited = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: limitedEmail, returnTo: '/' })
      .expect(429);
    expect(limited.body.code).toBe('AUTH_RATE_LIMITED');
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
        '/api/v1/auth/email/request',
        '/api/v1/auth/email/verify',
        '/api/v1/auth/session',
        '/api/v1/auth/logout',
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

  it('keeps ordinary non-coordinate reads fail-open when Redis is unavailable', async () => {
    await redis?.stop();
    redis = undefined;
    const response = await request(getApp().getHttpServer())
      .get('/api/v1/public/categories')
      .expect(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'MAKAN_MURAH' })]),
    );
    expect(response.body.meta.cache).toBe('BYPASS');
    const authResponse = await request(getApp().getHttpServer())
      .post('/api/v1/auth/email/request')
      .send({ email: 'redis-down@example.test', returnTo: '/' })
      .expect(503);
    expect(authResponse.body.code).toBe('AUTH_RATE_LIMIT_UNAVAILABLE');
  });
});

async function latestMagicLinkToken(email: string): Promise<string> {
  if (!mailpit) throw new Error('Mailpit integration container is not initialized');
  const baseUrl = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const listResponse = await fetch(`${baseUrl}/api/v1/messages`);
    const list = (await listResponse.json()) as MailpitMessageList;
    const message = list.messages.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const detailResponse = await fetch(
        `${baseUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
      );
      const detail = (await detailResponse.json()) as MailpitMessageDetail;
      const match = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`.match(
        /\/auth\/verify\?token=([A-Za-z0-9_-]{43})/,
      );
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No Mailpit message arrived for ${email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);
}
