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
