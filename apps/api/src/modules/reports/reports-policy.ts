import type { ReportType, VerificationStatus } from '@pitstop/contracts';

export const COMMUNITY_CONFIRMATION_THRESHOLD = 3;
export const COMMUNITY_CONFIRMATION_RECENCY_DAYS = 90;
export const CONFIRMATION_REFRESH_WINDOW_DAYS = 7;
export const ADMIN_VERIFICATION_RECENCY_DAYS = 180;

export const seriousReportTypes: ReadonlySet<ReportType> = new Set([
  'LOCATION_INCORRECT',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'DUPLICATE_PLACE',
]);

export interface VerificationPolicyInput {
  readonly activeConfirmationCount: number;
  readonly adminVerifiedAt: Date | null;
  readonly hasPendingSeriousReport: boolean;
  readonly latestConfirmationAt: Date | null;
  readonly now: Date;
}

export function calculateVerificationStatus(input: VerificationPolicyInput): VerificationStatus {
  if (input.hasPendingSeriousReport) return 'STALE';
  if (
    input.adminVerifiedAt &&
    isWithinDays(input.adminVerifiedAt, input.now, ADMIN_VERIFICATION_RECENCY_DAYS)
  ) {
    return 'ADMIN_VERIFIED';
  }
  if (
    input.activeConfirmationCount >= COMMUNITY_CONFIRMATION_THRESHOLD &&
    input.latestConfirmationAt &&
    isWithinDays(input.latestConfirmationAt, input.now, COMMUNITY_CONFIRMATION_RECENCY_DAYS)
  ) {
    return 'COMMUNITY_CONFIRMED';
  }
  if (input.adminVerifiedAt || input.latestConfirmationAt) return 'STALE';
  return 'UNVERIFIED';
}

export function confirmationExpiresAt(observedAt: Date): Date {
  return addDays(observedAt, COMMUNITY_CONFIRMATION_RECENCY_DAYS);
}

export function confirmationCanRefresh(updatedAt: Date, now: Date): boolean {
  return !isWithinDays(updatedAt, now, CONFIRMATION_REFRESH_WINDOW_DAYS);
}

function isWithinDays(value: Date, now: Date, days: number): boolean {
  return value.getTime() >= now.getTime() - days * 24 * 60 * 60_000;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60_000);
}
