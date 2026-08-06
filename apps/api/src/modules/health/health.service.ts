import { Inject, Injectable } from '@nestjs/common';
import type { ReadyHealthResponse } from '@pitstop/contracts';
import { type Pool, type RowDataPacket } from '@pitstop/database';

import { DATABASE_POOL } from '../../common/database/database.module';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { MetricsRegistry } from '../observability/metrics-registry';

interface MigrationCountRow extends RowDataPacket {
  readonly migration_count: number | string;
}

@Injectable()
export class HealthService {
  private databaseProbe: Promise<boolean> | undefined;
  private migrationsProbe: Promise<number> | undefined;
  private redisProbe: Promise<boolean> | undefined;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
  ) {}

  async readiness(): Promise<ReadyHealthResponse> {
    const [database, redis, migrations] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMigrations(),
    ]);
    const queue = redis;
    const configuration = 'up' as const;
    const checks = { configuration, database, migrations, queue, redis } as const;
    for (const [dependency, availability] of Object.entries(checks)) {
      this.metrics.set(
        'pitstop_dependency_available',
        { dependency },
        availability === 'up' ? 1 : 0,
      );
      if (availability === 'down') {
        this.metrics.increment('pitstop_dependency_operation_failures_total', {
          dependency,
          operation: 'readiness',
        });
      }
    }
    return {
      status: Object.values(checks).every((check) => check === 'up') ? 'ready' : 'not_ready',
      service: 'pitstop-api',
      checks,
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    const probe =
      this.databaseProbe ??
      this.trackDatabaseProbe(
        this.pool.query('SELECT 1').then(
          () => true,
          () => false,
        ),
      );
    return (await this.withTimeout(probe, false)) ? 'up' : 'down';
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    const probe =
      this.redisProbe ??
      this.trackRedisProbe(
        this.redis.ping().then(
          (result) => result,
          () => false,
        ),
      );
    return (await this.withTimeout(probe, false)) ? 'up' : 'down';
  }

  private async checkMigrations(): Promise<'up' | 'down'> {
    const probe =
      this.migrationsProbe ??
      this.trackMigrationsProbe(
        this.pool
          .query<MigrationCountRow[]>(
            'SELECT COUNT(*) AS migration_count FROM __drizzle_migrations',
          )
          .then(
            (result) => Number(result[0][0]?.migration_count ?? 0),
            () => -1,
          ),
      );
    const count = await this.withTimeout(probe, -1);
    return Number.isSafeInteger(count) && count >= 11 ? 'up' : 'down';
  }

  private trackDatabaseProbe(probe: Promise<boolean>): Promise<boolean> {
    this.databaseProbe = probe.finally(() => {
      this.databaseProbe = undefined;
    });
    return this.databaseProbe;
  }

  private trackRedisProbe(probe: Promise<boolean>): Promise<boolean> {
    this.redisProbe = probe.finally(() => {
      this.redisProbe = undefined;
    });
    return this.redisProbe;
  }

  private trackMigrationsProbe(probe: Promise<number>): Promise<number> {
    this.migrationsProbe = probe.finally(() => {
      this.migrationsProbe = undefined;
    });
    return this.migrationsProbe;
  }

  private async withTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((resolve) => {
          timeout = setTimeout(
            () => resolve(fallback),
            this.environment.HEALTH_DEPENDENCY_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
