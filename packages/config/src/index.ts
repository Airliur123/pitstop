import {
  authEmailSchema,
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
const authenticationSecretSchema = z
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
  MAIL_USER: nonEmptyStringSchema.optional(),
  MAIL_PASSWORD: nonEmptyStringSchema.optional(),
  MAIL_SECURE: booleanStringSchema.optional().default(false),
  MAIL_FROM_ADDRESS: authEmailSchema.optional().default('noreply@pitstop.local'),
});

export const webEnvironmentSchema = z
  .object({
    NODE_ENV: nodeEnvironmentSchema,
    WEB_PORT: portSchema,
    NEXT_PUBLIC_API_BASE_URL: urlSchema,
    NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: z.coerce.number().min(-90).max(90).optional(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: z.coerce.number().min(-180).max(180).optional(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: nonEmptyStringSchema.optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED &&
      (environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE === undefined ||
        environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE === undefined ||
        environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED'],
        message: 'Preview location coordinates and label are required when enabled',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED'],
        message: 'Guest preview location must be disabled in production',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(
        new URL(environment.NEXT_PUBLIC_API_BASE_URL).hostname,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_API_BASE_URL'],
        message: 'Production API base URL cannot use localhost',
      });
    }
  });

export const adminEnvironmentSchema = z
  .object({
    NODE_ENV: nodeEnvironmentSchema,
    ADMIN_PORT: portSchema,
    ADMIN_BASE_URL: urlSchema.optional().default('http://localhost:3001'),
    NEXT_PUBLIC_API_BASE_URL: urlSchema,
    NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      isLocalHostname(new URL(environment.NEXT_PUBLIC_API_BASE_URL).hostname)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_API_BASE_URL'],
        message: 'Production API base URL cannot use localhost',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      isLocalHostname(new URL(environment.ADMIN_BASE_URL).hostname)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ADMIN_BASE_URL'],
        message: 'Production admin base URL cannot use localhost',
      });
    }
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
    WEB_BASE_URL: urlSchema.optional().default('http://localhost:3000'),
    ADMIN_BASE_URL: urlSchema.optional().default('http://localhost:3001'),
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
    AUTH_MAGIC_LINK_TTL_SECONDS: positiveIntegerEnvironmentSchema
      .min(300)
      .max(3_600)
      .optional()
      .default(900),
    AUTH_SESSION_TTL_SECONDS: positiveIntegerEnvironmentSchema
      .min(3_600)
      .max(90 * 24 * 60 * 60)
      .optional()
      .default(30 * 24 * 60 * 60),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerEnvironmentSchema
      .min(60)
      .max(3_600)
      .optional()
      .default(900),
    AUTH_REQUEST_IP_MAX: positiveIntegerEnvironmentSchema.min(1).max(100).optional().default(10),
    AUTH_REQUEST_EMAIL_MAX: positiveIntegerEnvironmentSchema.min(1).max(20).optional().default(3),
    AUTH_REQUEST_GLOBAL_MAX: positiveIntegerEnvironmentSchema
      .min(10)
      .max(100_000)
      .optional()
      .default(500),
    AUTH_VERIFY_IP_MAX: positiveIntegerEnvironmentSchema.min(1).max(200).optional().default(30),
    AUTH_VERIFY_GLOBAL_MAX: positiveIntegerEnvironmentSchema
      .min(10)
      .max(100_000)
      .optional()
      .default(1_000),
    CONTRIBUTION_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerEnvironmentSchema
      .min(10)
      .max(3_600)
      .optional()
      .default(60),
    CONTRIBUTION_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema
      .min(1)
      .max(1_000)
      .optional()
      .default(30),
    ADMIN_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerEnvironmentSchema
      .min(10)
      .max(3_600)
      .optional()
      .default(60),
    ADMIN_READ_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema
      .min(10)
      .max(10_000)
      .optional()
      .default(240),
    ADMIN_MUTATION_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema
      .min(1)
      .max(1_000)
      .optional()
      .default(60),
    AUTH_TOKEN_SECRET: authenticationSecretSchema.optional(),
    AUTH_SESSION_SECRET: authenticationSecretSchema.optional(),
    AUTH_COOKIE_SECURE: booleanStringSchema.optional().default(false),
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
    MAIL_USER: nonEmptyStringSchema.optional(),
    MAIL_PASSWORD: nonEmptyStringSchema.optional(),
    MAIL_SECURE: booleanStringSchema.optional().default(false),
    MAIL_FROM_ADDRESS: authEmailSchema.optional().default('noreply@pitstop.local'),
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
    if (Boolean(environment.MAIL_USER) !== Boolean(environment.MAIL_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_USER'],
        message: 'MAIL_USER and MAIL_PASSWORD must be configured together',
      });
    }
    if (environment.NODE_ENV === 'production') {
      if (!environment.AUTH_TOKEN_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_TOKEN_SECRET'],
          message: 'is required in production',
        });
      }
      if (!environment.AUTH_SESSION_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_SESSION_SECRET'],
          message: 'is required in production',
        });
      }
      if (!environment.AUTH_COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_COOKIE_SECURE'],
          message: 'must be true in production',
        });
      }
      if (isLocalHostname(new URL(environment.WEB_BASE_URL).hostname)) {
        context.addIssue({
          code: 'custom',
          path: ['WEB_BASE_URL'],
          message: 'Production web base URL cannot use localhost',
        });
      }
      if (isLocalHostname(new URL(environment.ADMIN_BASE_URL).hostname)) {
        context.addIssue({
          code: 'custom',
          path: ['ADMIN_BASE_URL'],
          message: 'Production admin base URL cannot use localhost',
        });
      }
      if (isLocalHostname(environment.MAIL_HOST)) {
        context.addIssue({
          code: 'custom',
          path: ['MAIL_HOST'],
          message: 'Production mail host cannot use localhost',
        });
      }
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

function isLocalHostname(value: string): boolean {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(value);
}
