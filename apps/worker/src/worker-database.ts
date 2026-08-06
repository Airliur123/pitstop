import { createDatabaseConnectionConfig, createDatabasePool, type Pool } from '@pitstop/database';

import type { WorkerEnvironmentProvider } from './configuration';

export const WORKER_DATABASE_POOL = Symbol('WORKER_DATABASE_POOL');

export function createWorkerDatabasePool(environment: WorkerEnvironmentProvider): Pool {
  return createDatabasePool(
    createDatabaseConnectionConfig({ DATABASE_URL: environment.DATABASE_URL }),
  );
}
