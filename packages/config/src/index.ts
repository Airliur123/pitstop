import {
  booleanStringSchema,
  commaSeparatedUrlsSchema,
  nodeEnvironmentSchema,
  nonEmptyStringSchema,
  portSchema,
  urlSchema,
} from '@pitstop/validation';
import { z } from 'zod';

const commonSchema = {
  NODE_ENV: nodeEnvironmentSchema,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
};

export const databaseEnvironmentSchema = z.object({ DATABASE_URL: urlSchema });
export const redisEnvironmentSchema = z.object({ REDIS_URL: urlSchema });
export const storageEnvironmentSchema = z.object({
  S3_ENDPOINT: urlSchema,
  S3_REGION: nonEmptyStringSchema,
  S3_BUCKET: nonEmptyStringSchema,
  S3_ACCESS_KEY: nonEmptyStringSchema,
  S3_SECRET_KEY: nonEmptyStringSchema,
  S3_FORCE_PATH_STYLE: booleanStringSchema,
});
export const mailEnvironmentSchema = z.object({
  MAIL_HOST: nonEmptyStringSchema,
  MAIL_PORT: portSchema,
});

export const webEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  WEB_PORT: portSchema,
  NEXT_PUBLIC_API_BASE_URL: urlSchema,
  NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
});

export const adminEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  ADMIN_PORT: portSchema,
  NEXT_PUBLIC_API_BASE_URL: urlSchema,
  NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
});

export const apiEnvironmentSchema = z.object({
  ...commonSchema,
  API_PORT: portSchema,
  DATABASE_URL: urlSchema,
  REDIS_URL: urlSchema,
  S3_ENDPOINT: urlSchema,
  S3_REGION: nonEmptyStringSchema,
  S3_BUCKET: nonEmptyStringSchema,
  S3_ACCESS_KEY: nonEmptyStringSchema,
  S3_SECRET_KEY: nonEmptyStringSchema,
  S3_FORCE_PATH_STYLE: booleanStringSchema,
  MAIL_HOST: nonEmptyStringSchema,
  MAIL_PORT: portSchema,
  CORS_ALLOWED_ORIGINS: commaSeparatedUrlsSchema,
});

export const workerEnvironmentSchema = z.object({
  ...commonSchema,
  REDIS_URL: urlSchema,
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type AdminEnvironment = z.infer<typeof adminEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

function parseEnvironment<T>(schema: z.ZodType<T>, environment: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

export const parseWebEnvironment = (environment: NodeJS.ProcessEnv): WebEnvironment =>
  parseEnvironment(webEnvironmentSchema, environment);

export const parseAdminEnvironment = (environment: NodeJS.ProcessEnv): AdminEnvironment =>
  parseEnvironment(adminEnvironmentSchema, environment);

export const parseApiEnvironment = (environment: NodeJS.ProcessEnv): ApiEnvironment =>
  parseEnvironment(apiEnvironmentSchema, environment);

export const parseWorkerEnvironment = (environment: NodeJS.ProcessEnv): WorkerEnvironment =>
  parseEnvironment(workerEnvironmentSchema, environment);

export const parseDatabaseEnvironment = (environment: NodeJS.ProcessEnv) =>
  parseEnvironment(databaseEnvironmentSchema, environment);

export const parseRedisEnvironment = (environment: NodeJS.ProcessEnv) =>
  parseEnvironment(redisEnvironmentSchema, environment);

export const parseStorageEnvironment = (environment: NodeJS.ProcessEnv) =>
  parseEnvironment(storageEnvironmentSchema, environment);

export const parseMailEnvironment = (environment: NodeJS.ProcessEnv) =>
  parseEnvironment(mailEnvironmentSchema, environment);

export function parseCorsOrigins(value: string): string[] {
  return value.split(',').map((origin) => origin.trim());
}
