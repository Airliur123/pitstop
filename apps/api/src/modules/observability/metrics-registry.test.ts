import { describe, expect, it } from 'vitest';

import { metricRouteTemplate, MetricsRegistry } from './metrics-registry';

describe('MetricsRegistry', () => {
  it('renders bounded counters and histograms without high-cardinality labels', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('pitstop_api_requests_total', {
      method: 'GET',
      route: '/api/v1/public/categories',
      status_class: '2xx',
    });
    metrics.observe(
      'pitstop_api_request_duration_seconds',
      { method: 'GET', route: '/api/v1/public/categories' },
      0.02,
    );

    const rendered = metrics.render();
    expect(rendered).toContain(
      'pitstop_api_requests_total{method="GET",route="/api/v1/public/categories",status_class="2xx"} 1',
    );
    expect(rendered).toContain('pitstop_api_request_duration_seconds_count');
    expect(rendered).not.toContain('requestId');
    expect(rendered).not.toContain('userId');
  });

  it('rejects undeclared or unsafe labels', () => {
    const metrics = new MetricsRegistry();

    expect(() =>
      metrics.increment('pitstop_api_requests_total', {
        method: 'GET',
        requestId: 'attacker-controlled',
        route: '/health/live',
        status_class: '2xx',
      }),
    ).toThrow(/Invalid labels/);
    expect(() =>
      metrics.increment('pitstop_api_requests_total', {
        method: 'GET',
        route: `/${'x'.repeat(200)}`,
        status_class: '2xx',
      }),
    ).toThrow(/bounded/);
    expect(() =>
      metrics.increment('pitstop_api_requests_total', {
        method: 'GET',
        route: '/users/8b714fef-e4c4-4fb8-970f-044f9e69d94c',
        status_class: '2xx',
      }),
    ).toThrow(/dynamic identifiers/);
  });

  it('normalizes raw URLs and token-shaped paths away from metric labels', () => {
    expect(metricRouteTemplate('/api/v1/public/places/:slug')).toBe('/api/v1/public/places/:slug');
    expect(metricRouteTemplate('/auth/verify?token=secret')).toBe('unmatched');
    expect(metricRouteTemplate(undefined)).toBe('unmatched');
  });
});
