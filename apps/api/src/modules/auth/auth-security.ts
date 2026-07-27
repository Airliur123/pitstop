import { createHmac, randomBytes } from 'node:crypto';

import type { AuthRole } from '@pitstop/contracts';
import { authRoleSchema } from '@pitstop/validation';

export const AUTH_SESSION_COOKIE = 'pitstop_session';
export const AUTH_LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-integration-signature',
  'req.body.email',
  'req.body.token',
  'req.query.token',
  'email',
  'password',
  'token',
  'sessionToken',
  'tokenHash',
  'sessionTokenHash',
  'magicLink',
  'mailBody',
] as const;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  if (separator <= 0) return '***';
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function parseAuthRole(value: unknown): AuthRole {
  return authRoleSchema.parse(value);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() !== name) continue;
    const value = segment.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function buildSessionCookie(
  token: string,
  ttlSeconds: number,
  secure: boolean,
  now = new Date(),
): string {
  const expires = new Date(now.getTime() + ttlSeconds * 1_000).toUTCString();
  return [
    `${AUTH_SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${ttlSeconds}`,
    `Expires=${expires}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function buildClearSessionCookie(secure: boolean): string {
  return [
    `${AUTH_SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
