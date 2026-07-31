import { Inject, Injectable, Logger } from '@nestjs/common';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { RedisService } from '../redis/redis.service';
import { createCacheKey } from './cache-key';

export interface PublicCacheResult<T> {
  readonly value: T;
  readonly status: 'HIT' | 'MISS' | 'BYPASS';
}

export type CacheValueValidator<T> = (value: unknown) => value is T;

@Injectable()
export class PublicCacheService {
  private readonly logger = new Logger(PublicCacheService.name);

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async bypass<T>(loader: () => Promise<T>): Promise<PublicCacheResult<T>> {
    return { value: await loader(), status: 'BYPASS' };
  }

  async invalidate(namespace: string, keyInput: unknown): Promise<boolean> {
    if (!this.environment.REDIS_CACHE_ENABLED) return true;
    const key = createCacheKey(namespace, keyInput);
    const result = await this.redis.run((client) => client.del(key));
    if (result === null) {
      this.logger.warn({ cache: 'invalidation-failed', namespace });
      return false;
    }
    this.logger.debug({ cache: 'invalidated', namespace });
    return true;
  }

  async invalidateNamespace(namespace: string): Promise<boolean> {
    if (!this.environment.REDIS_CACHE_ENABLED) return true;
    const pattern = `pitstop:public:v1:${namespace}:*`;
    const result = await this.redis.run((client) =>
      client.eval(
        `local cursor = '0'
         local deleted = 0
         repeat
           local batch = redis.call('SCAN', cursor, 'MATCH', ARGV[1], 'COUNT', 100)
           cursor = batch[1]
           for _, key in ipairs(batch[2]) do
             deleted = deleted + redis.call('DEL', key)
           end
         until cursor == '0'
         return deleted`,
        0,
        pattern,
      ),
    );
    if (result === null) {
      this.logger.warn({ cache: 'namespace-invalidation-failed', namespace });
      return false;
    }
    this.logger.debug({ cache: 'namespace-invalidated', namespace });
    return true;
  }

  async remember<T>(
    namespace: string,
    keyInput: unknown,
    ttlSeconds: number,
    loader: () => Promise<T>,
    isValid: CacheValueValidator<T>,
  ): Promise<PublicCacheResult<T>> {
    if (!this.environment.REDIS_CACHE_ENABLED) {
      return { value: await loader(), status: 'BYPASS' };
    }

    const key = createCacheKey(namespace, keyInput);
    const cached = await this.redis.run((client) => client.get(key));
    if (cached !== null) {
      try {
        const value: unknown = JSON.parse(cached);
        if (!isValid(value)) throw new TypeError('Cached payload has an invalid shape');
        this.logger.debug({ cache: 'hit', namespace });
        return { value, status: 'HIT' };
      } catch {
        await this.redis.run((client) => client.del(key));
      }
    }

    const value = await loader();
    const stored = await this.redis.run((client) =>
      client.set(key, JSON.stringify(value), 'EX', ttlSeconds),
    );
    this.logger.debug({ cache: stored === null ? 'bypass' : 'miss', namespace });
    return { value, status: stored === null ? 'BYPASS' : 'MISS' };
  }
}
