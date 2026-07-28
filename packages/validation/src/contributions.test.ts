import { describe, expect, it } from 'vitest';

import {
  canContributorTransition,
  canonicalizeContributionDraft,
  contributionIdempotencyKeySchema,
  contributionMapsUrlSchema,
  contributionOperatingHourSchema,
  contributionStepTwoSchema,
  contributionSubmissionSchema,
  normalizeContributionFacilities,
  redactContributionPayload,
} from './contributions';

const completeMealContribution = {
  address: 'Jl. Data Simulasi No. 1, Tambora',
  category: 'MAKAN_MURAH' as const,
  mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
  placeName: 'Warung Data Simulasi',
};

describe('Phase 7 contribution validation', () => {
  it('allows only contributor-owned DRAFT transitions', () => {
    expect(canContributorTransition('DRAFT', 'DRAFT')).toBe(true);
    expect(canContributorTransition('DRAFT', 'PENDING')).toBe(true);
    expect(canContributorTransition('PENDING', 'DRAFT')).toBe(false);
    expect(canContributorTransition('PENDING', 'APPROVED')).toBe(false);
  });

  it('requires menu price data only for budget-relevant categories', () => {
    expect(contributionSubmissionSchema.safeParse(completeMealContribution).success).toBe(true);
    expect(
      contributionSubmissionSchema.safeParse({
        address: 'Jl. Data Simulasi',
        category: 'MAKAN_MURAH',
        placeName: 'Warung tanpa harga',
      }).success,
    ).toBe(false);
    expect(
      contributionSubmissionSchema.safeParse({
        address: 'Jl. Data Simulasi',
        category: 'TOILET',
        placeName: 'Toilet Data Simulasi',
      }).success,
    ).toBe(true);
    expect(
      contributionStepTwoSchema.safeParse({
        category: 'TOILET',
        mainMenu: { name: 'Data tersembunyi', priceAmount: 1_000 },
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer, non-positive, and excessive rupiah prices', () => {
    for (const priceAmount of [0, -1, 1.5, 10_000_001]) {
      expect(
        contributionSubmissionSchema.safeParse({
          ...completeMealContribution,
          mainMenu: { name: 'Nasi telur', priceAmount },
        }).success,
      ).toBe(false);
    }
  });

  it('represents unanswered official facilities as UNKNOWN', () => {
    const facilities = normalizeContributionFacilities([{ code: 'TOILET', status: 'AVAILABLE' }]);
    expect(facilities).toHaveLength(7);
    expect(facilities.find(({ code }) => code === 'TOILET')?.status).toBe('AVAILABLE');
    expect(facilities.find(({ code }) => code === 'WIFI')?.status).toBe('UNKNOWN');
  });

  it('accepts closed, 24-hour, and overnight schedules but rejects invalid modes', () => {
    expect(
      contributionOperatingHourSchema.safeParse({
        closesAt: '02:00',
        dayOfWeek: 1,
        is24Hours: false,
        isClosed: false,
        opensAt: '20:00',
      }).success,
    ).toBe(true);
    expect(
      contributionOperatingHourSchema.safeParse({
        closesAt: null,
        dayOfWeek: 2,
        is24Hours: true,
        isClosed: false,
        opensAt: null,
      }).success,
    ).toBe(true);
    expect(
      contributionOperatingHourSchema.safeParse({
        closesAt: '10:00',
        dayOfWeek: 3,
        is24Hours: false,
        isClosed: true,
        opensAt: '08:00',
      }).success,
    ).toBe(false);
  });

  it('allows only safe Google Maps URLs without credentials', () => {
    expect(contributionMapsUrlSchema.safeParse('https://maps.app.goo.gl/abc123').success).toBe(
      true,
    );
    expect(contributionMapsUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(contributionMapsUrlSchema.safeParse('https://attacker.example/maps').success).toBe(
      false,
    );
    expect(
      contributionMapsUrlSchema.safeParse('https://user:secret@maps.google.com/place').success,
    ).toBe(false);
  });

  it('allows incomplete drafts and rejects incomplete final submission', () => {
    expect(canonicalizeContributionDraft({ placeName: 'Draft saja' })).toMatchObject({
      placeName: 'Draft saja',
      facilities: expect.any(Array),
    });
    expect(contributionSubmissionSchema.safeParse({ placeName: 'Draft saja' }).success).toBe(false);
  });

  it('clears price data when the category no longer supports it', () => {
    expect(
      canonicalizeContributionDraft({
        category: 'TOILET',
        mainMenu: { name: 'Tidak relevan', priceAmount: 1_000 },
      }).mainMenu,
    ).toBeUndefined();
  });

  it('redacts contributor text and location fields from diagnostic payloads', () => {
    const redacted = redactContributionPayload({
      ...completeMealContribution,
      landmark: 'Sebelah rumah pribadi',
      mapsUrl: 'https://maps.google.com/?q=private',
      notes: 'Nomor telepon pribadi',
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('Warung Data Simulasi');
    expect(serialized).not.toContain('Tambora');
    expect(serialized).not.toContain('Nomor telepon');
    expect(serialized).toContain('[REDACTED]');
  });

  it('accepts bounded safe idempotency keys and rejects unsafe or unbounded keys', () => {
    expect(contributionIdempotencyKeySchema.safeParse('submit-key-123').success).toBe(true);
    expect(contributionIdempotencyKeySchema.safeParse('short').success).toBe(false);
    expect(contributionIdempotencyKeySchema.safeParse('contains spaces').success).toBe(false);
    expect(contributionIdempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});
