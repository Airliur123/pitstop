import { randomUUID } from 'node:crypto';

import { magicLinkVerifySchema, safeAuthReturnTo } from '@pitstop/validation';
import { type NextRequest, NextResponse } from 'next/server';

import { normalizeApiBaseUrl } from '../../../lib/api/client';
import {
  magicLinkVerificationResponseSchema,
  problemDetailsSchema,
} from '../../../lib/api/schemas';

export const dynamic = 'force-dynamic';

function trustedWebDestination(path: string) {
  const configuredBaseUrl = process.env.WEB_BASE_URL;
  if (!configuredBaseUrl) throw new Error('WEB_BASE_URL is required');
  return new URL(path, configuredBaseUrl);
}

interface RequestContext {
  readonly correlationId: string;
  readonly requestId: string;
}

function requestContext(request: NextRequest): RequestContext {
  const requestId = safeIdentifier(request.headers.get('x-request-id'), 128, true) ?? randomUUID();
  const correlationId =
    safeIdentifier(request.headers.get('x-correlation-id'), 64, false) ??
    safeIdentifier(requestId, 64, false) ??
    randomUUID();
  return { correlationId, requestId };
}

function privateResponse(response: NextResponse, context: RequestContext): NextResponse {
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Correlation-Id', context.correlationId);
  response.headers.set('X-Request-Id', context.requestId);
  return response;
}

function loginRedirect(state: 'expired' | 'invalid' | 'unavailable', context: RequestContext) {
  const destination = trustedWebDestination('/login');
  destination.searchParams.set('state', state);
  return privateResponse(NextResponse.redirect(destination, 303), context);
}

export async function GET(request: NextRequest) {
  const context = requestContext(request);
  const parsedToken = magicLinkVerifySchema.safeParse({
    token: request.nextUrl.searchParams.get('token'),
  });
  if (!parsedToken.success) return loginRedirect('invalid', context);

  try {
    const apiResponse = await fetch(
      `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/auth/email/verify`,
      {
        body: JSON.stringify(parsedToken.data),
        cache: 'no-store',
        headers: {
          Accept: 'application/json, application/problem+json',
          'Content-Type': 'application/json',
          'X-Correlation-Id': context.correlationId,
          'X-Request-Id': context.requestId,
        },
        method: 'POST',
      },
    );
    const payload: unknown = await apiResponse.json();
    if (!apiResponse.ok) {
      const problem = problemDetailsSchema.safeParse(payload);
      return loginRedirect(
        problem.success && problem.data.code === 'AUTH_TOKEN_EXPIRED' ? 'expired' : 'invalid',
        context,
      );
    }
    const verification = magicLinkVerificationResponseSchema.safeParse(payload);
    const sessionCookie = apiResponse.headers.get('set-cookie');
    if (!verification.success || !sessionCookie) return loginRedirect('unavailable', context);

    const destination = trustedWebDestination(safeAuthReturnTo(verification.data.data.returnTo));
    const response = privateResponse(NextResponse.redirect(destination, 303), context);
    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch {
    return loginRedirect('unavailable', context);
  }
}

function safeIdentifier(
  value: string | null,
  maxLength: number,
  allowColon: boolean,
): string | null {
  const pattern = allowColon
    ? /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*)$/
    : /^[A-Za-z0-9](?:[A-Za-z0-9._-]*)$/;
  return value !== null && value.length <= maxLength && pattern.test(value) ? value : null;
}
