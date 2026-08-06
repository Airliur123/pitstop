export const PWA_CACHE_FAMILY = 'pitstop-web';
export const PWA_CACHE_VERSION = 'v1';
export const PWA_CACHE_NAMESPACE = `${PWA_CACHE_FAMILY}-${PWA_CACHE_VERSION}`;

export const PWA_CACHE_NAMES = {
  precache: `${PWA_CACHE_NAMESPACE}-precache`,
  publicApi: `${PWA_CACHE_NAMESPACE}-public-api`,
  staticAssets: `${PWA_CACHE_NAMESPACE}-static`,
} as const;

const HASHED_STATIC_FILE = /(?:^|[-.])[a-f0-9]{8,}(?:[-.]|$)/i;
const DISALLOWED_CACHE_CONTROL =
  /(?:^|,)\s*(?:must-revalidate|no-cache|no-store|private)(?:\s*(?:=|,|$))/i;
const SENSITIVE_REQUEST_HEADERS = [
  'authorization',
  'cookie',
  'x-csrf-token',
  'x-google-form-signature',
  'x-integration-signature',
  'x-pitstop-key-id',
  'x-pitstop-signature',
  'x-xsrf-token',
] as const;
const LEGACY_UNSAFE_CACHE_NAMES = new Set([
  'apis',
  'next-data',
  'others',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
  'start-url',
]);

function normalizedApiPath(apiBaseUrl: URL) {
  return `${apiBaseUrl.pathname.replace(/\/+$/, '')}/public/categories`;
}

function isLegacyUnsafeCache(cacheName: string) {
  return LEGACY_UNSAFE_CACHE_NAMES.has(cacheName) || cacheName.startsWith('serwist-');
}

export function hasSensitiveRequestHeaders(request: Request) {
  const cacheControl = request.headers.get('cache-control') ?? '';
  return (
    SENSITIVE_REQUEST_HEADERS.some((header) => request.headers.has(header)) ||
    DISALLOWED_CACHE_CONTROL.test(cacheControl) ||
    request.headers.has('pragma')
  );
}

export function isHashedStaticRequest(request: Request, sameOrigin: boolean) {
  if (!sameOrigin || request.method !== 'GET' || hasSensitiveRequestHeaders(request)) return false;

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/_next/static/')) return false;

  const fileName = url.pathname.split('/').at(-1);
  return fileName !== undefined && HASHED_STATIC_FILE.test(fileName);
}

export function isPublicCategoriesRequest(request: Request, configuredApiBaseUrl: string) {
  if (
    request.method !== 'GET' ||
    request.credentials !== 'omit' ||
    hasSensitiveRequestHeaders(request)
  ) {
    return false;
  }

  try {
    const requestUrl = new URL(request.url);
    const apiBaseUrl = new URL(configuredApiBaseUrl);
    return (
      requestUrl.origin === apiBaseUrl.origin &&
      requestUrl.pathname === normalizedApiPath(apiBaseUrl) &&
      requestUrl.search === ''
    );
  } catch {
    return false;
  }
}

export function isResponseSafeToCache(response: Response, expectedContentType?: string) {
  if (response.status !== 200 || response.type === 'opaque') return false;
  if (response.headers.has('set-cookie')) return false;

  const cacheControl = response.headers.get('cache-control') ?? '';
  if (DISALLOWED_CACHE_CONTROL.test(cacheControl)) return false;
  if (response.headers.get('vary')?.trim() === '*') return false;

  if (expectedContentType) {
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (contentType !== expectedContentType) return false;
  }

  return true;
}

export function shouldDeleteOutdatedPwaCache(cacheName: string) {
  return (
    isLegacyUnsafeCache(cacheName) ||
    (cacheName.startsWith(`${PWA_CACHE_FAMILY}-`) &&
      !cacheName.startsWith(`${PWA_CACHE_NAMESPACE}-`))
  );
}

export function shouldPurgeCacheOnLogout(cacheName: string) {
  if (isLegacyUnsafeCache(cacheName)) return true;
  if (!cacheName.startsWith(`${PWA_CACHE_FAMILY}-`)) return false;

  const isCurrentPrecache = cacheName === PWA_CACHE_NAMES.precache;
  const isCurrentStaticCache = cacheName === PWA_CACHE_NAMES.staticAssets;
  return !isCurrentPrecache && !isCurrentStaticCache;
}
