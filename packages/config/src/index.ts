import { isIP } from 'node:net';

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
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number<number>()
    .int()
    .min(1_000)
    .max(120_000)
    .optional()
    .default(30_000),
  METRICS_ENABLED: booleanStringSchema.optional().default(false),
  RELEASE_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/)
    .optional()
    .default('development'),
};

const positiveIntegerEnvironmentSchema = z.coerce.number<number>().int().positive();
const nonNegativeIntegerEnvironmentSchema = z.coerce.number<number>().int().nonnegative();
const sameOriginPathSchema = z
  .string()
  .trim()
  .max(256)
  .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, 'Must be a same-origin path without query or fragment');
const exactOriginsEnvironmentSchema = commaSeparatedUrlsSchema.superRefine((value, context) => {
  const normalizedOrigins = new Set<string>();
  for (const origin of splitCommaSeparatedValues(value)) {
    for (const message of publicUrlIssues(origin, false, true)) {
      context.addIssue({ code: 'custom', message: `Invalid exact origin ${origin}: ${message}` });
    }
    try {
      const normalized = new URL(origin).origin;
      if (normalizedOrigins.has(normalized)) {
        context.addIssue({ code: 'custom', message: `Duplicate origin: ${normalized}` });
      }
      normalizedOrigins.add(normalized);
    } catch {
      // The base URL schema reports malformed URLs.
    }
  }
});
const trustedProxyCidrsEnvironmentSchema = z
  .string()
  .optional()
  .default('')
  .superRefine((value, context) => {
    if (value.trim() === '') return;
    const entries = value.split(',').map((entry) => entry.trim());
    const uniqueEntries = new Set<string>();
    for (const entry of entries) {
      if (!isValidIpOrCidr(entry)) {
        context.addIssue({
          code: 'custom',
          message: `Invalid trusted proxy IP/CIDR: ${entry || '<empty>'}`,
        });
      }
      if (uniqueEntries.has(entry)) {
        context.addIssue({ code: 'custom', message: `Duplicate trusted proxy IP/CIDR: ${entry}` });
      }
      uniqueEntries.add(entry);
    }
  })
  .transform((value) => (value.trim() === '' ? [] : splitCommaSeparatedValues(value)));
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
const integrationSecretSchema = z
  .string()
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
    WEB_BASE_URL: urlSchema.optional().default('http://localhost:3000'),
    RELEASE_VERSION: commonSchema.RELEASE_VERSION,
    NEXT_PUBLIC_API_BASE_URL: urlSchema,
    NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT: sameOriginPathSchema
      .optional()
      .default('/api/observability/client'),
    NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: z.coerce.number().min(-90).max(90).optional(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: z.coerce.number().min(-180).max(180).optional(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: nonEmptyStringSchema.optional(),
    NEXT_PUBLIC_MAP_TILES_DISABLED: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_MAP_TILE_ORIGINS: exactOriginsEnvironmentSchema
      .optional()
      .default(
        'https://a.tile.openstreetmap.org,https://b.tile.openstreetmap.org,https://c.tile.openstreetmap.org',
      ),
    NEXT_PUBLIC_PWA_ENABLED: booleanStringSchema.optional().default(false),
    NEXT_PUBLIC_PWA_TEST_MODE: booleanStringSchema.optional().default(false),
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
      environment.NODE_ENV === 'development' &&
      environment.NEXT_PUBLIC_PWA_ENABLED &&
      !environment.NEXT_PUBLIC_PWA_TEST_MODE
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_PWA_ENABLED'],
        message: 'Development PWA requires the explicit PWA test mode',
      });
    }
    if (environment.NODE_ENV === 'production') {
      addPublicUrlIssues(context, ['WEB_BASE_URL'], environment.WEB_BASE_URL, true);
      addPublicUrlIssues(
        context,
        ['NEXT_PUBLIC_API_BASE_URL'],
        environment.NEXT_PUBLIC_API_BASE_URL,
        false,
      );
      for (const origin of splitCommaSeparatedValues(environment.NEXT_PUBLIC_MAP_TILE_ORIGINS)) {
        addPublicUrlIssues(context, ['NEXT_PUBLIC_MAP_TILE_ORIGINS'], origin, true);
      }
    }
  });

export const adminEnvironmentSchema = z
  .object({
    NODE_ENV: nodeEnvironmentSchema,
    ADMIN_PORT: portSchema,
    ADMIN_BASE_URL: urlSchema.optional().default('http://localhost:3001'),
    RELEASE_VERSION: commonSchema.RELEASE_VERSION,
    NEXT_PUBLIC_API_BASE_URL: urlSchema,
    NEXT_PUBLIC_ENABLE_UI_CATALOG: booleanStringSchema.optional().default(false),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production') {
      addPublicUrlIssues(context, ['ADMIN_BASE_URL'], environment.ADMIN_BASE_URL, true);
      addPublicUrlIssues(
        context,
        ['NEXT_PUBLIC_API_BASE_URL'],
        environment.NEXT_PUBLIC_API_BASE_URL,
        false,
      );
    }
  });

export const apiEnvironmentSchema = z
  .object({
    ...commonSchema,
    API_PORT: portSchema,
    API_BASE_URL: urlSchema.optional().default('http://localhost:3002'),
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
    HEALTH_DEPENDENCY_TIMEOUT_MS: positiveIntegerEnvironmentSchema
      .min(50)
      .max(5_000)
      .optional()
      .default(1_000),
    WORKER_HEARTBEAT_TTL_SECONDS: positiveIntegerEnvironmentSchema
      .min(10)
      .max(300)
      .optional()
      .default(30),
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
    GOOGLE_FORM_SOURCE_ID: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,79}$/)
      .optional()
      .default('google-form-main'),
    GOOGLE_FORM_SOURCE_ENABLED: booleanStringSchema.optional().default(false),
    GOOGLE_FORM_CURRENT_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/)
      .optional()
      .default('v1'),
    GOOGLE_FORM_CURRENT_SECRET: integrationSecretSchema.optional(),
    GOOGLE_FORM_PREVIOUS_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/)
      .optional(),
    GOOGLE_FORM_PREVIOUS_SECRET: integrationSecretSchema.optional(),
    GOOGLE_FORM_REPLAY_WINDOW_SECONDS: positiveIntegerEnvironmentSchema
      .min(60)
      .max(3_600)
      .optional()
      .default(300),
    GOOGLE_FORM_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerEnvironmentSchema
      .min(10)
      .max(3_600)
      .optional()
      .default(60),
    GOOGLE_FORM_RATE_LIMIT_MAX: positiveIntegerEnvironmentSchema
      .min(1)
      .max(10_000)
      .optional()
      .default(120),
    GOOGLE_FORM_BODY_LIMIT_BYTES: positiveIntegerEnvironmentSchema
      .min(1_024)
      .max(1_048_576)
      .optional()
      .default(131_072),
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
    TRUST_PROXY_CIDRS: trustedProxyCidrsEnvironmentSchema,
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
    CORS_ALLOWED_ORIGINS: exactOriginsEnvironmentSchema,
    PUBLIC_BUDGET_MAX_AMOUNT: nonNegativeIntegerEnvironmentSchema
      .max(10_000_000)
      .optional()
      .default(10_000_000),
  })
  .superRefine((environment, context) => {
    if (environment.TRUST_PROXY && environment.TRUST_PROXY_CIDRS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_CIDRS'],
        message: 'must contain at least one explicit IP/CIDR when TRUST_PROXY is true',
      });
    }
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
    if (environment.GOOGLE_FORM_SOURCE_ENABLED && !environment.GOOGLE_FORM_CURRENT_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['GOOGLE_FORM_CURRENT_SECRET'],
        message: 'is required when GOOGLE_FORM_SOURCE_ENABLED is true',
      });
    }
    if (
      Boolean(environment.GOOGLE_FORM_PREVIOUS_KEY_ID) !==
      Boolean(environment.GOOGLE_FORM_PREVIOUS_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GOOGLE_FORM_PREVIOUS_SECRET'],
        message: 'previous key id and secret must be configured together',
      });
    }
    if (
      environment.GOOGLE_FORM_PREVIOUS_KEY_ID &&
      environment.GOOGLE_FORM_PREVIOUS_KEY_ID === environment.GOOGLE_FORM_CURRENT_KEY_ID
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GOOGLE_FORM_PREVIOUS_KEY_ID'],
        message: 'must differ from GOOGLE_FORM_CURRENT_KEY_ID',
      });
    }
    if (environment.NODE_ENV === 'production') {
      if (environment.API_SWAGGER_ENABLED) {
        context.addIssue({
          code: 'custom',
          path: ['API_SWAGGER_ENABLED'],
          message: 'must be false in production because the documentation route is public',
        });
      }
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
      addPublicUrlIssues(context, ['API_BASE_URL'], environment.API_BASE_URL, true);
      addPublicUrlIssues(context, ['WEB_BASE_URL'], environment.WEB_BASE_URL, true);
      addPublicUrlIssues(context, ['ADMIN_BASE_URL'], environment.ADMIN_BASE_URL, true);
      for (const origin of splitCommaSeparatedValues(environment.CORS_ALLOWED_ORIGINS)) {
        addPublicUrlIssues(context, ['CORS_ALLOWED_ORIGINS'], origin, true);
      }

      const corsOrigins = new Set(parseCorsOrigins(environment.CORS_ALLOWED_ORIGINS));
      for (const [path, configuredUrl] of [
        ['WEB_BASE_URL', environment.WEB_BASE_URL],
        ['ADMIN_BASE_URL', environment.ADMIN_BASE_URL],
      ] as const) {
        if (!corsOrigins.has(new URL(configuredUrl).origin)) {
          context.addIssue({
            code: 'custom',
            path: ['CORS_ALLOWED_ORIGINS'],
            message: `must include the configured ${path} origin`,
          });
        }
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

export const workerEnvironmentSchema = z
  .object({
    ...commonSchema,
    DATABASE_URL: urlSchema,
    REDIS_URL: urlSchema,
    WORKER_HEARTBEAT_INTERVAL_MS: positiveIntegerEnvironmentSchema
      .min(1_000)
      .max(60_000)
      .optional()
      .default(10_000),
    WORKER_HEARTBEAT_TTL_SECONDS: positiveIntegerEnvironmentSchema
      .min(10)
      .max(300)
      .optional()
      .default(30),
    WORKER_RECONCILE_INTERVAL_MS: positiveIntegerEnvironmentSchema
      .min(1_000)
      .max(300_000)
      .optional()
      .default(5_000),
    WORKER_STAGE_LEASE_SECONDS: positiveIntegerEnvironmentSchema
      .min(30)
      .max(3_600)
      .optional()
      .default(300),
    GEOCODING_PROVIDER: z.enum(['deterministic', 'nominatim']).optional().default('deterministic'),
    GEOCODING_BASE_URL: urlSchema.optional().default('https://nominatim.openstreetmap.org'),
    GEOCODING_USER_AGENT: nonEmptyStringSchema.optional().default('PitStop/1.0'),
    GEOCODING_HTTP_TIMEOUT_MS: positiveIntegerEnvironmentSchema
      .min(1_000)
      .max(30_000)
      .optional()
      .default(30_000),
    GEOCODING_CONFIDENCE_THRESHOLD: z.coerce.number<number>().min(0).max(1).optional().default(0.7),
    DUPLICATE_RADIUS_METERS: positiveIntegerEnvironmentSchema
      .min(25)
      .max(2_000)
      .optional()
      .default(250),
  })
  .superRefine((environment, context) => {
    if (
      environment.WORKER_HEARTBEAT_TTL_SECONDS * 1_000 <
      environment.WORKER_HEARTBEAT_INTERVAL_MS * 3
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WORKER_HEARTBEAT_TTL_SECONDS'],
        message: 'must be at least three times WORKER_HEARTBEAT_INTERVAL_MS',
      });
    }
    if (environment.NODE_ENV === 'production' && environment.LOG_LEVEL === 'silent') {
      context.addIssue({
        code: 'custom',
        path: ['LOG_LEVEL'],
        message: 'Production logging cannot be silent',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.GEOCODING_PROVIDER === 'deterministic'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GEOCODING_PROVIDER'],
        message: 'deterministic geocoding is not allowed in production',
      });
    }
    if (environment.NODE_ENV === 'production') {
      addPublicUrlIssues(context, ['GEOCODING_BASE_URL'], environment.GEOCODING_BASE_URL, false);
    }
  });

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type AdminEnvironment = z.infer<typeof adminEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type ParsedWorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

type Phase11WorkerEnvironmentKey =
  | 'GRACEFUL_SHUTDOWN_TIMEOUT_MS'
  | 'METRICS_ENABLED'
  | 'RELEASE_VERSION'
  | 'WORKER_HEARTBEAT_INTERVAL_MS'
  | 'WORKER_HEARTBEAT_TTL_SECONDS';

/**
 * The Phase 11 fields remain optional on this compatibility type so existing test fixtures that
 * construct a worker environment directly continue to typecheck. parseWorkerEnvironment always
 * returns ParsedWorkerEnvironment, with every default applied.
 */
export type WorkerEnvironment = Omit<ParsedWorkerEnvironment, Phase11WorkerEnvironmentKey> &
  Partial<Pick<ParsedWorkerEnvironment, Phase11WorkerEnvironmentKey>>;

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

export const parseWorkerEnvironment = (environment: NodeJS.ProcessEnv): ParsedWorkerEnvironment =>
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
  const origins = splitCommaSeparatedValues(value);
  const normalizedOrigins = new Set<string>();
  for (const origin of origins) {
    const issues = publicUrlIssues(origin, false, true);
    if (issues.length > 0) throw new Error(`Invalid CORS origin ${origin}: ${issues.join(', ')}`);
    normalizedOrigins.add(new URL(origin).origin);
  }
  if (normalizedOrigins.size !== origins.length) {
    throw new Error('CORS origins must not contain duplicates');
  }
  return [...normalizedOrigins];
}

export function parseTrustedProxyCidrs(value: string): string[] {
  if (value.trim() === '') return [];

  const entries = value.split(',').map((entry) => entry.trim());
  const uniqueEntries = new Set<string>();
  for (const entry of entries) {
    if (!isValidIpOrCidr(entry)) {
      throw new Error(`Invalid trusted proxy IP/CIDR: ${entry || '<empty>'}`);
    }
    if (uniqueEntries.has(entry)) {
      throw new Error(`Duplicate trusted proxy IP/CIDR: ${entry}`);
    }
    uniqueEntries.add(entry);
  }
  return entries;
}

/**
 * Produces Fastify's trustProxy option. It intentionally does not parse X-Forwarded-For: Fastify
 * must evaluate the chain from the directly connected peer toward the client and stop at the first
 * address outside this explicit allowlist.
 */
export function buildFastifyTrustProxy(
  environment: Pick<ApiEnvironment, 'TRUST_PROXY' | 'TRUST_PROXY_CIDRS'>,
): false | string[] {
  if (!environment.TRUST_PROXY) return false;
  if (environment.TRUST_PROXY_CIDRS.length === 0) {
    throw new Error('TRUST_PROXY_CIDRS is required when TRUST_PROXY is true');
  }
  return [...environment.TRUST_PROXY_CIDRS];
}

export const resolveTrustedProxyConfiguration = buildFastifyTrustProxy;

function splitCommaSeparatedValues(value: string): string[] {
  return value.split(',').map((entry) => entry.trim());
}

function isValidIpOrCidr(value: string): boolean {
  const separatorIndex = value.lastIndexOf('/');
  if (separatorIndex === -1) return isIP(value) !== 0;
  if (value.indexOf('/') !== separatorIndex) return false;

  const address = value.slice(0, separatorIndex);
  const prefixText = value.slice(separatorIndex + 1);
  if (!/^(?:0|[1-9]\d{0,2})$/.test(prefixText)) return false;

  const addressVersion = isIP(address);
  const prefix = Number(prefixText);
  return (addressVersion === 4 && prefix <= 32) || (addressVersion === 6 && prefix <= 128);
}

function publicUrlIssues(value: string, production: boolean, exactOrigin: boolean): string[] {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return ['must be a valid absolute URL'];
  }

  const issues: string[] = [];
  if (!['http:', 'https:'].includes(url.protocol)) issues.push('must use HTTP(S)');
  if (url.username || url.password) issues.push('must not contain credentials');
  if (url.hostname.includes('*')) issues.push('must not contain wildcards');
  if (url.search || url.hash) issues.push('must not contain a query or fragment');
  if (exactOrigin && url.pathname !== '/') issues.push('must be an exact origin without a path');
  if (production && url.protocol !== 'https:') issues.push('must use HTTPS in production');
  if (production && isLocalHostname(url.hostname))
    issues.push('cannot use localhost in production');
  return issues;
}

function addPublicUrlIssues(
  context: {
    addIssue(issue: { code: 'custom'; message: string; path: (number | string)[] }): void;
  },
  path: (number | string)[],
  value: string,
  exactOrigin: boolean,
): void {
  const issuePath = path.join('.');
  const label =
    issuePath === 'NEXT_PUBLIC_API_BASE_URL' || issuePath === 'API_BASE_URL'
      ? 'API base URL'
      : issuePath === 'ADMIN_BASE_URL'
        ? 'admin base URL'
        : issuePath === 'WEB_BASE_URL'
          ? 'web base URL'
          : issuePath;

  for (const message of publicUrlIssues(value, true, exactOrigin)) {
    context.addIssue({
      code: 'custom',
      path,
      message:
        message === 'cannot use localhost in production'
          ? `Production ${label} cannot use localhost`
          : `Production ${label} ${message.replace(' in production', '')}`,
    });
  }
}

function isLocalHostname(value: string): boolean {
  return /^(?:(?:.+\.)?localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|\[?::(?:1)?\]?)$/i.test(value);
}

export * from './security';
