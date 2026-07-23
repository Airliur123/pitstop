import { Inject, Injectable } from '@nestjs/common';
import type { ReadyHealthResponse } from '@pitstop/contracts';
import {
  createDatabaseConnectionConfig,
  createDatabasePool,
  pingDatabase,
} from '@pitstop/database';
import Redis from 'ioredis';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class HealthService {
  constructor(@Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider) {}

  async readiness(): Promise<ReadyHealthResponse> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const checks = { database, redis } as const;
    return {
      status: database === 'up' && redis === 'up' ? 'ready' : 'not_ready',
      service: 'pitstop-api',
      checks,
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    const pool = createDatabasePool(
      createDatabaseConnectionConfig({ DATABASE_URL: this.environment.DATABASE_URL }),
    );
    try {
      return (await pingDatabase(pool)) ? 'up' : 'down';
    } finally {
      await pool.end();
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    const client = new Redis(this.environment.REDIS_URL, {
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
    try {
      await client.connect();
      return (await client.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      client.disconnect();
    }
  }
}
