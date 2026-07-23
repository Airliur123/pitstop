import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabaseConnectionConfig, createDatabasePool, type Pool } from '@pitstop/database';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironmentProvider) =>
        createDatabasePool(
          createDatabaseConnectionConfig({ DATABASE_URL: environment.DATABASE_URL }),
        ),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
