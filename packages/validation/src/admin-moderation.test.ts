import { describe, expect, it } from 'vitest';

import {
  adminContributionQueueSchema,
  approveContributionSchema,
  canModerateTransition,
  moderationDecisionSchema,
} from './admin-moderation';

describe('admin moderation validation', () => {
  it('normalizes bounded queue filters and rejects inverted dates', () => {
    expect(
      adminContributionQueueSchema.parse({
        limit: '20',
        search: '  WARUNG UJI  ',
        sort: 'SUBMITTED_ASC',
      }),
    ).toMatchObject({
      limit: 20,
      search: 'warung uji',
      sort: 'SUBMITTED_ASC',
    });
    expect(
      adminContributionQueueSchema.safeParse({
        from: '2026-07-30',
        to: '2026-07-29',
      }).success,
    ).toBe(false);
    expect(adminContributionQueueSchema.safeParse({ limit: '20e1' }).success).toBe(false);
  });

  it('rejects short, oversized, and active-markup decision reasons', () => {
    expect(
      moderationDecisionSchema.safeParse({ expectedVersion: 2, reason: 'terlalu' }).success,
    ).toBe(false);
    expect(
      moderationDecisionSchema.safeParse({
        expectedVersion: 2,
        reason: '<script>alert(1)</script>',
      }).success,
    ).toBe(false);
    expect(
      moderationDecisionSchema.safeParse({
        expectedVersion: 2,
        reason: 'Alamat perlu dilengkapi dengan patokan.',
      }).success,
    ).toBe(true);
  });

  it('requires verified coordinates and an explicit publication target', () => {
    const base = {
      expectedVersion: 3,
      location: {
        city: 'Jakarta Barat',
        district: 'Tambora',
        latitude: -6.1468,
        longitude: 106.8061,
        postalCode: '11220',
        province: 'DKI Jakarta',
      },
    };
    expect(
      approveContributionSchema.safeParse({
        ...base,
        publicationTarget: { mode: 'CREATE_NEW' },
      }).success,
    ).toBe(true);
    expect(
      approveContributionSchema.safeParse({
        ...base,
        publicationTarget: { mode: 'MERGE_EXISTING' },
      }).success,
    ).toBe(false);
    expect(
      approveContributionSchema.safeParse({
        ...base,
        location: { ...base.location, latitude: 91 },
        publicationTarget: { mode: 'CREATE_NEW' },
      }).success,
    ).toBe(false);
  });

  it('encodes only the accepted state-machine transitions', () => {
    expect(canModerateTransition('PENDING', 'IN_REVIEW')).toBe(true);
    expect(canModerateTransition('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(canModerateTransition('APPROVED', 'MERGED')).toBe(true);
    expect(canModerateTransition('PENDING', 'APPROVED')).toBe(false);
    expect(canModerateTransition('MERGED', 'IN_REVIEW')).toBe(false);
  });
});
