import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';

import { bootstrapWorker } from './bootstrap';
import { readWorkerRuntimeSettings } from './worker-observability';

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../', import.meta.url)));
void bootstrapWorker().catch((error: unknown) => {
  const settings = readWorkerRuntimeSettings();
  const errorClass =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
      ? error.name
      : 'Error';
  process.stderr.write(
    `${JSON.stringify({
      environment: settings.environment,
      errorClass,
      event: 'worker-startup-failed',
      level: 'error',
      release: settings.release,
      service: settings.service,
      timestamp: new Date().toISOString(),
    })}\n`,
  );
  process.exitCode = 1;
});
