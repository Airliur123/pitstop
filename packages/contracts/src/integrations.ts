import type {
  ContributionCategory,
  ContributionFacility,
  ContributionOperatingHour,
} from './contributions';

export const googleFormPayloadSchemaVersion = 1 as const;

export const googleFormSubmissionStatusValues = [
  'RECEIVED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'RETRYABLE_FAILURE',
  'DEAD_LETTER',
  'REJECTED_INVALID',
] as const;

export const integrationStageStatusValues = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'LOW_CONFIDENCE',
  'FAILED',
  'SKIPPED',
] as const;

export const pitstopJobNameValues = [
  'process-google-form-submission',
  'geocode-contribution',
  'detect-duplicate-place',
] as const;

export type GoogleFormSubmissionStatus = (typeof googleFormSubmissionStatusValues)[number];
export type IntegrationStageStatus = (typeof integrationStageStatusValues)[number];
export type PitstopJobName = (typeof pitstopJobNameValues)[number];

export interface GoogleFormPriceRange {
  readonly maximum: number;
  readonly minimum: number;
}

export interface GoogleFormInboundPayload {
  readonly address: string;
  readonly area: string;
  readonly category: ContributionCategory;
  readonly cheapestMenuName?: string | undefined;
  readonly cheapestMenuPrice?: number | undefined;
  readonly facilities?: readonly ContributionFacility[] | undefined;
  readonly landmark?: string | undefined;
  readonly mapUrl?: string | undefined;
  readonly maximumUsefulBudget?: number | undefined;
  readonly notes?: string | undefined;
  readonly openingHours?: readonly ContributionOperatingHour[] | undefined;
  readonly placeName: string;
  readonly priceRange?: GoogleFormPriceRange | undefined;
  readonly submitterEmail?: string | undefined;
}

export interface GoogleFormSourceMetadata {
  readonly externalSubmissionId: string;
  readonly receivedAt: string;
  readonly sourceId: string;
  readonly submittedAt: string;
}

export interface GoogleFormCanonicalPayload extends GoogleFormInboundPayload {
  readonly facilities: readonly ContributionFacility[];
  readonly openingHours: readonly ContributionOperatingHour[];
  readonly sourceMetadata: GoogleFormSourceMetadata;
}

export interface GoogleFormInboundSubmission {
  readonly payload: GoogleFormInboundPayload;
  readonly schemaVersion: typeof googleFormPayloadSchemaVersion;
  readonly submittedAt: string;
}

export interface GoogleFormAcceptedSubmission {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly inboxId: string;
  readonly status: GoogleFormSubmissionStatus;
}

export interface ProcessGoogleFormSubmissionJob {
  readonly attempt: number;
  readonly correlationId: string;
  readonly enqueuedAt: string;
  readonly idempotencyKey: string;
  readonly inboxId: string;
  readonly requestId: string;
}

export interface GeocodeContributionJob {
  readonly attempt: number;
  readonly contributionId: string;
  readonly correlationId: string;
  readonly enqueuedAt: string;
  readonly idempotencyKey: string;
  readonly inboxId: string;
  readonly requestId: string;
}

export type DetectDuplicatePlaceJob = GeocodeContributionJob;

export interface AdminGoogleFormIntegrationStatus {
  readonly counts: Readonly<Record<GoogleFormSubmissionStatus, number>>;
  readonly lastSuccessfulSyncAt: string | null;
  readonly queue: {
    readonly delayed: number;
    readonly pending: number;
  };
  readonly recentReceived: number;
  readonly source: {
    readonly enabled: boolean;
    readonly id: string;
    readonly keyId: string;
  };
}

export interface AdminGoogleFormSubmissionItem {
  readonly attemptCount: number;
  readonly contributionId: string | null;
  readonly duplicateDetectionStatus: IntegrationStageStatus;
  readonly externalSubmissionId: string;
  readonly geocodingStatus: IntegrationStageStatus;
  readonly id: string;
  readonly lastErrorCode: string | null;
  readonly receivedAt: string;
  readonly status: GoogleFormSubmissionStatus;
  readonly submitterEmailMasked: string | null;
  readonly updatedAt: string;
}

export interface AdminGoogleFormSubmissionList {
  readonly items: readonly AdminGoogleFormSubmissionItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}

export interface AdminGoogleFormSubmissionDetail extends AdminGoogleFormSubmissionItem {
  readonly duplicateHints: readonly {
    readonly candidatePlaceId: string;
    readonly distanceMeters: number;
    readonly matchedSignals: readonly string[];
    readonly score: number;
  }[];
  readonly payloadSummary: {
    readonly area: string;
    readonly category: ContributionCategory;
    readonly placeName: string;
  };
  readonly processedAt: string | null;
  readonly submittedAt: string;
}

export interface ReplayGoogleFormSubmissionResult {
  readonly inboxId: string;
  readonly replayed: true;
  readonly status: GoogleFormSubmissionStatus;
}
