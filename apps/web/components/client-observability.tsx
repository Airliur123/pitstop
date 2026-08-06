'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useCallback, useEffect } from 'react';

import {
  resolveClientMetricsEndpoint,
  routeTemplateForPathname,
  type SafeClientMetric,
  safeOperationalMetric,
  safeWebVital,
} from '../lib/observability/client-metrics';

export function reportClientMetric(metric: SafeClientMetric) {
  if (process.env.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED !== 'true') return;
  const endpoint = resolveClientMetricsEndpoint(
    process.env.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT,
    window.location.origin,
  );
  if (!endpoint) return;

  void fetch(endpoint, {
    body: JSON.stringify({
      ...metric,
      route: routeTemplateForPathname(window.location.pathname),
    }),
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
}

export function reportServiceWorkerFailure(code: 'activation' | 'registration' | 'update') {
  const metric = safeOperationalMetric('service_worker_failure', code);
  if (metric) reportClientMetric(metric);
}

export function ClientObservability() {
  if (process.env.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED !== 'true') return null;
  return <EnabledClientObservability />;
}

function EnabledClientObservability() {
  const reportWebVital = useCallback(
    (metric: { readonly name: string; readonly rating?: string; readonly value: number }) => {
      const safeMetric = safeWebVital(metric.name, metric.value, metric.rating);
      if (safeMetric) reportClientMetric(safeMetric);
    },
    [],
  );
  useReportWebVitals(reportWebVital);

  useEffect(() => {
    const reportNavigationFailure = () => {
      const metric = safeOperationalMetric('navigation_failure', 'unhandled_rejection');
      if (metric) reportClientMetric(metric);
    };
    window.addEventListener('unhandledrejection', reportNavigationFailure);
    return () => window.removeEventListener('unhandledrejection', reportNavigationFailure);
  }, []);

  return null;
}
