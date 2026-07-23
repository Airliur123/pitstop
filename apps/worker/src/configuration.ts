import type { WorkerEnvironment } from '@pitstop/config';

export const WORKER_ENVIRONMENT = Symbol('WORKER_ENVIRONMENT');

export type WorkerEnvironmentProvider = WorkerEnvironment;
