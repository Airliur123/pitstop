import { describe, expect, it } from 'vitest';

import {
  activityQuerySchema,
  approvedPlacePatchSchema,
  canTransitionReport,
  confirmationSchema,
  createReportSchema,
  reportIdempotencyKeySchema,
} from './reports';

const placeId = '01K00000000000000000000000';

describe('Phase 10 report validation', () => {
  it('accepts a structured report and rejects status or arbitrary patch mass assignment', () => {
    const valid = {
      expectedPlaceVersion: 3,
      explanation: 'Alamat Place ini sudah berubah sejak kunjungan terakhir.',
      proposedChange: {
        address: 'Jalan Data Simulasi Nomor 10',
        kind: 'LOCATION_INCORRECT',
      },
      reportType: 'LOCATION_INCORRECT',
    };
    expect(createReportSchema.safeParse(valid).success).toBe(true);
    expect(createReportSchema.safeParse({ ...valid, status: 'APPLIED' }).success).toBe(false);
    expect(
      createReportSchema.safeParse({
        ...valid,
        proposedChange: { ...valid.proposedChange, deletedAt: '2026-01-01' },
      }).success,
    ).toBe(false);
  });

  it('rejects HTML, unsafe evidence URLs, inconsistent types, and stale versions', () => {
    const base = {
      expectedPlaceVersion: 1,
      explanation: 'Keterangan faktual yang cukup panjang untuk diperiksa.',
      proposedChange: { kind: 'OTHER', name: 'Nama baru' },
      reportType: 'OTHER',
    } as const;
    expect(
      createReportSchema.safeParse({ ...base, explanation: '<script>alert(1)</script>' }).success,
    ).toBe(false);
    expect(
      createReportSchema.safeParse({ ...base, evidenceUrl: 'http://127.0.0.1/private' }).success,
    ).toBe(false);
    expect(
      createReportSchema.safeParse({
        ...base,
        proposedChange: { kind: 'OTHER', name: 'Baru' },
        reportType: 'PRICE_CHANGED',
      }).success,
    ).toBe(false);
    expect(createReportSchema.safeParse({ ...base, expectedPlaceVersion: 0 }).success).toBe(false);
  });

  it('enforces the report transition matrix', () => {
    expect(canTransitionReport('PENDING', 'IN_REVIEW')).toBe(true);
    expect(canTransitionReport('IN_REVIEW', 'APPLIED')).toBe(true);
    expect(canTransitionReport('IN_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransitionReport('PENDING', 'APPLIED')).toBe(false);
    expect(canTransitionReport('APPLIED', 'PENDING')).toBe(false);
    expect(canTransitionReport('REJECTED', 'IN_REVIEW')).toBe(false);
  });

  it('validates every allowlisted patch family without accepting arbitrary fields', () => {
    const patches = [
      { kind: 'PRICE_CHANGED', priceAmount: 12_000 },
      {
        kind: 'HOURS_CHANGED',
        operatingHours: [
          {
            closesAt: '17:00',
            dayOfWeek: 1,
            is24Hours: false,
            isClosed: false,
            opensAt: '08:00',
          },
        ],
      },
      { address: 'Alamat koreksi', kind: 'LOCATION_INCORRECT' },
      { categoryCode: 'TOILET', kind: 'CATEGORY_INCORRECT' },
      { facilityCode: 'PARKING', kind: 'FACILITY_CHANGED', status: 'AVAILABLE' },
      { kind: 'TEMPORARILY_CLOSED', placeStatus: 'TEMPORARILY_CLOSED' },
      { kind: 'PERMANENTLY_CLOSED', placeStatus: 'PERMANENTLY_CLOSED' },
      { duplicatePlaceId: placeId, kind: 'DUPLICATE_PLACE', placeStatus: 'ARCHIVED' },
      { kind: 'OTHER', landmark: 'Sebelah terminal' },
    ];
    for (const patch of patches)
      expect(approvedPlacePatchSchema.safeParse(patch).success).toBe(true);
    expect(
      approvedPlacePatchSchema.safeParse({
        kind: 'OTHER',
        name: 'Aman',
        verificationStatus: 'ADMIN_VERIFIED',
      }).success,
    ).toBe(false);
  });

  it('accepts multiple intervals for a patched day and keeps closed/24-hour days exclusive', () => {
    const hours = (operatingHours: unknown[]) =>
      approvedPlacePatchSchema.safeParse({ kind: 'HOURS_CHANGED', operatingHours });
    expect(
      hours([
        {
          closesAt: '11:00',
          dayOfWeek: 1,
          is24Hours: false,
          isClosed: false,
          opensAt: '07:00',
        },
        {
          closesAt: '20:00',
          dayOfWeek: 1,
          is24Hours: false,
          isClosed: false,
          opensAt: '16:00',
        },
      ]).success,
    ).toBe(true);
    expect(
      hours([
        {
          closesAt: null,
          dayOfWeek: 2,
          is24Hours: false,
          isClosed: true,
          opensAt: null,
        },
        {
          closesAt: '20:00',
          dayOfWeek: 2,
          is24Hours: false,
          isClosed: false,
          opensAt: '16:00',
        },
      ]).success,
    ).toBe(false);
  });

  it('validates idempotency keys and confirmation observation recency', () => {
    expect(reportIdempotencyKeySchema.safeParse('phase10-request-001').success).toBe(true);
    expect(reportIdempotencyKeySchema.safeParse('short').success).toBe(false);
    const now = new Date();
    expect(
      confirmationSchema.safeParse({
        confirmationType: 'STILL_VALID',
        confirmedAt: now.toISOString(),
        expectedPlaceVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      confirmationSchema.safeParse({
        confirmationType: 'STILL_VALID',
        confirmedAt: new Date(now.getTime() - 31 * 24 * 60 * 60_000).toISOString(),
        expectedPlaceVersion: 1,
      }).success,
    ).toBe(false);
  });

  it('validates activity status within the selected activity type', () => {
    expect(
      activityQuerySchema.safeParse({ status: 'APPROVED', type: 'CONTRIBUTION' }).success,
    ).toBe(true);
    expect(activityQuerySchema.safeParse({ status: 'APPLIED', type: 'REPORT' }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ status: 'ACTIVE', type: 'CONFIRMATION' }).success).toBe(
      true,
    );
    expect(activityQuerySchema.safeParse({ status: 'APPROVED', type: 'REPORT' }).success).toBe(
      false,
    );
    expect(activityQuerySchema.safeParse({ status: 'APPLIED', type: 'CONFIRMATION' }).success).toBe(
      false,
    );
    expect(activityQuerySchema.safeParse({ status: 'EXPIRED', type: 'CONTRIBUTION' }).success).toBe(
      false,
    );
  });
});
