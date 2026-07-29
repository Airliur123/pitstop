export const contributionCategoryValues = [
  'MAKAN_MURAH',
  'NGOPI',
  'TOILET',
  'MUSALA',
  'ISTIRAHAT',
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

export const contributionFacilityCodeValues = [
  'PARKING',
  'TOILET',
  'MUSALA',
  'POWER_OUTLET',
  'SEATING',
  'SHADE',
  'WIFI',
] as const;

export const contributionFacilityStatusValues = ['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN'] as const;

export type ContributionCategory = (typeof contributionCategoryValues)[number];
export type ContributionStatus = (typeof contributionStatusValues)[number];
export type ContributionFacilityCode = (typeof contributionFacilityCodeValues)[number];
export type ContributionFacilityStatus = (typeof contributionFacilityStatusValues)[number];

export interface ContributionMainMenu {
  readonly name: string;
  readonly priceAmount: number;
}

export interface ContributionDraftMainMenu {
  readonly name?: string | undefined;
  readonly priceAmount?: number | undefined;
}

export interface ContributionPriceRange {
  readonly maximum: number;
  readonly minimum: number;
}

export interface ContributionFacility {
  readonly code: ContributionFacilityCode;
  readonly status: ContributionFacilityStatus;
}

export interface ContributionOperatingHour {
  readonly dayOfWeek: number;
  readonly is24Hours: boolean;
  readonly isClosed: boolean;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface ContributionDraftPayload {
  readonly address?: string | undefined;
  readonly area?: string | undefined;
  readonly category?: ContributionCategory | undefined;
  readonly facilities?: readonly ContributionFacility[] | undefined;
  readonly landmark?: string | undefined;
  readonly mainMenu?: ContributionDraftMainMenu | undefined;
  readonly mapsUrl?: string | undefined;
  readonly maximumUsefulBudget?: number | undefined;
  readonly notes?: string | undefined;
  readonly operatingHours?: readonly ContributionOperatingHour[] | undefined;
  readonly placeName?: string | undefined;
  readonly priceRange?: ContributionPriceRange | undefined;
}

export interface ContributionDetail {
  readonly createdAt: string;
  readonly id: string;
  readonly payload: ContributionDraftPayload;
  readonly status: ContributionStatus;
  readonly submittedAt: string | null;
  readonly updatedAt: string;
  readonly version: number;
}

export type CreateContributionResult = ContributionDetail;

export interface SubmitContributionResult extends ContributionDetail {
  readonly status: 'PENDING';
  readonly submittedAt: string;
}
