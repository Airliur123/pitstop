export const placeStatusValues = [
  'DRAFT',
  'PENDING',
  'ACTIVE',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'ARCHIVED',
] as const;

export const contributionStatusValues = [
  'DRAFT',
  'PENDING',
  'IN_REVIEW',
  'NEEDS_REVISION',
  'APPROVED',
  'REJECTED',
  'MERGED',
] as const;

export const reportStatusValues = ['PENDING', 'IN_REVIEW', 'APPLIED', 'REJECTED'] as const;

export const verificationStatusValues = [
  'UNVERIFIED',
  'ADMIN_VERIFIED',
  'COMMUNITY_CONFIRMED',
  'STALE',
] as const;

export const facilityStatusValues = ['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN'] as const;
export const authProviderValues = ['PASSWORD', 'GOOGLE'] as const;
export const moderationDecisionValues = ['APPROVE', 'REJECT', 'REQUEST_REVISION', 'MERGE'] as const;
export const reportTypeValues = [
  'PRICE_CHANGED',
  'HOURS_CHANGED',
  'LOCATION_INCORRECT',
  'FACILITY_CHANGED',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'OTHER',
] as const;

export const userStatusValues = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export const contributionSourceValues = [
  'APPLICATION',
  'GOOGLE_FORM',
  'ADMIN',
  'CSV_IMPORT',
] as const;
export const confirmationTypeValues = [
  'STILL_VALID',
  'PRICE_ACCURATE',
  'FACILITIES_ACCURATE',
] as const;
export const integrationProcessingStatusValues = [
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
] as const;

export type PlaceStatus = (typeof placeStatusValues)[number];
export type ContributionStatus = (typeof contributionStatusValues)[number];
export type ReportStatus = (typeof reportStatusValues)[number];
export type VerificationStatus = (typeof verificationStatusValues)[number];
export type FacilityStatus = (typeof facilityStatusValues)[number];
export type AuthProvider = (typeof authProviderValues)[number];
export type ModerationDecision = (typeof moderationDecisionValues)[number];
export type ReportType = (typeof reportTypeValues)[number];
