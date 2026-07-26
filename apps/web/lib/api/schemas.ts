import {
  type ApiSuccess,
  type CategoriesMeta,
  openStatuses,
  type PlaceDetailMeta,
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
  type RequestId,
} from '@pitstop/contracts';
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
