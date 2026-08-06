import { describe, expect, it } from 'vitest';

import {
  resolveClientMetricsEndpoint,
  routeTemplateForPathname,
  safeOperationalMetric,
  safeWebVital,
} from './client-metrics';

describe('safe client observability', () => {
  it('only admits the required numeric Web Vitals', () => {
    expect(safeWebVital('LCP', 1234, 'good')).toEqual({
      name: 'LCP',
      rating: 'good',
      value: 1234,
    });
    expect(safeWebVital('CLS', 0.05, 'unknown')).toEqual({ name: 'CLS', value: 0.05 });
    expect(safeWebVital('FCP', 100, 'good')).toBeNull();
    expect(safeWebVital('INP', Number.NaN, 'poor')).toBeNull();
  });

  it('uses bounded event codes and strips resource identifiers through route templates', () => {
    expect(safeOperationalMetric('service_worker_failure', 'registration')).toEqual({
      code: 'registration',
      name: 'service_worker_failure',
      value: 1,
    });
    expect(safeOperationalMetric('navigation_failure', 'raw secret')).toBeNull();
    expect(routeTemplateForPathname('/places/private-slug?token=secret')).toBe('/places/[slug]');
    expect(routeTemplateForPathname('/reports/01PRIVATE/success')).toBe('/reports/[id]/success');
    expect(routeTemplateForPathname('/unexpected/private-value')).toBe('/other');
  });

  it('allows only query-free same-origin API receiver paths', () => {
    const origin = 'https://pitstop.example';
    expect(resolveClientMetricsEndpoint('/api/observability/client', origin)).toBe(
      'https://pitstop.example/api/observability/client',
    );
    expect(
      resolveClientMetricsEndpoint('https://telemetry.example/api/observability/client', origin),
    ).toBeNull();
    expect(
      resolveClientMetricsEndpoint('/api/observability/client?token=secret', origin),
    ).toBeNull();
    expect(resolveClientMetricsEndpoint('/collect', origin)).toBeNull();
  });
});
