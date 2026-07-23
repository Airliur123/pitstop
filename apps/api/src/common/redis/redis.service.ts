import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: Redis;
  private connecting: Promise<void> | undefined;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironmentProvider) {
    this.client = new Redis(environment.REDIS_URL, {
      commandTimeout: environment.CACHE_REDIS_TIMEOUT_MS,
      connectTimeout: environment.CACHE_REDIS_TIMEOUT_MS,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
    this.client.on('error', () => undefined);
  }

  async run<T>(operation: (client: Redis) => Promise<T>): Promise<T | null> {
    try {
      if (this.client.status === 'wait') {
        this.connecting ??= this.client.connect().finally(() => {
          this.connecting = undefined;
        });
      }
      if (this.connecting) await this.connecting;
      return await operation(this.client);
    } catch {
      return null;
    }
  }

  async ping(): Promise<boolean> {
    return (await this.run((client) => client.ping())) === 'PONG';
  }

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}
