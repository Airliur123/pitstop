import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AdminMutationTarget,
  createModerationMutationTarget,
  proxyAdminMutation,
} from './mutation-proxy';

const adminOrigin = 'https://admin.example.test';
const apiBaseUrl = 'https://api.example.test/api/v1';
const contributionId = '01K00000000000000000000002';
const sessionCookie = 'pitstop_session=host-only-admin-session';

function adminRequest(
  path: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request(`${adminOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json, application/problem+json',
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      'Idempotency-Key': 'same-origin-proxy-regression',
      Origin: adminOrigin,
      Referer: `${adminOrigin}/contributions/${contributionId}`,
      'X-Correlation-Id': 'correlation-phase-8',
      'X-Csrf-Token': 'csrf-token-if-configured',
      'X-Request-Id': 'request-phase-8',
      ...headers,
    },
    method: 'POST',
  });
}

function moderationTarget(action: string): AdminMutationTarget {
  const target = createModerationMutationTarget(contributionId, action);
  if (!target) throw new Error(`Invalid test moderation action: ${action}`);
  return target;
}

describe('admin same-origin mutation proxy', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_BASE_URL', adminOrigin);
    vi.stubEnv('ADMIN_PORT', '3001');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', apiBaseUrl);
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the host-only admin session for claim, approve, and merge on a separate API host', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('cookie')).toBe(sessionCookie);
      expect(headers.get('origin')).toBe(adminOrigin);
      expect(headers.get('referer')).toBe(`${adminOrigin}/`);
      expect(headers.get('idempotency-key')).toBe('same-origin-proxy-regression');
      expect(headers.get('content-type')).toBe('application/json');
      expect(headers.get('x-correlation-id')).toBe('correlation-phase-8');
      expect(headers.get('x-csrf-token')).toBe('csrf-token-if-configured');
      expect(headers.get('x-request-id')).toBe('request-phase-8');
      expect(headers.has('connection')).toBe(false);
      expect(headers.has('host')).toBe(false);
      expect(headers.has('transfer-encoding')).toBe(false);
      expect(headers.has('upgrade')).toBe(false);
      expect(JSON.parse(new TextDecoder().decode(init?.body as ArrayBuffer))).toHaveProperty(
        'expectedVersion',
      );
      return Response.json(
        { data: { replayed: false }, meta: {}, requestId: 'upstream', success: true },
        {
          headers: {
            'Cache-Control': 'no-store, private',
            'X-Request-Id': 'upstream',
          },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const mutations = [
      ['claim', { expectedVersion: 1 }],
      [
        'approve',
        {
          expectedVersion: 2,
          location: {
            city: 'Jakarta Barat',
            district: 'Tambora',
            latitude: -6.1468,
            longitude: 106.8061,
            postalCode: '11220',
            province: 'DKI Jakarta',
          },
          publicationTarget: { mode: 'CREATE_NEW' },
        },
      ],
      ['merge', { expectedVersion: 3 }],
    ] as const;

    for (const [action, body] of mutations) {
      const response = await proxyAdminMutation(
        adminRequest(`/api/admin/contributions/${contributionId}/${action}`, body),
        moderationTarget(action),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store, private');
      expect(response.headers.get('x-correlation-id')).toBe('correlation-phase-8');
      expect(response.headers.get('x-request-id')).toBe('upstream');
    }

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      mutations.map(([action]) => `${apiBaseUrl}/admin/contributions/${contributionId}/${action}`),
    );
  });

  it('preserves a 401 Problem Details response when the admin-origin request has no session', async () => {
    const upstreamProblem = {
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'A valid authenticated session is required.' },
      requestId: 'upstream-unauthenticated',
      type: 'https://pitstop.local/problems/auth-required',
      title: 'Authentication required',
      status: 401,
      code: 'AUTH_REQUIRED',
      detail: 'A valid authenticated session is required.',
      instance: '/api/v1/admin/contributions',
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(new Headers(init?.headers).has('cookie')).toBe(false);
      return Response.json(upstreamProblem, {
        headers: {
          'Cache-Control': 'no-store, private',
          'Content-Type': 'application/problem+json',
          'X-Request-Id': 'upstream-unauthenticated',
        },
        status: 401,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = adminRequest(`/api/admin/contributions/${contributionId}/claim`, {
      expectedVersion: 1,
    });
    request.headers.delete('cookie');

    const response = await proxyAdminMutation(request, moderationTarget('claim'));

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toEqual(upstreamProblem);
  });

  it('rejects an invalid browser origin before contacting the trusted API', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const request = adminRequest(
      `/api/admin/contributions/${contributionId}/claim`,
      { expectedVersion: 1 },
      {
        Origin: 'https://attacker.example.test',
        Referer: `${adminOrigin}/contributions/${contributionId}`,
      },
    );

    const response = await proxyAdminMutation(request, moderationTarget('claim'));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'CSRF_ORIGIN_INVALID',
      status: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported content types and oversized bodies before upstream fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const textRequest = adminRequest(
      `/api/admin/contributions/${contributionId}/claim`,
      { expectedVersion: 1 },
      { 'Content-Type': 'text/plain' },
    );

    await expect(
      proxyAdminMutation(textRequest, moderationTarget('claim')).then(async (response) => ({
        body: await response.json(),
        status: response.status,
      })),
    ).resolves.toMatchObject({
      body: { code: 'CONTENT_TYPE_UNSUPPORTED' },
      status: 415,
    });

    const oversizedRequest = adminRequest(`/api/admin/contributions/${contributionId}/claim`, {
      evidence: 'x'.repeat(256 * 1_024),
    });
    await expect(
      proxyAdminMutation(oversizedRequest, moderationTarget('claim')).then(async (response) => ({
        body: await response.json(),
        status: response.status,
      })),
    ).resolves.toMatchObject({
      body: { code: 'REQUEST_BODY_TOO_LARGE' },
      status: 413,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces invalid transport identifiers before forwarding or returning them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
      return Response.json({ success: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyAdminMutation(
      adminRequest(
        `/api/admin/contributions/${contributionId}/claim`,
        { expectedVersion: 1 },
        {
          'X-Correlation-Id': `${'a'.repeat(64)}!`,
          'X-Request-Id': `${'b'.repeat(128)}!`,
        },
      ),
      moderationTarget('claim'),
    );

    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the logout Set-Cookie on the admin origin so the host-only session is deleted', async () => {
    const clearCookie =
      'pitstop_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure';
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(new Headers(init?.headers).get('cookie')).toBe(sessionCookie);
      return Response.json(
        {
          data: { authenticated: false },
          meta: {},
          requestId: 'logout-request',
          success: true,
        },
        {
          headers: {
            'Cache-Control': 'no-store, private',
            'Set-Cookie': clearCookie,
            'X-Request-Id': 'logout-request',
          },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyAdminMutation(adminRequest('/api/auth/logout', {}), {
      kind: 'LOGOUT',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe(clearCookie);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/logout`,
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it('does not create an open proxy from invalid IDs or free-form actions', () => {
    expect(createModerationMutationTarget('../auth', 'logout')).toBeNull();
    expect(
      createModerationMutationTarget(contributionId, 'https://attacker.example.test'),
    ).toBeNull();
    expect(createModerationMutationTarget(contributionId, 'reports')).toBeNull();
  });
});
