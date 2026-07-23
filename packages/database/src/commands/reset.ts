import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';

import { createDatabaseConnectionConfig, createDatabasePool } from '../index';

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../../', import.meta.url)));

if (process.env.NODE_ENV === 'production') {
  throw new Error('db:reset is forbidden when NODE_ENV=production');
}
if (process.env.PITSTOP_ALLOW_DB_RESET !== 'true') {
  throw new Error('db:reset requires PITSTOP_ALLOW_DB_RESET=true');
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', 'mysql'].includes(databaseUrl.hostname)) {
  throw new Error('db:reset is restricted to a local development/test database');
}

const pool = createDatabasePool(createDatabaseConnectionConfig(process.env));
const dropStatements = [
  'DROP TABLE IF EXISTS report_evidence',
  'DROP TABLE IF EXISTS place_reports',
  'DROP TABLE IF EXISTS place_confirmations',
  'DROP TABLE IF EXISTS geocoding_results',
  'DROP TABLE IF EXISTS google_form_submissions',
  'DROP TABLE IF EXISTS idempotency_keys',
  'DROP TABLE IF EXISTS integration_sources',
  'DROP TABLE IF EXISTS moderation_reviews',
  'DROP TABLE IF EXISTS contribution_photos',
  'DROP TABLE IF EXISTS contribution_payloads',
  'DROP TABLE IF EXISTS contributions',
  'DROP TABLE IF EXISTS place_change_history',
  'DROP TABLE IF EXISTS audit_logs',
  'DROP TABLE IF EXISTS operating_hour_exceptions',
  'DROP TABLE IF EXISTS operating_hours',
  'DROP TABLE IF EXISTS place_photos',
  'DROP TABLE IF EXISTS place_facilities',
  'DROP TABLE IF EXISTS facilities',
  'DROP TABLE IF EXISTS menus',
  'DROP TABLE IF EXISTS place_categories',
  'DROP TABLE IF EXISTS categories',
  'DROP TABLE IF EXISTS places',
  'DROP TABLE IF EXISTS refresh_tokens',
  'DROP TABLE IF EXISTS auth_accounts',
  'DROP TABLE IF EXISTS user_roles',
  'DROP TABLE IF EXISTS roles',
  'DROP TABLE IF EXISTS users',
  'DROP TABLE IF EXISTS __drizzle_migrations',
] as const;

try {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const statement of dropStatements) await pool.query(statement);
  process.stdout.write('Local database reset completed; run db:migrate before use.\n');
} finally {
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await pool.end();
}
