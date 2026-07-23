import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { defineConfig } from 'drizzle-kit';

loadWorkspaceEnvironment(fileURLToPath(new URL('../../', import.meta.url)));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle commands');
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
