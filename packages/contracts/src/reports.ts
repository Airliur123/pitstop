import type {
  ContributionCategory,
  ContributionFacilityCode,
  ContributionFacilityStatus,
  ContributionOperatingHour,
  ContributionStatus,
} from './contributions';

export const reportStatusValues = ['PENDING', 'IN_REVIEW', 'APPLIED', 'REJECTED'] as const;
export const verificationStatusValues = [
  'UNVERIFIED',
  'ADMIN_VERIFIED',
  'COMMUNITY_CONFIRMED',
  'STALE',
] as const;
export const reportTypeValues = [
  'PRICE_CHANGED',
  'HOURS_CHANGED',
  'LOCATION_INCORRECT',
  'CATEGORY_INCORRECT',
  'FACILITY_CHANGED',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'DUPLICATE_PLACE',
  'OTHER',
] as const;
export const confirmationTypeValues = [
  'STILL_VALID',
  'PRICE_ACCURATE',
  'FACILITIES_ACCURATE',
] as const;

export type ReportStatus = (typeof reportStatusValues)[number];
export type VerificationStatus = (typeof verificationStatusValues)[number];
export type ReportType = (typeof reportTypeValues)[number];
export type ConfirmationType = (typeof confirmationTypeValues)[number];

export type ApprovedPlacePatch =
  | Readonly<{
      kind: 'PRICE_CHANGED';
      menuId?: string | undefined;
      menuName?: string | undefined;
      priceAmount?: number | undefined;
    }>
  | Readonly<{ kind: 'HOURS_CHANGED'; operatingHours: readonly ContributionOperatingHour[] }>
  | Readonly<{
      kind: 'LOCATION_INCORRECT';
      address?: string | undefined;
      city?: string | undefined;
      district?: string | undefined;
      latitude?: number | undefined;
      longitude?: number | undefined;
      postalCode?: string | null | undefined;
      province?: string | undefined;
    }>
  | Readonly<{ categoryCode: ContributionCategory; kind: 'CATEGORY_INCORRECT' }>
  | Readonly<{
      facilityCode: ContributionFacilityCode;
      kind: 'FACILITY_CHANGED';
      status: ContributionFacilityStatus;
    }>
  | Readonly<{ kind: 'TEMPORARILY_CLOSED'; placeStatus: 'TEMPORARILY_CLOSED' }>
  | Readonly<{ kind: 'PERMANENTLY_CLOSED'; placeStatus: 'PERMANENTLY_CLOSED' }>
  | Readonly<{
      duplicatePlaceId: string;
      kind: 'DUPLICATE_PLACE';
      placeStatus: 'ARCHIVED';
    }>
  | Readonly<{
      description?: string | null | undefined;
      kind: 'OTHER';
      landmark?: string | null | undefined;
      name?: string | undefined;
    }>;

export interface ReportPlaceSummary {
  readonly address: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly verificationStatus: VerificationStatus;
  readonly version: number;
}

export interface PlaceReportDetail {
  readonly appliedChangeSummary: Readonly<Record<string, unknown>> | null;
  readonly evidenceReference: string | null;
  readonly evidenceUrl: string | null;
  readonly explanation: string;
  readonly id: string;
  readonly place: ReportPlaceSummary;
  readonly proposal: ApprovedPlacePatch;
  readonly reportType: ReportType;
  readonly resolution: string | null;
  readonly reviewedAt: string | null;
  readonly status: ReportStatus;
  readonly submittedAt: string;
  readonly version: number;
}

export interface PlaceConfirmationDetail {
  readonly confirmedAt: string;
  readonly confirmationType: ConfirmationType;
  readonly expiresAt: string;
  readonly id: string;
  readonly note: string | null;
  readonly place: ReportPlaceSummary;
  readonly replayed: boolean;
  readonly verificationStatus: VerificationStatus;
}

export type ActivityType = 'CONTRIBUTION' | 'REPORT' | 'CONFIRMATION';

export type ActivityItem =
  | Readonly<{
      createdAt: string;
      id: string;
      placeId: string | null;
      placeName: string | null;
      status: ContributionStatus;
      type: 'CONTRIBUTION';
      updatedAt: string;
    }>
  | Readonly<{
      createdAt: string;
      id: string;
      placeId: string;
      placeName: string;
      reportType: ReportType;
      status: ReportStatus;
      type: 'REPORT';
      updatedAt: string;
    }>
  | Readonly<{
      confirmationType: ConfirmationType;
      createdAt: string;
      id: string;
      placeId: string;
      placeName: string;
      status: 'ACTIVE' | 'EXPIRED';
      type: 'CONFIRMATION';
      updatedAt: string;
    }>;

export interface UserActivity {
  readonly items: readonly ActivityItem[];
  readonly pagination: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

export interface AdminReportReviewer {
  readonly claimExpired: boolean;
  readonly claimExpiresAt: string;
  readonly claimedAt: string;
  readonly email: string;
  readonly id: string;
}

export interface AdminReportQueueItem {
  readonly category: ContributionCategory;
  readonly currentReviewer: AdminReportReviewer | null;
  readonly id: string;
  readonly place: Pick<ReportPlaceSummary, 'id' | 'name' | 'version'>;
  readonly reportType: ReportType;
  readonly reporter: { readonly id: string; readonly maskedEmail: string };
  readonly status: ReportStatus;
  readonly submittedAt: string;
  readonly version: number;
}

export interface AdminReportQueue {
  readonly items: readonly AdminReportQueueItem[];
  readonly pagination: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

export interface PlaceHistoryEntry {
  readonly actorId: string | null;
  readonly after: Readonly<Record<string, unknown>>;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly changedFields: readonly string[];
  readonly createdAt: string;
  readonly id: string;
  readonly nextVersion: number;
  readonly previousVersion: number | null;
  readonly reason: string | null;
  readonly sourceId: string | null;
  readonly sourceType: string;
}

export interface GovernanceAuditEntry {
  readonly action: string;
  readonly actorId: string | null;
  readonly actorType: 'USER' | 'ADMIN' | 'SYSTEM' | 'INTEGRATION';
  readonly createdAt: string;
  readonly id: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly nextStatus: string | null;
  readonly previousStatus: string | null;
  readonly requestId: string;
  readonly resourceId: string;
  readonly resourceType: string;
}

export interface AdminReportDetail extends PlaceReportDetail {
  readonly audit: readonly GovernanceAuditEntry[];
  readonly currentPlace: ReportPlaceSummary & {
    readonly categories: readonly ContributionCategory[];
    readonly description: string | null;
    readonly facilities: readonly {
      readonly code: ContributionFacilityCode;
      readonly status: ContributionFacilityStatus;
    }[];
    readonly latitude: number;
    readonly longitude: number;
    readonly menus: readonly {
      readonly id: string;
      readonly isAvailable: boolean;
      readonly name: string;
      readonly priceAmount: number;
    }[];
    readonly operatingHours: readonly ContributionOperatingHour[];
  };
  readonly currentReviewer: AdminReportReviewer | null;
  readonly history: readonly GovernanceAuditEntry[];
  readonly placeHistory: readonly PlaceHistoryEntry[];
  readonly relatedPendingReports: readonly {
    readonly id: string;
    readonly reportType: ReportType;
    readonly submittedAt: string;
  }[];
  readonly reporter: { readonly id: string; readonly maskedEmail: string };
}

export interface ReportMutationResult {
  readonly report: AdminReportDetail;
  readonly replayed: boolean;
}

export interface AuditLogPage {
  readonly items: readonly GovernanceAuditEntry[];
  readonly pagination: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}
