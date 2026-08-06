import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { parseApiEnvironment } from '@pitstop/config';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { Logger } from 'nestjs-pino';

import { bootstrapApi } from './bootstrap';
import { installApiShutdownHandlers } from './lifecycle/graceful-shutdown';

async function main(): Promise<void> {
  const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const environment = parseApiEnvironment(loadWorkspaceEnvironment(workspaceRoot));
  const app = await bootstrapApi();
  installApiShutdownHandlers(app, app.get(Logger), environment.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      environment: process.env.NODE_ENV ?? 'development',
      errorClass: error instanceof Error ? error.name : 'UnknownError',
      event: 'startup_failed',
      level: 'fatal',
      service: 'pitstop-api',
    })}\n`,
  );
  process.exitCode = 1;
});
