import { parseDatabaseEnvironment } from '@pitstop/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

import { databaseSchema } from './schema';

export * from './identifiers';
export * from './migrate';
export * from './public-api';
export { seedDatabase } from './seed';
export * from './spatial';
export * from './transactions';
export type { Pool } from 'mysql2/promise';

export interface DatabaseConnectionConfig {
  readonly uri: string;
  readonly connectionLimit: number;
  readonly enableKeepAlive: true;
}

export function createDatabaseConnectionConfig(
  environment: NodeJS.ProcessEnv,
): DatabaseConnectionConfig {
  const { DATABASE_URL } = parseDatabaseEnvironment(environment);
  return { uri: DATABASE_URL, connectionLimit: 10, enableKeepAlive: true };
}

export function createDatabasePool(config: DatabaseConnectionConfig): Pool {
  const poolOptions: PoolOptions = {
    uri: config.uri,
    connectionLimit: config.connectionLimit,
    enableKeepAlive: config.enableKeepAlive,
  };
  return createPool(poolOptions);
}

export function createDatabaseClient(pool: Pool) {
  return drizzle({ client: pool, schema: databaseSchema, mode: 'default' });
}

export async function pingDatabase(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
