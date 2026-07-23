import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { Pool } from 'mysql2/promise';

export async function migrateDatabase(pool: Pool): Promise<void> {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
}
