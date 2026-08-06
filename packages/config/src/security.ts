export const CORRELATION_ID_MAX_LENGTH = 64;
export const REDACTED_LOG_VALUE = '[Redacted]';

export const DEFAULT_LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
  'req.headers.x-csrf-token',
  'req.headers.x-integration-signature',
  'req.headers.x-pitstop-key-id',
  'req.headers.x-pitstop-signature',
  'req.headers.x-xsrf-token',
  'req.headers["set-cookie"]',
  'req.headers["x-csrf-token"]',
  'req.headers["x-google-form-signature"]',
  'req.body.email',
  'req.body.token',
  'req.query.token',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers.set-cookie',
  'request.headers.x-csrf-token',
  'request.headers.x-integration-signature',
  'request.headers.x-pitstop-key-id',
  'request.headers.x-pitstop-signature',
  'request.headers.x-xsrf-token',
  'request.headers["set-cookie"]',
  'request.headers["x-csrf-token"]',
  'request.headers["x-google-form-signature"]',
  'request.body.email',
  'request.body.token',
  'request.query.token',
  'res.headers.set-cookie',
  'res.headers["set-cookie"]',
  'response.headers.set-cookie',
  'response.headers["set-cookie"]',
  'email',
  'magicLink',
  'mailBody',
  'password',
  'rawPayload',
  'sessionToken',
  'sessionTokenHash',
  'token',
  'tokenHash',
] as const;

export const SAFE_METRIC_LABEL_NAMES = [
  'dependency',
  'environment',
  'error_class',
  'job_name',
  'kind',
  'method',
  'operation',
  'outcome',
  'queue',
  'reason',
  'route',
  'service',
  'scope',
  'status',
  'status_class',
  'status_code',
  'state',
] as const;

type RuntimeEnvironment = 'development' | 'production' | 'test';
type SecurityHeaders = Readonly<Record<string, string>>;

interface BaseSecurityHeaderOptions {
  readonly baseUrl: string;
  readonly environment: RuntimeEnvironment;
}

export interface BrowserSecurityHeaderOptions extends BaseSecurityHeaderOptions {
  readonly apiBaseUrl: string;
  readonly clientObservabilityEndpoint?: string;
  readonly mapTileOrigins?: readonly string[];
  readonly nonce?: string;
}

export type AdminSecurityHeaderOptions = Omit<BrowserSecurityHeaderOptions, 'mapTileOrigins'>;
export type ApiSecurityHeaderOptions = BaseSecurityHeaderOptions;

export interface RedactSensitiveDataOptions {
  readonly additionalSensitiveKeys?: readonly string[];
  readonly maxDepth?: number;
  readonly replacement?: string;
}

export type MetricLabelValue = boolean | number | string;
export type MetricLabels = Readonly<Record<string, MetricLabelValue>>;

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const noncePattern = /^[A-Za-z0-9+/_=-]{16,256}$/;
const metricLabelNameSet = new Set<string>(SAFE_METRIC_LABEL_NAMES);
const metricLabelNamePattern = /^[a-z][a-z0-9_]{0,63}$/;
const emailLikePattern = /(?:^|[^\w])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?:$|[^\w])/;
const identifierPathSegmentPattern =
  /(?:^|\/)(?:\d{2,}|[0-9a-f]{8,}|[0-9A-HJKMNP-TV-Z]{20,})(?=\/|$)/i;
const highCardinalityValuePattern = /(?:[?&#=]|[0-9a-f]{8}-[0-9a-f-]{27,}|eyJ[A-Za-z0-9_-]{12,})/i;

const sensitiveLogKeys = new Set([
  'authorization',
  'cookie',
  'csrftoken',
  'email',
  'evidence',
  'evidencecontent',
  'evidencereference',
  'evidenceurl',
  'hmacsignature',
  'latitude',
  'longitude',
  'magictoken',
  'originalurl',
  'password',
  'payload',
  'preciselocation',
  'query',
  'rawemail',
  'rawpayload',
  'requesturl',
  'secret',
  'sessiontoken',
  'setcookie',
  'signature',
  'token',
  'url',
  'xcsrftoken',
  'xgoogleformsignature',
]);

const sensitiveLogKeySuffixes = [
  'authorization',
  'cookie',
  'csrftoken',
  'email',
  'latitude',
  'longitude',
  'password',
  'secret',
  'signature',
  'token',
] as const;

export function buildWebSecurityHeaders(options: BrowserSecurityHeaderOptions): SecurityHeaders {
  return buildBrowserSecurityHeaders(options, true);
}

export function buildAdminSecurityHeaders(options: AdminSecurityHeaderOptions): SecurityHeaders {
  return buildBrowserSecurityHeaders(options, false);
}

export function buildApiSecurityHeaders(options: ApiSecurityHeaderOptions): SecurityHeaders {
  const baseUrl = validatedBaseUrl(options.baseUrl, options.environment, 'baseUrl');
  const directives: Readonly<Record<string, readonly string[]>> = {
    'base-uri': ["'none'"],
    'default-src': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  };

  return withCommonSecurityHeaders(
    {
      'Content-Security-Policy': serializeContentSecurityPolicy(directives),
      'Permissions-Policy': disabledPermissionsPolicy(),
    },
    options.environment,
    baseUrl,
  );
}

export function serializeContentSecurityPolicy(
  directives: Readonly<Record<string, readonly string[]>>,
): string {
  return Object.entries(directives)
    .map(([directive, values]) => {
      if (!/^[a-z][a-z-]*$/.test(directive)) {
        throw new Error(`Invalid CSP directive: ${directive}`);
      }
      for (const value of values) {
        if (/[\r\n;]/.test(value)) throw new Error(`Invalid CSP source for ${directive}`);
        if (value.includes('*'))
          throw new Error(`Wildcard CSP source is not allowed for ${directive}`);
      }
      return values.length === 0 ? directive : `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

export function isValidCorrelationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= CORRELATION_ID_MAX_LENGTH &&
    correlationIdPattern.test(value)
  );
}

export function generateCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

export function resolveCorrelationId(
  incomingValue: unknown,
  generate: () => string = generateCorrelationId,
): string {
  if (isValidCorrelationId(incomingValue)) return incomingValue;

  const generated = generate();
  if (!isValidCorrelationId(generated)) {
    throw new Error('Correlation ID generator returned an invalid value');
  }
  return generated;
}

export function redactSensitiveData(
  value: unknown,
  options: RedactSensitiveDataOptions = {},
): unknown {
  const maxDepth = options.maxDepth ?? 12;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 100) {
    throw new Error('maxDepth must be an integer between 0 and 100');
  }

  const replacement = options.replacement ?? REDACTED_LOG_VALUE;
  const additionalSensitiveKeys = new Set(
    (options.additionalSensitiveKeys ?? []).map(normalizeLogKey),
  );
  const seen = new WeakSet<object>();

  return redactValue(value, 0, maxDepth, replacement, additionalSensitiveKeys, seen);
}

export function isSafeMetricLabelName(name: string): boolean {
  return metricLabelNamePattern.test(name) && metricLabelNameSet.has(name);
}

export function areMetricLabelsSafe(labels: MetricLabels): boolean {
  return Object.entries(labels).every(
    ([name, value]) => isSafeMetricLabelName(name) && isSafeMetricLabelValue(value),
  );
}

export function assertSafeMetricLabels(labels: MetricLabels): void {
  if (!areMetricLabelsSafe(labels)) {
    throw new Error(
      'Metric labels must use the bounded allowlist and must not contain dynamic identifiers',
    );
  }
}

function buildBrowserSecurityHeaders(
  options: BrowserSecurityHeaderOptions,
  allowGeolocation: boolean,
): SecurityHeaders {
  const baseUrl = validatedBaseUrl(options.baseUrl, options.environment, 'baseUrl');
  const apiOrigin = validatedBaseUrl(options.apiBaseUrl, options.environment, 'apiBaseUrl').origin;
  const tileOrigins = (options.mapTileOrigins ?? []).map((origin) =>
    validatedExactOrigin(origin, options.environment, 'mapTileOrigins'),
  );
  const observabilityOrigin = observabilityEndpointOrigin(
    options.clientObservabilityEndpoint,
    baseUrl,
    options.environment,
  );
  const nonceSource = options.nonce ? [`'nonce-${validatedNonce(options.nonce)}'`] : [];
  const scriptSources = ["'self'", ...nonceSource];

  if (options.nonce) scriptSources.push("'strict-dynamic'");
  // Static Next.js headers cannot attach a per-request nonce to the inline bootstrap. Keep this
  // compatibility exception only when no nonce is supplied; production never enables unsafe-eval.
  else scriptSources.push("'unsafe-inline'");
  if (options.environment === 'development') {
    scriptSources.push("'unsafe-eval'");
  }

  const connectSources = uniqueSources([
    "'self'",
    apiOrigin,
    ...(observabilityOrigin ? [observabilityOrigin] : []),
    ...(options.environment === 'development' ? ['ws:'] : []),
  ]);
  const directives: Record<string, readonly string[]> = {
    'base-uri': ["'self'"],
    'connect-src': connectSources,
    'default-src': ["'self'"],
    'font-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'img-src': uniqueSources(["'self'", 'blob:', 'data:', ...tileOrigins]),
    'manifest-src': ["'self'"],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'script-src': scriptSources,
    'style-src': ["'self'", "'unsafe-inline'"],
    'worker-src': ["'self'"],
  };
  if (options.environment === 'production') directives['upgrade-insecure-requests'] = [];

  return withCommonSecurityHeaders(
    {
      'Content-Security-Policy': serializeContentSecurityPolicy(directives),
      'Permissions-Policy': allowGeolocation
        ? 'accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
        : disabledPermissionsPolicy(),
    },
    options.environment,
    baseUrl,
  );
}

function withCommonSecurityHeaders(
  surfaceHeaders: Readonly<Record<string, string>>,
  environment: RuntimeEnvironment,
  baseUrl: URL,
): SecurityHeaders {
  const headers: Record<string, string> = {
    ...surfaceHeaders,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
  if (environment === 'production' && baseUrl.protocol === 'https:') {
    headers['Strict-Transport-Security'] = 'max-age=31536000';
  }
  return headers;
}

function disabledPermissionsPolicy(): string {
  return 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';
}

function observabilityEndpointOrigin(
  endpoint: string | undefined,
  baseUrl: URL,
  environment: RuntimeEnvironment,
): string | undefined {
  if (!endpoint || isSafeSameOriginPath(endpoint)) return undefined;

  const endpointUrl = validatedBaseUrl(endpoint, environment, 'clientObservabilityEndpoint');
  if (endpointUrl.origin !== baseUrl.origin) {
    throw new Error('clientObservabilityEndpoint must be same-origin');
  }
  return endpointUrl.origin;
}

function validatedBaseUrl(value: string, environment: RuntimeEnvironment, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP(S)`);
  }
  if (url.username || url.password || url.search || url.hash || url.hostname.includes('*')) {
    throw new Error(`${name} must not contain credentials, wildcards, query, or fragment`);
  }
  if (environment === 'production' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production`);
  }
  if (environment === 'production' && isLocalHostname(url.hostname)) {
    throw new Error(`${name} must not use a local hostname in production`);
  }
  return url;
}

function validatedExactOrigin(
  value: string,
  environment: RuntimeEnvironment,
  name: string,
): string {
  const url = validatedBaseUrl(value, environment, name);
  if (url.pathname !== '/') throw new Error(`${name} entries must be exact origins`);
  return url.origin;
}

function validatedNonce(value: string): string {
  if (!noncePattern.test(value)) throw new Error('nonce has an unsafe format');
  return value;
}

function uniqueSources(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isSafeSameOriginPath(value: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(value);
}

function isLocalHostname(value: string): boolean {
  return /^(?:(?:.+\.)?localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|\[?::(?:1)?\]?)$/i.test(value);
}

function normalizeLogKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function isSensitiveLogKey(key: string, additionalSensitiveKeys: ReadonlySet<string>): boolean {
  const normalized = normalizeLogKey(key);
  return (
    sensitiveLogKeys.has(normalized) ||
    additionalSensitiveKeys.has(normalized) ||
    sensitiveLogKeySuffixes.some((suffix) => normalized.endsWith(suffix))
  );
}

function redactValue(
  value: unknown,
  depth: number,
  maxDepth: number,
  replacement: string,
  additionalSensitiveKeys: ReadonlySet<string>,
  seen: WeakSet<object>,
): unknown {
  if (depth > maxDepth) return '[MaxDepth]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      redactValue(item, depth + 1, maxDepth, replacement, additionalSensitiveKeys, seen),
    );
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = isSensitiveLogKey(key, additionalSensitiveKeys)
      ? replacement
      : redactValue(nestedValue, depth + 1, maxDepth, replacement, additionalSensitiveKeys, seen);
  }
  return redacted;
}

function isSafeMetricLabelValue(value: MetricLabelValue): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Number.isInteger(value);
  if (value.length === 0 || value.length > 100) return false;
  return (
    !emailLikePattern.test(value) &&
    !identifierPathSegmentPattern.test(value) &&
    !highCardinalityValuePattern.test(value)
  );
}
