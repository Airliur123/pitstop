import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('redirects an invalid token to the configured web origin, not the request Host', async () => {
  vi.stubEnv('WEB_BASE_URL', 'https://pitstop.example');

  const response = await GET(
    new NextRequest('https://attacker.example/auth/verify', {
      headers: {
        'X-Correlation-Id': 'browser-correlation',
        'X-Request-Id': 'browser-request',
      },
    }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://pitstop.example/login?state=invalid');
  expect(response.headers.get('cache-control')).toBe('no-store, private');
  expect(response.headers.get('x-correlation-id')).toBe('browser-correlation');
  expect(response.headers.get('x-request-id')).toBe('browser-request');
});
