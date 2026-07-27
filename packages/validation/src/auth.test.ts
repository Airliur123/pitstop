import { describe, expect, it } from 'vitest';

import {
  authEmailSchema,
  authRoleSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  normalizeEmail,
  safeAuthReturnTo,
} from './auth';

describe('authentication validation', () => {
  it('normalizes compatible Unicode, whitespace, and email case consistently', () => {
    expect(normalizeEmail('  ＵＳＥＲ@Example.TEST  ')).toBe('user@example.test');
    expect(authEmailSchema.parse(' Person@Example.TEST ')).toBe('person@example.test');
  });

  it('rejects malformed and oversized email input', () => {
    expect(authEmailSchema.safeParse('not-an-email').success).toBe(false);
    expect(authEmailSchema.safeParse(`${'a'.repeat(310)}@example.test`).success).toBe(false);
  });

  it('allows only explicit internal return destinations', () => {
    expect(safeAuthReturnTo('/activity')).toBe('/activity');
    expect(safeAuthReturnTo('https://attacker.example')).toBe('/');
    expect(safeAuthReturnTo('//attacker.example')).toBe('/');
    expect(magicLinkRequestSchema.parse({ email: 'user@example.test' }).returnTo).toBe('/');
  });

  it('keeps roles and opaque-token shape strict', () => {
    expect(authRoleSchema.parse('ADMIN')).toBe('ADMIN');
    expect(authRoleSchema.safeParse('OWNER').success).toBe(false);
    expect(magicLinkVerifySchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(magicLinkVerifySchema.safeParse({ token: 'x'.repeat(43) }).success).toBe(true);
  });
});
