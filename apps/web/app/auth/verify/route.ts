import { magicLinkVerifySchema, safeAuthReturnTo } from '@pitstop/validation';
import { type NextRequest, NextResponse } from 'next/server';

import { normalizeApiBaseUrl } from '../../../lib/api/client';
import {
  magicLinkVerificationResponseSchema,
  problemDetailsSchema,
} from '../../../lib/api/schemas';

export const dynamic = 'force-dynamic';

function loginRedirect(request: NextRequest, state: 'expired' | 'invalid' | 'unavailable') {
  const destination = new URL('/login', request.url);
  destination.searchParams.set('state', state);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export async function GET(request: NextRequest) {
  const parsedToken = magicLinkVerifySchema.safeParse({
    token: request.nextUrl.searchParams.get('token'),
  });
  if (!parsedToken.success) return loginRedirect(request, 'invalid');

  try {
    const apiResponse = await fetch(
      `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/auth/email/verify`,
      {
        body: JSON.stringify(parsedToken.data),
        cache: 'no-store',
        headers: {
          Accept: 'application/json, application/problem+json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );
    const payload: unknown = await apiResponse.json();
    if (!apiResponse.ok) {
      const problem = problemDetailsSchema.safeParse(payload);
      return loginRedirect(
        request,
        problem.success && problem.data.code === 'AUTH_TOKEN_EXPIRED' ? 'expired' : 'invalid',
      );
    }
    const verification = magicLinkVerificationResponseSchema.safeParse(payload);
    const sessionCookie = apiResponse.headers.get('set-cookie');
    if (!verification.success || !sessionCookie) return loginRedirect(request, 'unavailable');

    const destination = new URL(safeAuthReturnTo(verification.data.data.returnTo), request.url);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch {
    return loginRedirect(request, 'unavailable');
  }
}
