import type { RequestId, ResponseMeta } from './index';

export const publicCategoryCodes = [
  'MAKAN_MURAH',
  'NGOPI',
  'TOILET',
  'MUSALA',
  'ISTIRAHAT',
] as const;
export type PublicCategoryCode = (typeof publicCategoryCodes)[number];

export const budgetCategoryCodes = ['MAKAN_MURAH', 'NGOPI'] as const;
export type BudgetCategoryCode = (typeof budgetCategoryCodes)[number];

export const publicPlaceSorts = ['NEAREST', 'CHEAPEST', 'FRESHEST'] as const;
export type PublicPlaceSort = (typeof publicPlaceSorts)[number];

export const openStatuses = ['OPEN', 'CLOSING_SOON', 'CLOSED', 'UNKNOWN'] as const;
export type OpenStatus = (typeof openStatuses)[number];

export interface PublicCategory {
  readonly id: string;
  readonly code: PublicCategoryCode;
  readonly name: string;
  readonly description: string | null;
  readonly isPrimary: boolean;
  readonly sortOrder: number;
  readonly supportsBudget: boolean;
}

export interface PublicPlaceCategory {
  readonly id: string;
  readonly code: PublicCategoryCode;
  readonly name: string;
  readonly isPrimary: boolean;
}

export interface PublicFacility {
  readonly code: string;
  readonly name: string;
  readonly status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
}

export interface PublicMenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceAmount: number;
  readonly isMainItem: boolean;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
}

export interface PublicOperatingHour {
  readonly dayOfWeek: number;
  readonly sequence: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly is24Hours: boolean;
}

export interface PublicOperatingHourException {
  readonly exceptionDate: string;
  readonly sequence: number;
  readonly isClosed: boolean;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly note: string | null;
}

export interface PublicPriceSummary {
  readonly name: string;
  readonly priceAmount: number;
}

export interface PublicPlaceListItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly primaryCategory: PublicPlaceCategory;
  readonly categories: readonly PublicPlaceCategory[];
  readonly distanceMeters: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly placeStatus: 'ACTIVE';
  readonly verificationStatus: 'ADMIN_VERIFIED';
  readonly dataFreshnessAt: string;
  readonly cheapestAvailableMainItem: PublicPriceSummary | null;
  readonly budgetMatch: boolean | null;
  readonly facilitySummary: readonly PublicFacility[];
}

export interface PublicPlaceDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly placeStatus: 'ACTIVE';
  readonly verificationStatus: 'ADMIN_VERIFIED';
  readonly verifiedAt: string | null;
  readonly dataFreshnessAt: string;
  readonly categories: readonly PublicPlaceCategory[];
  readonly menus: readonly PublicMenuItem[];
  readonly facilities: readonly PublicFacility[];
  readonly operatingHours: readonly PublicOperatingHour[];
  readonly operatingHourExceptions: readonly PublicOperatingHourException[];
  readonly photos: {
    readonly available: boolean;
    readonly count: number;
  };
}

export interface CollectionPagination {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface PublicPlacesQueryMeta {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly category: PublicCategoryCode | null;
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
  readonly limit: number;
  readonly sort: PublicPlaceSort;
}

export interface PublicPlacesMeta extends ResponseMeta {
  readonly pagination: CollectionPagination;
  readonly query: PublicPlacesQueryMeta;
  readonly cache: 'HIT' | 'MISS' | 'BYPASS';
}

export const rankingReasons = [
  'NEAREST_WITHIN_BUDGET',
  'CHEAPEST_NEARBY',
  'NEAREST_VERIFIED',
  'OPEN_AND_FRESH',
] as const;
export type RankingReason = (typeof rankingReasons)[number];

export interface RecommendationScore {
  readonly total: number;
  readonly budgetFit: number;
  readonly distance: number;
  readonly open: number;
  readonly freshness: number;
  readonly community: number;
}

export interface PublicRecommendation extends PublicPlaceListItem {
  readonly openStatus: OpenStatus;
  readonly cheapestQualifyingItem: PublicPriceSummary | null;
  readonly rankingReason: RankingReason;
  readonly score: RecommendationScore;
}

export interface RecommendationResult {
  readonly primary: PublicRecommendation | null;
  readonly alternatives: readonly PublicRecommendation[];
}

export const recommendationFallbackReasons = [
  'BUDGET_TOO_LOW',
  'OUTSIDE_RADIUS',
  'NO_VERIFIED_MATCH',
  'NO_CATEGORY_MATCH',
  'ALL_PLACES_CLOSED',
] as const;
export type RecommendationFallbackReason = (typeof recommendationFallbackReasons)[number];

export interface RecommendationFallback {
  readonly reason: RecommendationFallbackReason;
  readonly minimumRequiredBudgetAmount?: number;
  readonly nearestDistanceMeters?: number;
  readonly nearestPlace?: Pick<
    PublicPlaceListItem,
    'id' | 'slug' | 'name' | 'distanceMeters' | 'primaryCategory'
  >;
}

export interface RecommendationQueryMeta {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly category: PublicCategoryCode;
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
  readonly limit: number;
}

export interface RecommendationMeta extends ResponseMeta {
  readonly query: RecommendationQueryMeta;
  readonly fallback: RecommendationFallback | null;
  readonly cache: 'HIT' | 'MISS' | 'BYPASS';
}

export interface CategoriesMeta extends ResponseMeta {
  readonly cache: 'HIT' | 'MISS' | 'BYPASS';
}

export interface PlaceDetailMeta extends ResponseMeta {
  readonly cache: 'HIT' | 'MISS' | 'BYPASS';
}

export interface CursorPayload {
  readonly version: 2;
  readonly queryHash: string;
  readonly sort: PublicPlaceSort;
  readonly id: string;
  readonly distanceMeters: number;
  readonly priceAmount: number | null;
  readonly dataFreshnessAt: string;
}

export interface PublicRequestContext {
  readonly requestId: RequestId;
  readonly generatedAt: string;
}
