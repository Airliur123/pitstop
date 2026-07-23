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

const positiveIntegerEnvironmentSchema = z.coerce.number<number>().int().positive();
const nonNegativeIntegerEnvironmentSchema = z.coerce.number<number>().int().nonnegative();
const cursorSigningSecretSchema = z
  .string()
  .trim()
  .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
    message: 'must contain at least 32 UTF-8 bytes',
  });

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

export const apiEnvironmentSchema = z
  .object({
    ...commonSchema,
    API_PORT: portSchema,
    API_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .default('api'),
    API_VERSION: z
      .string()
      .regex(/^v[1-9]\d*$/)
      .default('v1'),
    API_SWAGGER_ENABLED: booleanStringSchema.optional().default(false),
    API_BODY_LIMIT_BYTES: positiveIntegerEnvironmentSchema.optional().default(1_048_576),
    API_MAX_QUERY_LENGTH: positiveIntegerEnvironmentSchema.optional().default(2_048),
    DATABASE_URL: urlSchema,
    REDIS_URL: urlSchema,
    REDIS_CACHE_ENABLED: booleanStringSchema.optional().default(true),
    CACHE_CATEGORIES_TTL_SECONDS: positiveIntegerEnvironmentSchema.optional().default(300),
    CACHE_PLACE_DETAIL_TTL_SECONDS: positiveIntegerEnvironmentSchema.optional().default(60),
    CACHE_SEARCH_TTL_SECONDS: positiveIntegerEnvironmentSchema.optional().default(30),
    CACHE_RECOMMENDATION_TTL_SECONDS: positiveIntegerEnvironmentSchema.optional().default(30),
    CACHE_REDIS_TIMEOUT_MS: positiveIntegerEnvironmentSchema.optional().default(250),
    PUBLIC_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerEnvironmentSchema.optional().default(60),
    PUBLIC_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema.optional().default(60),
    RECOMMENDATION_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema.optional().default(30),
    PUBLIC_FALLBACK_RADIUS_METERS: positiveIntegerEnvironmentSchema
      .min(5_001)
      .max(10_000)
      .optional()
      .default(10_000),
    PUBLIC_MAX_SEARCH_LIMIT: positiveIntegerEnvironmentSchema.min(1).max(50).optional().default(50),
    PUBLIC_RECOMMENDATION_CANDIDATE_LIMIT: positiveIntegerEnvironmentSchema
      .min(10)
      .max(500)
      .optional()
      .default(200),
    PUBLIC_CURSOR_SIGNING_SECRET: cursorSigningSecretSchema.optional(),
    PUBLIC_LOCATION_LOGGING: booleanStringSchema.optional().default(false),
    TRUST_PROXY: booleanStringSchema.optional().default(false),
    S3_ENDPOINT: urlSchema,
    S3_REGION: nonEmptyStringSchema,
    S3_BUCKET: nonEmptyStringSchema,
    S3_ACCESS_KEY: nonEmptyStringSchema,
    S3_SECRET_KEY: nonEmptyStringSchema,
    S3_FORCE_PATH_STYLE: booleanStringSchema,
    MAIL_HOST: nonEmptyStringSchema,
    MAIL_PORT: portSchema,
    CORS_ALLOWED_ORIGINS: commaSeparatedUrlsSchema,
    PUBLIC_BUDGET_MAX_AMOUNT: nonNegativeIntegerEnvironmentSchema
      .max(10_000_000)
      .optional()
      .default(10_000_000),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.LOG_LEVEL === 'silent') {
      context.addIssue({
        code: 'custom',
        path: ['LOG_LEVEL'],
        message: 'Production logging cannot be silent',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.PUBLIC_CURSOR_SIGNING_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_CURSOR_SIGNING_SECRET'],
        message: 'is required in production',
      });
    }
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
