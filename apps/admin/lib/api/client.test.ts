import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logoutAdmin, mutateContribution, requestMagicLink } from './client';

const contributionId = '01K00000000000000000000002';
const actions = ['approve', 'claim', 'merge', 'needs-revision', 'reject'] as const;

function unauthorizedResponse(): Response {
  return Response.json(
    {
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' },
      requestId: 'same-origin-client-test',
      type: 'https://pitstop.local/problems/auth-required',
      title: 'Authentication required',
      status: 401,
      code: 'AUTH_REQUIRED',
      detail: 'Authentication required.',
      instance: '/api/v1/admin/contributions',
    },
    {
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Request-Id': 'same-origin-client-test',
      },
      status: 401,
    },
  );
}

describe('admin browser API client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async () => unauthorizedResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  it('uses only relative same-origin endpoints for every browser mutation', async () => {
    await expect(requestMagicLink('admin@example.test')).rejects.toMatchObject({ status: 401 });
    await expect(logoutAdmin()).rejects.toMatchObject({ status: 401 });
    for (const action of actions) {
      await expect(
        mutateContribution(contributionId, action, { expectedVersion: 1 }, `key-${action}`),
      ).rejects.toMatchObject({ status: 401 });
    }

    const calls = fetchMock.mock.calls;
    expect(calls.map(([input]) => input)).toEqual([
      '/api/auth/email/request',
      '/api/auth/logout',
      ...actions.map((action) => `/api/admin/contributions/${contributionId}/${action}`),
    ]);
    for (const [, init] of calls) {
      expect(init).toMatchObject({
        credentials: 'same-origin',
        method: 'POST',
      });
    }
    expect(calls.every(([input]) => !String(input).startsWith('http'))).toBe(true);
  });
});
