import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const adminOrigin = 'https://admin.example.test';
const apiBaseUrl = 'https://api.example.test/api/v1';

describe('admin authentication verification bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns the host-only API session cookie from the separate admin origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', apiBaseUrl);
    const sessionCookie =
      'pitstop_session=opaque-session; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600; Secure';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: {
            authenticated: true,
            returnTo: '/admin',
            user: {
              email: 'admin@example.test',
              id: '01K00000000000000000000001',
              role: 'ADMIN',
            },
          },
          meta: {
            generatedAt: '2026-07-29T00:00:00.000Z',
            requestId: 'verify-request',
          },
          requestId: 'verify-request',
          success: true,
        },
        { headers: { 'Set-Cookie': sessionCookie } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = 'a'.repeat(43);

    const response = await GET(
      new NextRequest(`${adminOrigin}/auth/verify?token=${encodeURIComponent(token)}`),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/email/verify`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${adminOrigin}/`);
    expect(response.headers.get('set-cookie')).toBe(sessionCookie);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
  });
});
