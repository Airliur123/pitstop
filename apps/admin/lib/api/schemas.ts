import {
  adminContributionSortValues,
  authRoleValues,
  contributionCategoryValues,
  contributionFacilityCodeValues,
  contributionFacilityStatusValues,
  contributionSourceValues,
  contributionStatusValues,
  googleFormSubmissionStatusValues,
  integrationStageStatusValues,
  moderationActionValues,
  reportStatusValues,
  reportTypeValues,
  verificationStatusValues,
} from '@pitstop/contracts';
import { approvedPlacePatchSchema } from '@pitstop/validation';
import { z } from 'zod';

const metaSchema = z
  .object({
    generatedAt: z.string(),
    requestId: z.string(),
  })
  .passthrough();

function successSchema<T extends z.ZodType>(data: T) {
  return z
    .object({
      data,
      meta: metaSchema,
      requestId: z.string(),
      success: z.literal(true),
    })
    .strict();
}

const authUserSchema = z
  .object({
    email: z.string(),
    id: z.string(),
    role: z.enum(authRoleValues),
  })
  .strict();

export const authSessionResponseSchema = successSchema(
  z.discriminatedUnion('authenticated', [
    z.object({ authenticated: z.literal(false) }).strict(),
    z.object({ authenticated: z.literal(true), user: authUserSchema }).strict(),
  ]),
);

export const adminSystemDiagnosticsResponseSchema = successSchema(
  z
    .object({
      backlog: z
        .object({
          contributionsPending: z.number().int().nonnegative(),
          googleFormDlq: z.number().int().nonnegative(),
          googleFormInbox: z.number().int().nonnegative(),
          reportsPendingOrInReview: z.number().int().nonnegative(),
        })
        .strict(),
      dependencies: z
        .object({
          database: z.enum(['down', 'up']),
          queue: z.enum(['down', 'up']),
          redis: z.enum(['down', 'up']),
        })
        .strict(),
      environment: z.string(),
      generatedAt: z.string(),
      queues: z
        .object({
          active: z.number().int().nonnegative(),
          delayed: z.number().int().nonnegative(),
          dlq: z.number().int().nonnegative(),
          failed: z.number().int().nonnegative(),
          waiting: z.number().int().nonnegative(),
        })
        .strict(),
      release: z.string(),
      service: z.literal('pitstop-api'),
      status: z.enum(['not_ready', 'ready']),
      worker: z
        .object({
          lastHeartbeatAt: z.string().nullable(),
          lastSuccessfulActivityAt: z.string().nullable(),
          state: z.enum(['ready', 'stale', 'stopping', 'unavailable']),
        })
        .strict(),
    })
    .strict(),
);

export const magicLinkRequestResponseSchema = successSchema(
  z.object({ accepted: z.literal(true) }).strict(),
);

export const logoutResponseSchema = successSchema(
  z.object({ authenticated: z.literal(false) }).strict(),
);

export const magicLinkVerificationResponseSchema = successSchema(
  z
    .object({
      authenticated: z.literal(true),
      returnTo: z.string(),
      user: authUserSchema,
    })
    .strict(),
);

const reviewerSchema = z
  .object({
    claimExpired: z.boolean(),
    claimExpiresAt: z.string(),
    claimedAt: z.string(),
    email: z.string(),
    id: z.string(),
  })
  .strict();

const historyEventSchema = z
  .object({
    action: z.enum(moderationActionValues),
    actor: z.object({ email: z.string(), id: z.string() }).strict(),
    contributionVersion: z.number().int().positive(),
    createdAt: z.string(),
    id: z.string(),
    mergedPlaceId: z.string().nullable(),
    nextStatus: z.enum(contributionStatusValues),
    previousStatus: z.enum(contributionStatusValues),
    reason: z.string().nullable(),
  })
  .strict();

const facilitySchema = z
  .object({
    code: z.enum(contributionFacilityCodeValues),
    status: z.enum(contributionFacilityStatusValues),
  })
  .strict();

const operatingHourSchema = z
  .object({
    closesAt: z.string().nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    is24Hours: z.boolean(),
    isClosed: z.boolean(),
    opensAt: z.string().nullable(),
  })
  .strict();

const contributionPayloadSchema = z
  .object({
    address: z.string().optional(),
    area: z.string().optional(),
    category: z.enum(contributionCategoryValues).optional(),
    facilities: z.array(facilitySchema).optional(),
    landmark: z.string().optional(),
    mainMenu: z
      .object({
        name: z.string().optional(),
        priceAmount: z.number().optional(),
      })
      .strict()
      .optional(),
    mapsUrl: z.string().optional(),
    maximumUsefulBudget: z.number().int().positive().optional(),
    notes: z.string().optional(),
    operatingHours: z.array(operatingHourSchema).optional(),
    placeName: z.string().optional(),
    priceRange: z
      .object({
        maximum: z.number().int().positive(),
        minimum: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

const contributionDetailSchema = z
  .object({
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
    currentReviewer: reviewerSchema.nullable(),
    contributor: z.object({ email: z.string(), id: z.string() }).strict().nullable(),
    decisionReason: z.string().nullable(),
    duplicateHints: z.array(
      z
        .object({
          candidatePlaceId: z.string(),
          distanceMeters: z.number().nonnegative(),
          matchedSignals: z.array(z.string()),
          score: z.number().min(0).max(1),
        })
        .strict(),
    ),
    history: z.array(historyEventSchema),
    id: z.string(),
    mergedAt: z.string().nullable(),
    mergedPlaceId: z.string().nullable(),
    payload: contributionPayloadSchema,
    publicationTarget: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('CREATE_NEW'), targetPlaceId: z.null() }).strict(),
        z.object({ mode: z.literal('MERGE_EXISTING'), targetPlaceId: z.string() }).strict(),
      ])
      .nullable(),
    source: z.enum(contributionSourceValues),
    status: z.enum(contributionStatusValues),
    submittedAt: z.string(),
    updatedAt: z.string(),
    verifiedLocation: z
      .object({
        city: z.string(),
        district: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        postalCode: z.string().nullable(),
        province: z.string(),
      })
      .strict()
      .nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const adminContributionDetailResponseSchema = successSchema(contributionDetailSchema);

export const adminContributionQueueResponseSchema = successSchema(
  z
    .object({
      items: z.array(
        z
          .object({
            category: z.enum(contributionCategoryValues),
            currentReviewer: reviewerSchema.nullable(),
            id: z.string(),
            placeName: z.string(),
            source: z.enum(contributionSourceValues),
            status: z.enum(contributionStatusValues),
            submittedAt: z.string(),
            version: z.number().int().positive(),
          })
          .strict(),
      ),
      pagination: z
        .object({
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        })
        .strict(),
    })
    .strict(),
);

export const adminDashboardResponseSchema = successSchema(
  z
    .object({
      recentActivity: z.array(historyEventSchema),
      totals: z
        .object({
          approvedAwaitingMerge: z.number().int().nonnegative(),
          inReview: z.number().int().nonnegative(),
          needsRevision: z.number().int().nonnegative(),
          pending: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
);

export const moderationMutationResponseSchema = successSchema(
  z
    .object({
      contribution: contributionDetailSchema,
      replayed: z.boolean(),
    })
    .strict(),
);

export const mergeMutationResponseSchema = successSchema(
  z
    .object({
      contribution: contributionDetailSchema,
      placeId: z.string(),
      placeSlug: z.string(),
      replayed: z.boolean(),
    })
    .strict(),
);

export const problemDetailsSchema = z
  .object({
    code: z.string(),
    detail: z.string(),
    requestId: z.string().nullable().optional(),
    status: z.number().int(),
    title: z.string(),
    validationErrors: z
      .array(z.object({ field: z.string(), message: z.string() }).strict())
      .optional(),
  })
  .passthrough();

export const adminQueueSortSchema = z.enum(adminContributionSortValues);

const googleFormStatusCountsSchema = z.object(
  Object.fromEntries(
    googleFormSubmissionStatusValues.map((status) => [status, z.number().int().nonnegative()]),
  ) as Record<(typeof googleFormSubmissionStatusValues)[number], z.ZodNumber>,
);

const googleFormSubmissionItemSchema = z
  .object({
    attemptCount: z.number().int().nonnegative(),
    contributionId: z.string().nullable(),
    duplicateDetectionStatus: z.enum(integrationStageStatusValues),
    externalSubmissionId: z.string(),
    geocodingStatus: z.enum(integrationStageStatusValues),
    id: z.string(),
    lastErrorCode: z.string().nullable(),
    receivedAt: z.string(),
    status: z.enum(googleFormSubmissionStatusValues),
    submitterEmailMasked: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();

export const googleFormIntegrationStatusResponseSchema = successSchema(
  z
    .object({
      counts: googleFormStatusCountsSchema,
      lastSuccessfulSyncAt: z.string().nullable(),
      queue: z
        .object({
          delayed: z.number().int().nonnegative(),
          pending: z.number().int().nonnegative(),
        })
        .strict(),
      recentReceived: z.number().int().nonnegative(),
      source: z
        .object({
          enabled: z.boolean(),
          id: z.string(),
          keyId: z.string(),
        })
        .strict(),
    })
    .strict(),
);

export const googleFormSubmissionListResponseSchema = successSchema(
  z
    .object({
      items: z.array(googleFormSubmissionItemSchema),
      pagination: z
        .object({
          page: z.number().int().positive(),
          pageSize: z.number().int().positive(),
          totalItems: z.number().int().nonnegative(),
          totalPages: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
);

const reportPlaceSummarySchema = z
  .object({
    address: z.string(),
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    verificationStatus: z.enum(verificationStatusValues),
    version: z.number().int().positive(),
  })
  .strict();

const reportReviewerSchema = z
  .object({
    claimExpired: z.boolean(),
    claimExpiresAt: z.string(),
    claimedAt: z.string(),
    email: z.string(),
    id: z.string(),
  })
  .strict();

const auditEntrySchema = z
  .object({
    action: z.string(),
    actorId: z.string().nullable(),
    actorType: z.enum(['USER', 'ADMIN', 'SYSTEM', 'INTEGRATION']),
    createdAt: z.string(),
    id: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    nextStatus: z.string().nullable(),
    previousStatus: z.string().nullable(),
    requestId: z.string(),
    resourceId: z.string(),
    resourceType: z.string(),
  })
  .strict();

const placeHistorySchema = z
  .object({
    actorId: z.string().nullable(),
    after: z.record(z.string(), z.unknown()),
    before: z.record(z.string(), z.unknown()).nullable(),
    changedFields: z.array(z.string()),
    createdAt: z.string(),
    id: z.string(),
    nextVersion: z.number().int().positive(),
    previousVersion: z.number().int().positive().nullable(),
    reason: z.string().nullable(),
    sourceId: z.string().nullable(),
    sourceType: z.string(),
  })
  .strict();

const reportDetailSchema = z
  .object({
    appliedChangeSummary: z.record(z.string(), z.unknown()).nullable(),
    audit: z.array(auditEntrySchema),
    currentPlace: reportPlaceSummarySchema.extend({
      categories: z.array(z.enum(contributionCategoryValues)),
      description: z.string().nullable(),
      facilities: z.array(facilitySchema),
      latitude: z.number(),
      longitude: z.number(),
      menus: z.array(
        z
          .object({
            id: z.string(),
            isAvailable: z.boolean(),
            name: z.string(),
            priceAmount: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      operatingHours: z.array(operatingHourSchema),
    }),
    currentReviewer: reportReviewerSchema.nullable(),
    evidenceReference: z.string().nullable(),
    evidenceUrl: z.string().nullable(),
    explanation: z.string(),
    history: z.array(auditEntrySchema),
    id: z.string(),
    place: reportPlaceSummarySchema,
    placeHistory: z.array(placeHistorySchema),
    proposal: approvedPlacePatchSchema,
    relatedPendingReports: z.array(
      z
        .object({
          id: z.string(),
          reportType: z.enum(reportTypeValues),
          submittedAt: z.string(),
        })
        .strict(),
    ),
    reporter: z.object({ id: z.string(), maskedEmail: z.string() }).strict(),
    reportType: z.enum(reportTypeValues),
    resolution: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    status: z.enum(reportStatusValues),
    submittedAt: z.string(),
    version: z.number().int().positive(),
  })
  .strict();

export const adminReportQueueResponseSchema = successSchema(
  z
    .object({
      items: z.array(
        z
          .object({
            category: z.enum(contributionCategoryValues),
            currentReviewer: reportReviewerSchema.nullable(),
            id: z.string(),
            place: z
              .object({
                id: z.string(),
                name: z.string(),
                version: z.number().int().positive(),
              })
              .strict(),
            reporter: z.object({ id: z.string(), maskedEmail: z.string() }).strict(),
            reportType: z.enum(reportTypeValues),
            status: z.enum(reportStatusValues),
            submittedAt: z.string(),
            version: z.number().int().positive(),
          })
          .strict(),
      ),
      pagination: z
        .object({
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        })
        .strict(),
    })
    .strict(),
);

export const adminReportDetailResponseSchema = successSchema(reportDetailSchema);

export const reportMutationResponseSchema = successSchema(
  z
    .object({
      replayed: z.boolean(),
      report: reportDetailSchema,
    })
    .strict(),
);

export const auditLogPageResponseSchema = successSchema(
  z
    .object({
      items: z.array(auditEntrySchema),
      pagination: z
        .object({
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        })
        .strict(),
    })
    .strict(),
);
