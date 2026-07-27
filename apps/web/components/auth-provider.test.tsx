import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { Providers } from '../app/providers';
import { useAuth } from './auth-provider';

function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>Konten tamu tetap tampil</p>
      <output>{auth.status}</output>
    </>
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('exposes an unauthenticated memory-only session state', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
  vi.stubEnv('NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED', 'false');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { authenticated: false },
          meta: { generatedAt: new Date().toISOString(), requestId: 'request-id' },
          requestId: 'request-id',
          success: true,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    ),
  );
  render(
    <Providers>
      <Probe />
    </Providers>,
  );
  expect(await screen.findByText('unauthenticated')).toBeVisible();
  expect(window.localStorage).toHaveLength(0);
  expect(window.sessionStorage).toHaveLength(0);
});

it('does not block guest content when the session endpoint is unavailable', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
  vi.stubEnv('NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED', 'false');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  render(
    <Providers>
      <Probe />
    </Providers>,
  );
  expect(screen.getByText('Konten tamu tetap tampil')).toBeVisible();
  expect(await screen.findByText('error')).toBeVisible();
});
