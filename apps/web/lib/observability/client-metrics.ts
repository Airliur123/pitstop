export type SafeClientMetricName =
  'CLS' | 'INP' | 'LCP' | 'navigation_failure' | 'service_worker_failure';

export interface SafeClientMetric {
  readonly code?: string;
  readonly name: SafeClientMetricName;
  readonly rating?: 'good' | 'needs-improvement' | 'poor';
  readonly value: number;
}

const WEB_VITAL_NAMES = new Set<SafeClientMetricName>(['CLS', 'INP', 'LCP']);
const SAFE_EVENT_CODES = new Set(['activation', 'registration', 'update', 'unhandled_rejection']);
const CLIENT_METRICS_PATH = /^\/api\/[A-Za-z0-9/_-]+$/;

export function safeWebVital(
  name: string,
  value: number,
  rating: string | undefined,
): SafeClientMetric | null {
  if (!WEB_VITAL_NAMES.has(name as SafeClientMetricName) || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const safeRating =
    rating === 'good' || rating === 'needs-improvement' || rating === 'poor' ? rating : undefined;
  return {
    name: name as SafeClientMetricName,
    ...(safeRating ? { rating: safeRating } : {}),
    value,
  };
}

export function safeOperationalMetric(
  name: Extract<SafeClientMetricName, 'navigation_failure' | 'service_worker_failure'>,
  code: string,
): SafeClientMetric | null {
  if (!SAFE_EVENT_CODES.has(code)) return null;
  return { code, name, value: 1 };
}

export function resolveClientMetricsEndpoint(
  configuredEndpoint: string | undefined,
  currentOrigin: string,
) {
  if (!configuredEndpoint) return null;

  try {
    const endpoint = new URL(configuredEndpoint, currentOrigin);
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.origin !== currentOrigin ||
      !CLIENT_METRICS_PATH.test(endpoint.pathname)
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

export function routeTemplateForPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  switch (segments[0]) {
    case 'activity':
    case 'contribute':
    case 'login':
    case 'offline':
    case 'places':
      if (segments[0] === 'places' && segments.length === 2) return '/places/[slug]';
      if (segments[0] === 'places' && segments.length === 3 && segments[2] === 'report') {
        return '/places/[slug]/report';
      }
      return segments.length === 1 ? `/${segments[0]}` : '/other';
    case 'contributions':
    case 'reports':
      if (segments.length === 2) return `/${segments[0]}/[id]`;
      if (segments.length === 3 && segments[2] === 'success') {
        return `/${segments[0]}/[id]/success`;
      }
      return '/other';
    case 'auth':
      return segments.length === 2 && segments[1] === 'verify' ? '/auth/verify' : '/other';
    default:
      return '/other';
  }
}
