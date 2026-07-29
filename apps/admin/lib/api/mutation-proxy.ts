import { randomUUID } from 'node:crypto';

import { parseAdminEnvironment } from '@pitstop/config';

const moderationActions = ['approve', 'claim', 'merge', 'needs-revision', 'reject'] as const;
const moderationActionSet = new Set<string>(moderationActions);
const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const forwardedRequestHeaders = [
  'accept',
  'content-type',
  'cookie',
  'idempotency-key',
  'x-correlation-id',
  'x-csrf-token',
  'x-request-id',
  'x-xsrf-token',
] as const;
const forwardedResponseHeaders = [
  'cache-control',
  'content-type',
  'pragma',
  'retry-after',
  'x-request-id',
] as const;

export type ModerationMutationAction = (typeof moderationActions)[number];

export type AdminMutationTarget =
  | Readonly<{ kind: 'MAGIC_LINK_REQUEST' }>
  | Readonly<{ kind: 'LOGOUT' }>
  | Readonly<{
      action: ModerationMutationAction;
      contributionId: string;
      kind: 'MODERATION';
    }>;

interface TrustedMutationProxyConfiguration {
  readonly adminOrigin: string;
  readonly apiBaseUrl: string;
}

export function createModerationMutationTarget(
  contributionId: string,
  action: string,
): AdminMutationTarget | null {
  if (!ulid.test(contributionId) || !moderationActionSet.has(action)) return null;
  return {
    action: action as ModerationMutationAction,
    contributionId,
    kind: 'MODERATION',
  };
}

export async function proxyAdminMutation(
  request: Request,
  target: AdminMutationTarget,
): Promise<Response> {
  let configuration: TrustedMutationProxyConfiguration;
  try {
    configuration = trustedMutationProxyConfiguration(process.env);
  } catch {
    return problemResponse(request, {
      code: 'ADMIN_PROXY_CONFIGURATION_INVALID',
      detail: 'The admin mutation proxy is not configured safely.',
      status: 503,
      title: 'Admin proxy unavailable',
    });
  }

  if (requestOrigin(request) !== configuration.adminOrigin) {
    return problemResponse(request, {
      code: 'CSRF_ORIGIN_INVALID',
      detail: 'The request origin could not be verified.',
      status: 403,
      title: 'Untrusted request origin',
    });
  }

  const headers = new Headers();
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set('origin', configuration.adminOrigin);
  headers.set('referer', `${configuration.adminOrigin}/`);

  try {
    const upstream = await fetch(`${configuration.apiBaseUrl}${targetPath(target)}`, {
      body: await request.arrayBuffer(),
      cache: 'no-store',
      headers,
      method: 'POST',
      redirect: 'manual',
    });
    return upstreamResponse(upstream);
  } catch {
    return problemResponse(request, {
      code: 'ADMIN_PROXY_UPSTREAM_UNAVAILABLE',
      detail: 'The admin API could not be reached.',
      status: 502,
      title: 'Admin API unavailable',
    });
  }
}

export function problemResponse(
  request: Request,
  problem: Readonly<{
    code: string;
    detail: string;
    status: number;
    title: string;
  }>,
): Response {
  const requestId = safeRequestId(request.headers.get('x-request-id')) ?? randomUUID();
  const instance = new URL(request.url).pathname;
  return Response.json(
    {
      success: false,
      error: { code: problem.code, message: problem.detail },
      requestId,
      type: `https://pitstop.local/problems/${problem.code.toLowerCase().replaceAll('_', '-')}`,
      title: problem.title,
      status: problem.status,
      code: problem.code,
      detail: problem.detail,
      instance,
    },
    {
      headers: privateResponseHeaders('application/problem+json', requestId),
      status: problem.status,
    },
  );
}

function trustedMutationProxyConfiguration(
  environment: NodeJS.ProcessEnv,
): TrustedMutationProxyConfiguration {
  const parsed = parseAdminEnvironment(environment);
  const apiBaseUrl = normalizedHttpUrl(parsed.NEXT_PUBLIC_API_BASE_URL);
  const adminBaseUrl = normalizedHttpUrl(parsed.ADMIN_BASE_URL);
  return {
    adminOrigin: new URL(adminBaseUrl).origin,
    apiBaseUrl,
  };
}

function normalizedHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) service URLs are supported');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function requestOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (origin !== null) return normalizedOrigin(origin);
  const referer = request.headers.get('referer');
  return referer === null ? null : normalizedOrigin(referer);
}

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function targetPath(target: AdminMutationTarget): string {
  switch (target.kind) {
    case 'MAGIC_LINK_REQUEST':
      return '/auth/email/request';
    case 'LOGOUT':
      return '/auth/logout';
    case 'MODERATION':
      return `/admin/contributions/${encodeURIComponent(target.contributionId)}/${target.action}`;
  }
}

function upstreamResponse(upstream: Response): Response {
  const headers = new Headers();
  for (const name of forwardedResponseHeaders) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie !== null) headers.append('set-cookie', setCookie);
  headers.set('cache-control', 'no-store, private');
  headers.set('pragma', 'no-cache');
  return new Response(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

function privateResponseHeaders(contentType: string, requestId: string): Headers {
  return new Headers({
    'cache-control': 'no-store, private',
    'content-type': contentType,
    pragma: 'no-cache',
    'x-request-id': requestId,
  });
}

function safeRequestId(value: string | null): string | null {
  if (value === null || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}
