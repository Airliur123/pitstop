import { describe, expect, it } from 'vitest';

import {
  AUTH_LOG_REDACTION_PATHS,
  AUTH_SESSION_COOKIE,
  buildClearSessionCookie,
  buildSessionCookie,
  generateOpaqueToken,
  hashOpaqueToken,
  maskEmail,
  readCookie,
} from './auth-security';

describe('auth security primitives', () => {
  it('generates high-entropy URL-safe opaque tokens', () => {
    const tokens = new Set(Array.from({ length: 128 }, generateOpaqueToken));
    expect(tokens.size).toBe(128);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('uses a keyed deterministic hash without retaining the raw token', () => {
    const hash = hashOpaqueToken('raw-token', 'secret-one');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('raw-token');
    expect(hashOpaqueToken('raw-token', 'secret-one')).toBe(hash);
    expect(hashOpaqueToken('raw-token', 'secret-two')).not.toBe(hash);
  });

  it('builds HttpOnly SameSite cookies and an equivalent clear cookie', () => {
    const cookie = buildSessionCookie('opaque', 3_600, true, new Date('2026-01-01T00:00:00Z'));
    expect(cookie).toContain(`${AUTH_SESSION_COOKIE}=opaque`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Expires=Thu, 01 Jan 2026 01:00:00 GMT');
    expect(cookie).not.toContain('Domain=');
    expect(buildClearSessionCookie(true)).toContain('Max-Age=0');
    expect(buildClearSessionCookie(true)).not.toContain('Domain=');
    expect(readCookie(`other=1; ${AUTH_SESSION_COOKIE}=opaque`, AUTH_SESSION_COOKIE)).toBe(
      'opaque',
    );
  });

  it('keeps local HTTP compatible without weakening the production cookie', () => {
    const localCookie = buildSessionCookie(
      'local-session',
      60,
      false,
      new Date('2026-01-01T00:00:00Z'),
    );
    const productionCookie = buildSessionCookie(
      'production-session',
      60,
      true,
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(localCookie).not.toContain('Secure');
    expect(productionCookie).toContain('Secure');
    expect(productionCookie).not.toContain('Domain=');
    expect(localCookie).toContain('HttpOnly');
    expect(localCookie).toContain('SameSite=Lax');
  });

  it('masks identity data and declares every authentication log surface for redaction', () => {
    expect(maskEmail('someone@example.test')).toBe('so*****@example.test');
    expect(AUTH_LOG_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.cookie',
        'req.body.email',
        'req.body.token',
        'req.query.token',
        'tokenHash',
        'sessionTokenHash',
      ]),
    );
  });
});
