import { describe, expect, it } from 'vitest';

import {
  calculateVerificationStatus,
  confirmationCanRefresh,
  confirmationExpiresAt,
} from './reports-policy';

const now = new Date('2026-07-30T12:00:00.000Z');

describe('Phase 10 verification policy', () => {
  it('gives a serious pending report stale precedence over every verification source', () => {
    expect(
      calculateVerificationStatus({
        activeConfirmationCount: 10,
        adminVerifiedAt: new Date('2026-07-29T00:00:00.000Z'),
        hasPendingSeriousReport: true,
        latestConfirmationAt: new Date('2026-07-30T00:00:00.000Z'),
        now,
      }),
    ).toBe('STALE');
  });

  it('gives recent admin verification precedence over community confirmations', () => {
    expect(
      calculateVerificationStatus({
        activeConfirmationCount: 3,
        adminVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        hasPendingSeriousReport: false,
        latestConfirmationAt: new Date('2026-07-30T00:00:00.000Z'),
        now,
      }),
    ).toBe('ADMIN_VERIFIED');
  });

  it('requires three unique active confirmations and expires stale state deterministically', () => {
    const input = {
      adminVerifiedAt: null,
      hasPendingSeriousReport: false,
      latestConfirmationAt: new Date('2026-07-29T00:00:00.000Z'),
      now,
    };
    expect(calculateVerificationStatus({ ...input, activeConfirmationCount: 2 })).toBe('STALE');
    expect(calculateVerificationStatus({ ...input, activeConfirmationCount: 3 })).toBe(
      'COMMUNITY_CONFIRMED',
    );
    expect(
      calculateVerificationStatus({
        ...input,
        activeConfirmationCount: 3,
        latestConfirmationAt: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).toBe('STALE');
  });

  it('returns unverified without prior verification evidence', () => {
    expect(
      calculateVerificationStatus({
        activeConfirmationCount: 0,
        adminVerifiedAt: null,
        hasPendingSeriousReport: false,
        latestConfirmationAt: null,
        now,
      }),
    ).toBe('UNVERIFIED');
  });

  it('uses fixed 90-day expiry and a seven-day refresh window', () => {
    const observed = new Date('2026-07-01T00:00:00.000Z');
    expect(confirmationExpiresAt(observed).toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(confirmationCanRefresh(new Date('2026-07-25T00:00:00.000Z'), now)).toBe(false);
    expect(confirmationCanRefresh(new Date('2026-07-22T00:00:00.000Z'), now)).toBe(true);
  });
});
