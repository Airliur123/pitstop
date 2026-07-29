import type {
  ContributionCategory,
  ContributionDraftPayload,
  ContributionStatus,
} from './contributions';

export const contributionSourceValues = [
  'APPLICATION',
  'GOOGLE_FORM',
  'ADMIN',
  'CSV_IMPORT',
] as const;

export const adminContributionSortValues = ['SUBMITTED_DESC', 'SUBMITTED_ASC'] as const;
export const moderationActionValues = [
  'CLAIM',
  'RECLAIM',
  'NEEDS_REVISION',
  'REJECT',
  'APPROVE',
  'MERGE',
] as const;

export type ContributionSource = (typeof contributionSourceValues)[number];
export type AdminContributionSort = (typeof adminContributionSortValues)[number];
export type ModerationAction = (typeof moderationActionValues)[number];

export interface AdminReviewer {
  readonly claimExpired: boolean;
  readonly claimExpiresAt: string;
  readonly claimedAt: string;
  readonly email: string;
  readonly id: string;
}

export interface AdminContributionQueueItem {
  readonly category: ContributionCategory;
  readonly currentReviewer: AdminReviewer | null;
  readonly id: string;
  readonly placeName: string;
  readonly source: ContributionSource;
  readonly status: ContributionStatus;
  readonly submittedAt: string;
  readonly version: number;
}

export interface AdminContributionQueue {
  readonly items: readonly AdminContributionQueueItem[];
  readonly pagination: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

export interface ModerationHistoryEvent {
  readonly action: ModerationAction;
  readonly actor: {
    readonly email: string;
    readonly id: string;
  };
  readonly contributionVersion: number;
  readonly createdAt: string;
  readonly id: string;
  readonly mergedPlaceId: string | null;
  readonly nextStatus: ContributionStatus;
  readonly previousStatus: ContributionStatus;
  readonly reason: string | null;
}

export interface VerifiedContributionLocation {
  readonly city: string;
  readonly district: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly postalCode: string | null;
  readonly province: string;
}

export type ContributionPublicationTarget =
  | { readonly mode: 'CREATE_NEW'; readonly targetPlaceId: null }
  | { readonly mode: 'MERGE_EXISTING'; readonly targetPlaceId: string };

export interface AdminContributionDetail {
  readonly approvedAt: string | null;
  readonly createdAt: string;
  readonly currentReviewer: AdminReviewer | null;
  readonly contributor: {
    readonly email: string;
    readonly id: string;
  } | null;
  readonly decisionReason: string | null;
  readonly history: readonly ModerationHistoryEvent[];
  readonly id: string;
  readonly mergedAt: string | null;
  readonly mergedPlaceId: string | null;
  readonly payload: ContributionDraftPayload;
  readonly publicationTarget: ContributionPublicationTarget | null;
  readonly source: ContributionSource;
  readonly status: ContributionStatus;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly verifiedLocation: VerifiedContributionLocation | null;
  readonly version: number;
}

export interface AdminDashboard {
  readonly recentActivity: readonly ModerationHistoryEvent[];
  readonly totals: {
    readonly approvedAwaitingMerge: number;
    readonly inReview: number;
    readonly needsRevision: number;
    readonly pending: number;
  };
}

export interface ModerationMutationResult {
  readonly contribution: AdminContributionDetail;
  readonly replayed: boolean;
}

export interface MergeContributionResult extends ModerationMutationResult {
  readonly placeId: string;
  readonly placeSlug: string;
}
