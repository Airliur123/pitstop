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
