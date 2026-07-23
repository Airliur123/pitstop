import type { ApiEnvironment } from '@pitstop/config';

export const API_ENVIRONMENT = Symbol('API_ENVIRONMENT');

export type ApiEnvironmentProvider = ApiEnvironment;
