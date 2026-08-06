import { describe, expect, it } from 'vitest';

import {
  areMetricLabelsSafe,
  assertSafeMetricLabels,
  buildAdminSecurityHeaders,
  buildApiSecurityHeaders,
  buildWebSecurityHeaders,
  generateCorrelationId,
  isValidCorrelationId,
  redactSensitiveData,
  resolveCorrelationId,
  serializeContentSecurityPolicy,
} from './security';

describe('browser security headers', () => {
  it('builds a production web CSP with exact origins and no unsafe eval', () => {
    const headers = buildWebSecurityHeaders({
      apiBaseUrl: 'https://api.pitstop.example/api/v1',
      baseUrl: 'https://pitstop.example',
      clientObservabilityEndpoint: '/api/observability/client',
      environment: 'production',
      mapTileOrigins: [
        'https://a.tile.openstreetmap.org',
        'https://b.tile.openstreetmap.org',
        'https://c.tile.openstreetmap.org',
      ],
      nonce: 'MDEyMzQ1Njc4OWFiY2RlZg==',
    });

    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' https://api.pitstop.example",
    );
    expect(headers['Content-Security-Policy']).toContain('https://a.tile.openstreetmap.org');
    expect(headers['Content-Security-Policy']).toContain("'nonce-MDEyMzQ1Njc4OWFiY2RlZg=='");
    expect(headers['Content-Security-Policy']).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).not.toContain('*');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
    expect(headers['Permissions-Policy']).toContain('geolocation=(self)');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('keeps admin geolocation disabled and API content locked down', () => {
    const adminHeaders = buildAdminSecurityHeaders({
      apiBaseUrl: 'https://api.pitstop.example/api/v1',
      baseUrl: 'https://admin.pitstop.example',
      environment: 'production',
    });
    const apiHeaders = buildApiSecurityHeaders({
      baseUrl: 'https://api.pitstop.example',
      environment: 'production',
    });

    expect(adminHeaders['Permissions-Policy']).toContain('geolocation=()');
    expect(adminHeaders['Content-Security-Policy']).toContain("'unsafe-inline'");
    expect(adminHeaders['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(apiHeaders['Content-Security-Policy']).toBe(
      "base-uri 'none'; default-src 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('only emits HSTS for an HTTPS production surface', () => {
    expect(
      buildWebSecurityHeaders({
        apiBaseUrl: 'http://localhost:3002/api/v1',
        baseUrl: 'http://localhost:3000',
        environment: 'development',
      })['Strict-Transport-Security'],
    ).toBeUndefined();
    expect(
      buildWebSecurityHeaders({
        apiBaseUrl: 'https://api.example.test/api/v1',
        baseUrl: 'https://web.example.test',
        environment: 'test',
      })['Strict-Transport-Security'],
    ).toBeUndefined();
  });

  it('allows the exact configured API origin in local development CSP', () => {
    const headers = buildWebSecurityHeaders({
      apiBaseUrl: 'http://localhost:3002/api/v1',
      baseUrl: 'http://localhost:3000',
      clientObservabilityEndpoint: '/api/observability/client',
      environment: 'development',
      mapTileOrigins: [],
    });

    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' http://localhost:3002",
    );
    expect(headers['Content-Security-Policy']).not.toContain('*');
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('rejects wildcard, insecure production, cross-origin telemetry, and CSP injection', () => {
    expect(() =>
      serializeContentSecurityPolicy({ 'connect-src': ["'self'", 'https://*.example.test'] }),
    ).toThrow(/Wildcard/);
    expect(() =>
      buildWebSecurityHeaders({
        apiBaseUrl: 'https://api.example.test/api/v1',
        baseUrl: 'https://web.example.test',
        environment: 'production',
        mapTileOrigins: ['https://*.tile.openstreetmap.org'],
      }),
    ).toThrow(/wildcards/);
    expect(() =>
      buildWebSecurityHeaders({
        apiBaseUrl: 'http://api.example.test/api/v1',
        baseUrl: 'https://web.example.test',
        environment: 'production',
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      buildWebSecurityHeaders({
        apiBaseUrl: 'https://api.example.test/api/v1',
        baseUrl: 'https://localhost:3000',
        environment: 'production',
      }),
    ).toThrow(/local hostname/);
    expect(() =>
      buildWebSecurityHeaders({
        apiBaseUrl: 'https://api.example.test/api/v1',
        baseUrl: 'https://web.example.test',
        clientObservabilityEndpoint: 'https://telemetry.example.test/client',
        environment: 'production',
      }),
    ).toThrow(/same-origin/);
    expect(() =>
      buildWebSecurityHeaders({
        apiBaseUrl: 'https://api.example.test/api/v1',
        baseUrl: 'https://web.example.test',
        environment: 'production',
        nonce: "valid-looking-nonce'; report-uri https://evil.test",
      }),
    ).toThrow(/nonce/);
  });
});

describe('correlation IDs', () => {
  it('accepts bounded safe values and replaces invalid input', () => {
    expect(isValidCorrelationId('request_01J2ABC.def-1')).toBe(true);
    expect(isValidCorrelationId('bad request')).toBe(false);
    expect(isValidCorrelationId('a'.repeat(65))).toBe(false);
    expect(resolveCorrelationId('bad request', () => 'generated-123')).toBe('generated-123');
    expect(resolveCorrelationId('incoming-123', () => 'unused')).toBe('incoming-123');
  });

  it('generates a valid identifier and rejects a broken generator', () => {
    expect(isValidCorrelationId(generateCorrelationId())).toBe(true);
    expect(() => resolveCorrelationId(undefined, () => 'not valid')).toThrow(/generator/);
  });
});

describe('structured logging redaction', () => {
  it('recursively redacts headers, auth material, raw user data, and precise location', () => {
    const input = {
      correlationId: 'safe-correlation-id',
      evidenceUrl: 'https://objects.example/evidence',
      headers: {
        Authorization: 'Bearer secret',
        Cookie: 'pitstop_session=secret',
        'Set-Cookie': 'pitstop_session=secret',
        'X-Csrf-Token': 'csrf-secret',
      },
      nested: {
        email: 'driver@example.test',
        latitude: -6.146_812,
        longitude: 106.806_145,
        payload: { notes: 'sensitive evidence' },
      },
      requestId: 'safe-request-id',
      route: '/api/v1/places/:id',
    };

    expect(redactSensitiveData(input)).toEqual({
      correlationId: 'safe-correlation-id',
      evidenceUrl: '[Redacted]',
      headers: {
        Authorization: '[Redacted]',
        Cookie: '[Redacted]',
        'Set-Cookie': '[Redacted]',
        'X-Csrf-Token': '[Redacted]',
      },
      nested: {
        email: '[Redacted]',
        latitude: '[Redacted]',
        longitude: '[Redacted]',
        payload: '[Redacted]',
      },
      requestId: 'safe-request-id',
      route: '/api/v1/places/:id',
    });
    expect(input.headers.Authorization).toBe('Bearer secret');
  });

  it('supports extra keys and terminates circular input', () => {
    const input: Record<string, unknown> = { customPrivateValue: 'secret' };
    input.self = input;

    expect(
      redactSensitiveData(input, { additionalSensitiveKeys: ['custom_private_value'] }),
    ).toEqual({
      customPrivateValue: '[Redacted]',
      self: '[Circular]',
    });
  });
});

describe('metric label safety', () => {
  it('allows only bounded low-cardinality names and values', () => {
    expect(
      areMetricLabelsSafe({
        method: 'GET',
        outcome: 'success',
        route: '/api/v1/places/:placeId',
        status_code: 200,
      }),
    ).toBe(true);
    expect(() =>
      assertSafeMetricLabels({ method: 'GET', route: '/health/ready', status_class: '2xx' }),
    ).not.toThrow();
  });

  it('rejects identifiers, emails, query strings, and unapproved names', () => {
    expect(areMetricLabelsSafe({ request_id: 'request-123' })).toBe(false);
    expect(areMetricLabelsSafe({ route: '/api/v1/places/12345' })).toBe(false);
    expect(areMetricLabelsSafe({ route: '/search?email=driver@example.test' })).toBe(false);
    expect(areMetricLabelsSafe({ outcome: 'driver@example.test' })).toBe(false);
  });
});
