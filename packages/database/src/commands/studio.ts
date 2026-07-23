import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../../', import.meta.url)));

if (process.env.NODE_ENV !== 'development') {
  throw new Error('db:studio is restricted to NODE_ENV=development');
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', 'mysql'].includes(databaseUrl.hostname)) {
  throw new Error('db:studio is restricted to a local development database');
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(command, ['exec', 'drizzle-kit', 'studio'], { stdio: 'inherit' });
const exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exitCode = exitCode;
