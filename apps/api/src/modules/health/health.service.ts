import { Inject, Injectable } from '@nestjs/common';
import type { ReadyHealthResponse } from '@pitstop/contracts';
import { pingDatabase, type Pool } from '@pitstop/database';

import { DATABASE_POOL } from '../../common/database/database.module';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

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
    return (await pingDatabase(this.pool)) ? 'up' : 'down';
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    return (await this.redis.ping()) ? 'up' : 'down';
  }
}
