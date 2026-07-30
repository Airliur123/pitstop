import { describe, expect, it } from 'vitest';

import { buildSafePlaceSnapshot, sanitizeAuditMetadata } from './reports-security';

describe('Phase 10 governance privacy', () => {
  it('keeps only bounded allowlisted audit metadata', () => {
    expect(
      sanitizeAuditMetadata({
        changedFields: ['name', 'address'],
        cookie: 'session=secret',
        evidenceUrl: 'https://example.test/private',
        latitude: -6.2,
        placeId: '01K00000000000000000000000',
        reportType: 'OTHER',
        signature: 'secret',
        token: 'secret',
        unknown: 'discarded',
      }),
    ).toEqual({
      changedFields: ['name', 'address'],
      placeId: '01K00000000000000000000000',
      reportType: 'OTHER',
    });
  });

  it('creates limited history snapshots without precise coordinates or auth data', () => {
    const snapshot = buildSafePlaceSnapshot({
      address: 'Jalan Data Simulasi',
      city: 'Jakarta',
      community_confirmation_count: 3,
      description: null,
      district: 'Menteng',
      landmark: null,
      name: 'Place Simulasi',
      place_status: 'ACTIVE',
      postal_code: null,
      province: 'DKI Jakarta',
      verification_status: 'COMMUNITY_CONFIRMED',
    });
    expect(snapshot).toMatchObject({
      communityConfirmationCount: 3,
      name: 'Place Simulasi',
      verificationStatus: 'COMMUNITY_CONFIRMED',
    });
    expect(snapshot).not.toHaveProperty('latitude');
    expect(snapshot).not.toHaveProperty('longitude');
    expect(snapshot).not.toHaveProperty('session');
  });
});
