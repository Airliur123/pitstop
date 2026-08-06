import {
  type ActivityItem,
  type ApiSuccess,
  authRoleValues,
  type AuthSession,
  type CategoriesMeta,
  confirmationTypeValues,
  type ContributionDetail,
  type LogoutResult,
  type MagicLinkRequestResult,
  type MagicLinkVerificationResult,
  openStatuses,
  type PlaceConfirmationDetail,
  type PlaceDetailMeta,
  type PlaceReportDetail,
  type PublicCategory,
  publicCategoryCodes,
  type PublicPlaceDetail,
  type PublicPlaceListItem,
  type PublicPlacesMeta,
  publicPlaceSorts,
  rankingReasons,
  type RecommendationFallback,
  recommendationFallbackReasons,
  type RecommendationMeta,
  type RecommendationResult,
  reportStatusValues,
  reportTypeValues,
  type RequestId,
  type UserActivity,
  verificationStatusValues,
} from '@pitstop/contracts';
import {
  approvedPlacePatchSchema,
  contributionDraftSchema,
  contributionStatusSchema,
} from '@pitstop/validation';
import { z } from 'zod';

const requestId = z
  .string()
  .min(1)
  .transform((value) => value as RequestId);
const categoryCode = z.enum(publicCategoryCodes);
const openStatus = z.enum(openStatuses);
const sort = z.enum(publicPlaceSorts);
const cache = z.enum(['HIT', 'MISS', 'BYPASS']);
const dateTime = z.string().min(1);

const category = z.object({
  code: categoryCode,
  description: z.string().nullable(),
  id: z.string().min(1),
  isPrimary: z.boolean(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  supportsBudget: z.boolean(),
}) satisfies z.ZodType<PublicCategory>;

const placeCategory = z.object({
  code: categoryCode,
  id: z.string().min(1),
  isPrimary: z.boolean(),
  name: z.string().min(1),
});

const facility = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN']),
});

const priceSummary = z.object({
  name: z.string().min(1),
  priceAmount: z.number().int().nonnegative(),
});

const listItem = z.object({
  address: z.string().min(1),
  budgetMatch: z.boolean().nullable(),
  categories: z.array(placeCategory),
  cheapestAvailableMainItem: priceSummary.nullable(),
  dataFreshnessAt: dateTime,
  distanceMeters: z.number().int().nonnegative(),
  facilitySummary: z.array(facility),
  id: z.string().min(1),
  landmark: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().min(1),
  placeStatus: z.literal('ACTIVE'),
  primaryCategory: placeCategory,
  shortDescription: z.string().nullable(),
  slug: z.string().min(1),
  verificationStatus: z.literal('ADMIN_VERIFIED'),
}) satisfies z.ZodType<PublicPlaceListItem>;

const responseMeta = z.object({
  generatedAt: dateTime,
  requestId,
});

function successEnvelope<T extends z.ZodType, M extends z.ZodType>(data: T, meta: M) {
  return z.object({
    data,
    meta,
    requestId,
    success: z.literal(true),
  });
}

const authUser = z.object({
  email: z.string().min(1),
  id: z.string().min(1),
  role: z.enum(authRoleValues),
});

const authSession = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }),
  z.object({ authenticated: z.literal(true), user: authUser }),
]) satisfies z.ZodType<AuthSession>;

export const authSessionResponseSchema = successEnvelope(
  authSession,
  responseMeta,
) satisfies z.ZodType<ApiSuccess<AuthSession>>;

export const magicLinkRequestResponseSchema = successEnvelope(
  z.object({ accepted: z.literal(true) }),
  responseMeta,
) satisfies z.ZodType<ApiSuccess<MagicLinkRequestResult>>;

export const magicLinkVerificationResponseSchema = successEnvelope(
  z.object({
    authenticated: z.literal(true),
    returnTo: z.string().min(1),
    user: authUser,
  }),
  responseMeta,
) satisfies z.ZodType<ApiSuccess<MagicLinkVerificationResult>>;

export const logoutResponseSchema = successEnvelope(
  z.object({ authenticated: z.literal(false) }),
  responseMeta,
) satisfies z.ZodType<ApiSuccess<LogoutResult>>;

export const categoriesResponseSchema = successEnvelope(
  z.array(category),
  responseMeta.extend({ cache }),
) satisfies z.ZodType<ApiSuccess<readonly PublicCategory[], CategoriesMeta>>;

const placesMeta = responseMeta.extend({
  cache,
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
  query: z.object({
    budgetAmount: z.number().int().nonnegative().nullable(),
    budgetApplied: z.boolean(),
    category: categoryCode.nullable(),
    latitude: z.number(),
    limit: z.number().int().positive(),
    longitude: z.number(),
    radiusMeters: z.number().int().positive(),
    sort,
  }),
});

export const placesResponseSchema = successEnvelope(
  z.array(listItem),
  placesMeta,
) satisfies z.ZodType<ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>>;

const recommendation = listItem.extend({
  cheapestQualifyingItem: priceSummary.nullable(),
  openStatus,
  rankingReason: z.enum(rankingReasons),
  score: z.object({
    budgetFit: z.number(),
    community: z.number(),
    distance: z.number(),
    freshness: z.number(),
    open: z.number(),
    total: z.number(),
  }),
});

const recommendationMeta = responseMeta.extend({
  cache,
  fallback: z
    .object({
      minimumRequiredBudgetAmount: z.number().int().nonnegative().optional(),
      nearestDistanceMeters: z.number().int().nonnegative().optional(),
      nearestPlace: listItem
        .pick({
          distanceMeters: true,
          id: true,
          name: true,
          primaryCategory: true,
          slug: true,
        })
        .optional(),
      reason: z.enum(recommendationFallbackReasons),
    })
    .transform((value): RecommendationFallback => ({
      ...(value.minimumRequiredBudgetAmount === undefined
        ? {}
        : { minimumRequiredBudgetAmount: value.minimumRequiredBudgetAmount }),
      ...(value.nearestDistanceMeters === undefined
        ? {}
        : { nearestDistanceMeters: value.nearestDistanceMeters }),
      ...(value.nearestPlace === undefined ? {} : { nearestPlace: value.nearestPlace }),
      reason: value.reason,
    }))
    .nullable(),
  query: z.object({
    budgetAmount: z.number().int().nonnegative().nullable(),
    budgetApplied: z.boolean(),
    category: categoryCode,
    latitude: z.number(),
    limit: z.number().int().min(1).max(4),
    longitude: z.number(),
    radiusMeters: z.number().int().positive(),
  }),
});

export const recommendationsResponseSchema = successEnvelope(
  z.object({
    alternatives: z.array(recommendation).max(3),
    primary: recommendation.nullable(),
  }),
  recommendationMeta,
) satisfies z.ZodType<ApiSuccess<RecommendationResult, RecommendationMeta>>;

const menu = z.object({
  description: z.string().nullable(),
  id: z.string().min(1),
  isAvailable: z.boolean(),
  isMainItem: z.boolean(),
  name: z.string().min(1),
  priceAmount: z.number().int().nonnegative(),
  sortOrder: z.number().int(),
});

const operatingHour = z.object({
  closesAt: z.string().nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  is24Hours: z.boolean(),
  opensAt: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
});

const operatingHourException = z.object({
  closesAt: z.string().nullable(),
  exceptionDate: z.string().min(1),
  isClosed: z.boolean(),
  note: z.string().nullable(),
  opensAt: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
});

const placeDetail = z.object({
  address: z.string().min(1),
  categories: z.array(placeCategory),
  city: z.string().min(1),
  dataFreshnessAt: dateTime,
  description: z.string().nullable(),
  district: z.string().min(1),
  facilities: z.array(facility),
  id: z.string().min(1),
  version: z.number().int().positive(),
  landmark: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  menus: z.array(menu),
  name: z.string().min(1),
  operatingHourExceptions: z.array(operatingHourException),
  operatingHours: z.array(operatingHour),
  photos: z.object({
    available: z.boolean(),
    count: z.number().int().nonnegative(),
  }),
  placeStatus: z.literal('ACTIVE'),
  postalCode: z.string().nullable(),
  province: z.string().min(1),
  slug: z.string().min(1),
  verificationStatus: z.literal('ADMIN_VERIFIED'),
  verifiedAt: dateTime.nullable(),
}) satisfies z.ZodType<PublicPlaceDetail>;

export const placeDetailResponseSchema = successEnvelope(
  placeDetail,
  responseMeta.extend({ cache }),
) satisfies z.ZodType<ApiSuccess<PublicPlaceDetail, PlaceDetailMeta>>;

export const problemDetailsSchema = z.object({
  code: z.string().min(1),
  detail: z.string().min(1),
  error: z.object({
    code: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string().min(1),
  }),
  instance: z.string(),
  requestId,
  status: z.number().int().min(400).max(599),
  success: z.literal(false),
  title: z.string().min(1),
  type: z.string().min(1),
  validationErrors: z
    .array(z.object({ field: z.string().min(1), message: z.string().min(1) }))
    .optional(),
});

const contributionDetail = z.object({
  createdAt: dateTime,
  id: z.string().length(26),
  payload: contributionDraftSchema,
  status: contributionStatusSchema,
  submittedAt: dateTime.nullable(),
  updatedAt: dateTime,
  version: z.number().int().positive(),
}) satisfies z.ZodType<ContributionDetail>;

export const contributionResponseSchema = successEnvelope(
  contributionDetail,
  responseMeta,
) satisfies z.ZodType<ApiSuccess<ContributionDetail>>;

const reportPlaceSummary = z.object({
  address: z.string(),
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  verificationStatus: z.enum(verificationStatusValues),
  version: z.number().int().positive(),
});

const placeReportDetail = z.object({
  appliedChangeSummary: z.record(z.string(), z.unknown()).nullable(),
  evidenceReference: z.string().nullable(),
  evidenceUrl: z.string().nullable(),
  explanation: z.string(),
  id: z.string().min(1),
  place: reportPlaceSummary,
  proposal: approvedPlacePatchSchema,
  reportType: z.enum(reportTypeValues),
  resolution: z.string().nullable(),
  reviewedAt: dateTime.nullable(),
  status: z.enum(reportStatusValues),
  submittedAt: dateTime,
  version: z.number().int().positive(),
}) satisfies z.ZodType<PlaceReportDetail>;

const placeConfirmationDetail = z.object({
  confirmedAt: dateTime,
  confirmationType: z.enum(confirmationTypeValues),
  expiresAt: dateTime,
  id: z.string().min(1),
  note: z.string().nullable(),
  place: reportPlaceSummary,
  replayed: z.boolean(),
  verificationStatus: z.enum(verificationStatusValues),
}) satisfies z.ZodType<PlaceConfirmationDetail>;

const contributionActivity = z.object({
  createdAt: dateTime,
  id: z.string().min(1),
  placeId: z.string().nullable(),
  placeName: z.string().nullable(),
  status: contributionStatusSchema,
  type: z.literal('CONTRIBUTION'),
  updatedAt: dateTime,
});
const reportActivity = z.object({
  createdAt: dateTime,
  id: z.string().min(1),
  placeId: z.string().min(1),
  placeName: z.string(),
  reportType: z.enum(reportTypeValues),
  status: z.enum(reportStatusValues),
  type: z.literal('REPORT'),
  updatedAt: dateTime,
});
const confirmationActivity = z.object({
  confirmationType: z.enum(confirmationTypeValues),
  createdAt: dateTime,
  id: z.string().min(1),
  placeId: z.string().min(1),
  placeName: z.string(),
  status: z.enum(['ACTIVE', 'EXPIRED']),
  type: z.literal('CONFIRMATION'),
  updatedAt: dateTime,
});
export const activityItemSchema = z.discriminatedUnion('type', [
  contributionActivity,
  reportActivity,
  confirmationActivity,
]) satisfies z.ZodType<ActivityItem>;
const userActivity = z.object({
  items: z.array(activityItemSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
}) satisfies z.ZodType<UserActivity>;

export const reportResponseSchema = successEnvelope(
  placeReportDetail,
  responseMeta,
) satisfies z.ZodType<ApiSuccess<PlaceReportDetail>>;

export const confirmationResponseSchema = successEnvelope(
  placeConfirmationDetail,
  responseMeta,
) satisfies z.ZodType<ApiSuccess<PlaceConfirmationDetail>>;

export const activityResponseSchema = successEnvelope(
  userActivity,
  responseMeta,
) satisfies z.ZodType<ApiSuccess<UserActivity>>;
