const requestMetadata = {
  type: 'object' as const,
  required: ['requestId', 'generatedAt'],
  properties: {
    requestId: { type: 'string' as const },
    generatedAt: { type: 'string' as const, format: 'date-time' },
  },
};

const category = {
  type: 'object' as const,
  required: ['id', 'code', 'name', 'isPrimary'],
  properties: {
    id: { type: 'string' as const },
    code: {
      type: 'string' as const,
      enum: ['MAKAN_MURAH', 'NGOPI', 'TOILET', 'MUSALA', 'ISTIRAHAT'],
    },
    name: { type: 'string' as const },
    isPrimary: { type: 'boolean' as const },
  },
};

const placeListItem = {
  type: 'object' as const,
  required: [
    'id',
    'slug',
    'name',
    'address',
    'primaryCategory',
    'categories',
    'distanceMeters',
    'latitude',
    'longitude',
    'placeStatus',
    'verificationStatus',
    'dataFreshnessAt',
    'budgetMatch',
    'facilitySummary',
  ],
  properties: {
    id: { type: 'string' as const },
    slug: { type: 'string' as const },
    name: { type: 'string' as const },
    shortDescription: { type: 'string' as const, nullable: true },
    address: { type: 'string' as const },
    landmark: { type: 'string' as const, nullable: true },
    primaryCategory: category,
    categories: { type: 'array' as const, items: category },
    distanceMeters: { type: 'integer' as const, minimum: 0 },
    latitude: { type: 'number' as const, minimum: -90, maximum: 90 },
    longitude: { type: 'number' as const, minimum: -180, maximum: 180 },
    placeStatus: { type: 'string' as const, enum: ['ACTIVE'] },
    verificationStatus: { type: 'string' as const, enum: ['ADMIN_VERIFIED'] },
    dataFreshnessAt: { type: 'string' as const, format: 'date-time' },
    budgetMatch: { type: 'boolean' as const, nullable: true },
    facilitySummary: { type: 'array' as const, items: { type: 'object' as const } },
  },
};

export const problemDetailsSchema = {
  type: 'object' as const,
  required: [
    'success',
    'error',
    'requestId',
    'type',
    'title',
    'status',
    'code',
    'detail',
    'instance',
  ],
  properties: {
    success: { type: 'boolean' as const, enum: [false] },
    error: { type: 'object' as const },
    requestId: { type: 'string' as const },
    type: { type: 'string' as const, format: 'uri' },
    title: { type: 'string' as const },
    status: { type: 'integer' as const },
    code: { type: 'string' as const },
    detail: { type: 'string' as const },
    instance: { type: 'string' as const },
    validationErrors: { type: 'array' as const, items: { type: 'object' as const } },
  },
};

export const categoriesResponseSchema = {
  type: 'object' as const,
  required: ['success', 'data', 'requestId', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: {
      type: 'array' as const,
      items: {
        ...category,
        required: [...category.required, 'description', 'sortOrder', 'supportsBudget'],
        properties: {
          ...category.properties,
          description: { type: 'string' as const, nullable: true },
          sortOrder: { type: 'integer' as const, minimum: 0 },
          supportsBudget: { type: 'boolean' as const },
        },
      },
    },
    requestId: { type: 'string' as const },
    meta: requestMetadata,
  },
};

export const placesResponseSchema = {
  type: 'object' as const,
  required: ['success', 'data', 'requestId', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: { type: 'array' as const, items: placeListItem },
    requestId: { type: 'string' as const },
    meta: {
      ...requestMetadata,
      required: [...requestMetadata.required, 'pagination', 'query', 'cache'],
      properties: {
        ...requestMetadata.properties,
        pagination: { type: 'object' as const },
        query: { type: 'object' as const },
        cache: { type: 'string' as const, enum: ['HIT', 'MISS', 'BYPASS'] },
      },
    },
  },
};

export const placeDetailResponseSchema = {
  type: 'object' as const,
  required: ['success', 'data', 'requestId', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: {
      type: 'object' as const,
      required: [
        'id',
        'slug',
        'name',
        'latitude',
        'longitude',
        'categories',
        'menus',
        'facilities',
        'operatingHours',
        'operatingHourExceptions',
        'photos',
      ],
      properties: {
        id: { type: 'string' as const },
        slug: { type: 'string' as const },
        name: { type: 'string' as const },
        latitude: { type: 'number' as const },
        longitude: { type: 'number' as const },
        categories: { type: 'array' as const, items: category },
        menus: { type: 'array' as const, items: { type: 'object' as const } },
        facilities: { type: 'array' as const, items: { type: 'object' as const } },
        operatingHours: { type: 'array' as const, items: { type: 'object' as const } },
        operatingHourExceptions: {
          type: 'array' as const,
          items: { type: 'object' as const },
        },
        photos: { type: 'object' as const },
      },
    },
    requestId: { type: 'string' as const },
    meta: requestMetadata,
  },
};

export const recommendationsResponseSchema = {
  type: 'object' as const,
  required: ['success', 'data', 'requestId', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: {
      type: 'object' as const,
      required: ['primary', 'alternatives'],
      properties: {
        primary: { ...placeListItem, nullable: true },
        alternatives: { type: 'array' as const, maxItems: 3, items: placeListItem },
      },
    },
    requestId: { type: 'string' as const },
    meta: {
      ...requestMetadata,
      required: [...requestMetadata.required, 'query', 'fallback', 'cache'],
      properties: {
        ...requestMetadata.properties,
        query: { type: 'object' as const },
        fallback: { type: 'object' as const, nullable: true },
        cache: { type: 'string' as const, enum: ['HIT', 'MISS', 'BYPASS'] },
      },
    },
  },
};

const contributionPayload = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    placeName: { type: 'string' as const, maxLength: 180 },
    category: {
      type: 'string' as const,
      enum: ['MAKAN_MURAH', 'NGOPI', 'TOILET', 'MUSALA', 'ISTIRAHAT'],
    },
    address: { type: 'string' as const, maxLength: 500 },
    landmark: { type: 'string' as const, maxLength: 255 },
    mapsUrl: { type: 'string' as const, format: 'uri', maxLength: 1_000 },
    mainMenu: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['name', 'priceAmount'],
      properties: {
        name: { type: 'string' as const, maxLength: 180 },
        priceAmount: { type: 'integer' as const, minimum: 1, maximum: 10_000_000 },
      },
    },
    facilities: {
      type: 'array' as const,
      maxItems: 7,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['code', 'status'],
        properties: {
          code: {
            type: 'string' as const,
            enum: ['PARKING', 'TOILET', 'MUSALA', 'POWER_OUTLET', 'SEATING', 'SHADE', 'WIFI'],
          },
          status: {
            type: 'string' as const,
            enum: ['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN'],
          },
        },
      },
    },
    operatingHours: {
      type: 'array' as const,
      maxItems: 7,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['dayOfWeek', 'isClosed', 'is24Hours', 'opensAt', 'closesAt'],
        properties: {
          dayOfWeek: { type: 'integer' as const, minimum: 0, maximum: 6 },
          isClosed: { type: 'boolean' as const },
          is24Hours: { type: 'boolean' as const },
          opensAt: { type: 'string' as const, nullable: true, pattern: '^\\d{2}:\\d{2}$' },
          closesAt: { type: 'string' as const, nullable: true, pattern: '^\\d{2}:\\d{2}$' },
        },
      },
    },
    notes: { type: 'string' as const, maxLength: 1_000 },
  },
};

export const contributionResponseSchema = {
  type: 'object' as const,
  required: ['success', 'data', 'requestId', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: {
      type: 'object' as const,
      required: ['id', 'status', 'payload', 'version', 'createdAt', 'updatedAt', 'submittedAt'],
      properties: {
        id: { type: 'string' as const, minLength: 26, maxLength: 26 },
        status: {
          type: 'string' as const,
          enum: [
            'DRAFT',
            'PENDING',
            'IN_REVIEW',
            'NEEDS_REVISION',
            'APPROVED',
            'REJECTED',
            'MERGED',
          ],
        },
        payload: contributionPayload,
        version: { type: 'integer' as const, minimum: 1 },
        createdAt: { type: 'string' as const, format: 'date-time' },
        updatedAt: { type: 'string' as const, format: 'date-time' },
        submittedAt: { type: 'string' as const, format: 'date-time', nullable: true },
      },
    },
    requestId: { type: 'string' as const },
    meta: requestMetadata,
  },
};

const adminReviewer = {
  type: 'object' as const,
  required: ['id', 'email', 'claimedAt', 'claimExpiresAt', 'claimExpired'],
  properties: {
    id: { type: 'string' as const, minLength: 26, maxLength: 26 },
    email: { type: 'string' as const },
    claimedAt: { type: 'string' as const, format: 'date-time' },
    claimExpiresAt: { type: 'string' as const, format: 'date-time' },
    claimExpired: { type: 'boolean' as const },
  },
};

const moderationEvent = {
  type: 'object' as const,
  required: [
    'id',
    'actor',
    'previousStatus',
    'nextStatus',
    'action',
    'reason',
    'contributionVersion',
    'mergedPlaceId',
    'createdAt',
  ],
  properties: {
    id: { type: 'string' as const, minLength: 26, maxLength: 26 },
    actor: {
      type: 'object' as const,
      required: ['id', 'email'],
      properties: {
        id: { type: 'string' as const },
        email: { type: 'string' as const },
      },
    },
    previousStatus: { type: 'string' as const },
    nextStatus: { type: 'string' as const },
    action: {
      type: 'string' as const,
      enum: ['CLAIM', 'RECLAIM', 'NEEDS_REVISION', 'REJECT', 'APPROVE', 'MERGE'],
    },
    reason: { type: 'string' as const, nullable: true },
    contributionVersion: { type: 'integer' as const, minimum: 1 },
    mergedPlaceId: { type: 'string' as const, nullable: true },
    createdAt: { type: 'string' as const, format: 'date-time' },
  },
};

const verifiedLocation = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['latitude', 'longitude', 'district', 'city', 'province'],
  properties: {
    latitude: { type: 'number' as const, minimum: -90, maximum: 90 },
    longitude: { type: 'number' as const, minimum: -180, maximum: 180 },
    district: { type: 'string' as const, maxLength: 120 },
    city: { type: 'string' as const, maxLength: 120 },
    province: { type: 'string' as const, maxLength: 120 },
    postalCode: { type: 'string' as const, maxLength: 12, nullable: true },
  },
};

const adminContributionDetail = {
  type: 'object' as const,
  required: [
    'id',
    'source',
    'status',
    'payload',
    'version',
    'currentReviewer',
    'contributor',
    'decisionReason',
    'verifiedLocation',
    'publicationTarget',
    'mergedPlaceId',
    'history',
    'createdAt',
    'updatedAt',
    'submittedAt',
    'approvedAt',
    'mergedAt',
  ],
  properties: {
    id: { type: 'string' as const, minLength: 26, maxLength: 26 },
    source: {
      type: 'string' as const,
      enum: ['APPLICATION', 'GOOGLE_FORM', 'ADMIN', 'CSV_IMPORT'],
    },
    status: { type: 'string' as const },
    payload: contributionPayload,
    version: { type: 'integer' as const, minimum: 1 },
    currentReviewer: { ...adminReviewer, nullable: true },
    contributor: { type: 'object' as const, nullable: true },
    decisionReason: { type: 'string' as const, nullable: true },
    verifiedLocation: { ...verifiedLocation, nullable: true },
    publicationTarget: { type: 'object' as const, nullable: true },
    mergedPlaceId: { type: 'string' as const, nullable: true },
    history: { type: 'array' as const, items: moderationEvent },
    createdAt: { type: 'string' as const, format: 'date-time' },
    updatedAt: { type: 'string' as const, format: 'date-time' },
    submittedAt: { type: 'string' as const, format: 'date-time' },
    approvedAt: { type: 'string' as const, format: 'date-time', nullable: true },
    mergedAt: { type: 'string' as const, format: 'date-time', nullable: true },
  },
};

function successResponse(data: object) {
  return {
    type: 'object' as const,
    required: ['success', 'data', 'requestId', 'meta'],
    properties: {
      success: { type: 'boolean' as const, enum: [true] },
      data,
      requestId: { type: 'string' as const },
      meta: requestMetadata,
    },
  };
}

export const adminDashboardResponseSchema = successResponse({
  type: 'object' as const,
  required: ['totals', 'recentActivity'],
  properties: {
    totals: {
      type: 'object' as const,
      required: ['pending', 'inReview', 'needsRevision', 'approvedAwaitingMerge'],
      properties: {
        pending: { type: 'integer' as const, minimum: 0 },
        inReview: { type: 'integer' as const, minimum: 0 },
        needsRevision: { type: 'integer' as const, minimum: 0 },
        approvedAwaitingMerge: { type: 'integer' as const, minimum: 0 },
      },
    },
    recentActivity: { type: 'array' as const, items: moderationEvent },
  },
});

export const adminQueueResponseSchema = successResponse({
  type: 'object' as const,
  required: ['items', 'pagination'],
  properties: {
    items: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        required: [
          'id',
          'placeName',
          'category',
          'source',
          'status',
          'submittedAt',
          'version',
          'currentReviewer',
        ],
        properties: {
          id: { type: 'string' as const },
          placeName: { type: 'string' as const },
          category: { type: 'string' as const },
          source: { type: 'string' as const },
          status: { type: 'string' as const },
          submittedAt: { type: 'string' as const, format: 'date-time' },
          version: { type: 'integer' as const, minimum: 1 },
          currentReviewer: { ...adminReviewer, nullable: true },
        },
      },
    },
    pagination: {
      type: 'object' as const,
      required: ['hasMore', 'nextCursor'],
      properties: {
        hasMore: { type: 'boolean' as const },
        nextCursor: { type: 'string' as const, nullable: true },
      },
    },
  },
});

export const adminContributionDetailResponseSchema = successResponse(adminContributionDetail);
export const moderationMutationResponseSchema = successResponse({
  type: 'object' as const,
  required: ['contribution', 'replayed'],
  properties: {
    contribution: adminContributionDetail,
    replayed: { type: 'boolean' as const },
  },
});
export const mergeMutationResponseSchema = successResponse({
  type: 'object' as const,
  required: ['contribution', 'replayed', 'placeId', 'placeSlug'],
  properties: {
    contribution: adminContributionDetail,
    replayed: { type: 'boolean' as const },
    placeId: { type: 'string' as const },
    placeSlug: { type: 'string' as const },
  },
});

export const expectedVersionRequestSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer' as const, minimum: 1 },
  },
};

export const moderationDecisionRequestSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer' as const, minimum: 1 },
    reason: { type: 'string' as const, minLength: 10, maxLength: 500 },
  },
};

export const approveContributionRequestSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['expectedVersion', 'location', 'publicationTarget'],
  properties: {
    expectedVersion: { type: 'integer' as const, minimum: 1 },
    location: verifiedLocation,
    publicationTarget: {
      oneOf: [
        {
          type: 'object' as const,
          additionalProperties: false,
          required: ['mode'],
          properties: { mode: { type: 'string' as const, enum: ['CREATE_NEW'] } },
        },
        {
          type: 'object' as const,
          additionalProperties: false,
          required: ['mode', 'targetPlaceId'],
          properties: {
            mode: { type: 'string' as const, enum: ['MERGE_EXISTING'] },
            targetPlaceId: { type: 'string' as const, minLength: 26, maxLength: 26 },
          },
        },
      ],
    },
  },
};
