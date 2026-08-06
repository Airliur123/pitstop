import type { Pool } from '@pitstop/database';
import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../../common/redis/redis.service';
import type { ApiEnvironmentProvider } from '../../configuration';
import { MetricsRegistry } from '../observability/metrics-registry';
import { HealthService } from './health.service';

const environment = {
  HEALTH_DEPENDENCY_TIMEOUT_MS: 100,
} as ApiEnvironmentProvider;

describe('HealthService', () => {
  it('classifies required configuration, database, migration, Redis, and queue checks', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ one: 1 }]])
        .mockResolvedValueOnce([[{ migration_count: 11 }]]),
    } as unknown as Pool;
    const redis = { ping: vi.fn().mockResolvedValue(true) } as unknown as RedisService;
    const service = new HealthService(pool, redis, environment, new MetricsRegistry());

    await expect(service.readiness()).resolves.toEqual({
      checks: {
        configuration: 'up',
        database: 'up',
        migrations: 'up',
        queue: 'up',
        redis: 'up',
      },
      service: 'pitstop-api',
      status: 'ready',
    });
  });

  it('returns not_ready without exposing dependency errors', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('mysql://secret@internal/database')),
    } as unknown as Pool;
    const redis = { ping: vi.fn().mockResolvedValue(false) } as unknown as RedisService;
    const service = new HealthService(pool, redis, environment, new MetricsRegistry());

    const result = await service.readiness();
    expect(result.status).toBe('not_ready');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.checks).toMatchObject({
      database: 'down',
      migrations: 'down',
      queue: 'down',
      redis: 'down',
    });
  });

  it('bounds dependency checks that never settle', async () => {
    vi.useFakeTimers();
    const pool = {
      query: vi.fn(() => new Promise(() => undefined)),
    } as unknown as Pool;
    const redis = {
      ping: vi.fn(() => new Promise<boolean>(() => undefined)),
    } as unknown as RedisService;
    const service = new HealthService(pool, redis, environment, new MetricsRegistry());
    const result = service.readiness();

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toMatchObject({ status: 'not_ready' });
    const repeated = service.readiness();
    await vi.advanceTimersByTimeAsync(100);
    await expect(repeated).resolves.toMatchObject({ status: 'not_ready' });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(redis.ping).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
