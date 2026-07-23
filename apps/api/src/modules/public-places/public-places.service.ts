import { Inject, Injectable } from '@nestjs/common';
import type {
  PlaceDetailMeta,
  PublicPlaceDetail,
  PublicPlaceListItem,
  PublicPlacesMeta,
  PublicPlacesQueryMeta,
} from '@pitstop/contracts';
import {
  findPublicPlaceBySlug,
  type Pool,
  type PublicPlaceCursor,
  searchPublicPlaces,
} from '@pitstop/database';
import type { PublicPlacesQuery } from '@pitstop/validation';

import { PublicCacheService } from '../../common/cache/public-cache.service';
import { DATABASE_POOL } from '../../common/database/database.module';
import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { createCursorQueryHash, decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { mapPublicPlace, mapPublicPlaceDetail } from './public-place.mapper';

export interface PublicPlacesServiceResult {
  readonly data: readonly PublicPlaceListItem[];
  readonly meta: Omit<PublicPlacesMeta, 'requestId' | 'generatedAt'>;
}

export interface PublicPlaceDetailServiceResult {
  readonly data: PublicPlaceDetail;
  readonly meta: Omit<PlaceDetailMeta, 'requestId' | 'generatedAt'>;
}

@Injectable()
export class PublicPlacesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(PublicCacheService) private readonly cache: PublicCacheService,
  ) {}

  async search(query: PublicPlacesQuery): Promise<PublicPlacesServiceResult> {
    if (query.limit > this.environment.PUBLIC_MAX_SEARCH_LIMIT) {
      throw new ApiProblemException({
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Invalid limit',
        detail: `limit cannot exceed ${this.environment.PUBLIC_MAX_SEARCH_LIMIT}.`,
      });
    }
    if (
      query.budgetAmount !== undefined &&
      query.budgetAmount > this.environment.PUBLIC_BUDGET_MAX_AMOUNT
    ) {
      throw new ApiProblemException({
        status: 400,
        code: 'INVALID_BUDGET',
        title: 'Invalid budget',
        detail: `budgetAmount cannot exceed ${this.environment.PUBLIC_BUDGET_MAX_AMOUNT}.`,
      });
    }

    const budgetApplied =
      query.budgetAmount !== undefined &&
      (query.category === 'MAKAN_MURAH' || query.category === 'NGOPI');
    const cursorQuery = {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusMeters: query.radiusMeters,
      category: query.category ?? null,
      budgetAmount: query.budgetAmount ?? null,
      budgetApplied,
      sort: query.sort,
    };
    const queryHash = createCursorQueryHash(cursorQuery);
    const decodedCursor =
      query.cursor === undefined
        ? undefined
        : decodeCursor(
            query.cursor,
            query.sort,
            queryHash,
            this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
          );
    const databaseCursor: PublicPlaceCursor | undefined = decodedCursor
      ? {
          id: decodedCursor.id,
          distanceMeters: decodedCursor.distanceMeters,
          priceAmount: decodedCursor.priceAmount,
          dataFreshnessAt: decodedCursor.dataFreshnessAt,
        }
      : undefined;
    const key = {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusMeters: query.radiusMeters,
      category: query.category ?? null,
      budgetAmount: query.budgetAmount ?? null,
      budgetApplied,
      limit: query.limit,
      cursor: query.cursor ?? null,
      sort: query.sort,
    };
    const cached = await this.cache.remember(
      'places-search',
      key,
      this.environment.CACHE_SEARCH_TTL_SECONDS,
      async () => {
        const result = await searchPublicPlaces(this.pool, {
          latitude: query.latitude,
          longitude: query.longitude,
          radiusMeters: query.radiusMeters,
          category: query.category ?? null,
          budgetAmount: query.budgetAmount ?? null,
          budgetApplied,
          limit: query.limit,
          sort: query.sort,
          ...(databaseCursor ? { cursor: databaseCursor } : {}),
        });
        const data = result.places.map((place) => mapPublicPlace(place, budgetApplied));
        const last = result.places.at(-1);
        const nextCursor =
          result.hasMore && last
            ? encodeCursor(
                {
                  version: 2,
                  queryHash,
                  sort: query.sort,
                  id: last.id,
                  distanceMeters: last.distanceMeters,
                  priceAmount: last.cheapestAvailableMainItem?.priceAmount ?? null,
                  dataFreshnessAt: last.dataFreshnessAt,
                },
                this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
              )
            : null;
        return {
          data,
          pagination: { nextCursor, hasMore: result.hasMore },
        };
      },
      isSearchCacheValue,
    );

    const queryMeta: PublicPlacesQueryMeta = {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusMeters: query.radiusMeters,
      category: query.category ?? null,
      budgetAmount: query.budgetAmount ?? null,
      budgetApplied,
      limit: query.limit,
      sort: query.sort,
    };
    return {
      data: cached.value.data,
      meta: {
        pagination: cached.value.pagination,
        query: queryMeta,
        cache: cached.status,
      },
    };
  }

  async findBySlug(slug: string): Promise<PublicPlaceDetailServiceResult> {
    const cached = await this.cache.remember(
      'place-detail',
      { slug },
      this.environment.CACHE_PLACE_DETAIL_TTL_SECONDS,
      async () => {
        const place = await findPublicPlaceBySlug(this.pool, slug);
        if (!place) {
          throw new ApiProblemException({
            status: 404,
            code: 'PLACE_NOT_FOUND',
            title: 'Place not found',
            detail: 'The requested public place does not exist.',
          });
        }
        return mapPublicPlaceDetail(place);
      },
      isPublicPlaceDetail,
    );
    return { data: cached.value, meta: { cache: cached.status } };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchCacheValue(value: unknown): value is {
  readonly data: readonly PublicPlaceListItem[];
  readonly pagination: PublicPlacesMeta['pagination'];
} {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) return false;
  return (
    (typeof value.pagination.nextCursor === 'string' || value.pagination.nextCursor === null) &&
    typeof value.pagination.hasMore === 'boolean' &&
    value.data.every(isPublicPlaceListItem)
  );
}

function isPublicPlaceDetail(value: unknown): value is PublicPlaceDetail {
  return (
    isPublicPlaceListItem(value) &&
    isRecord(value) &&
    typeof value.district === 'string' &&
    typeof value.city === 'string' &&
    typeof value.province === 'string' &&
    (typeof value.postalCode === 'string' || value.postalCode === null) &&
    (typeof value.verifiedAt === 'string' || value.verifiedAt === null) &&
    Array.isArray(value.menus) &&
    Array.isArray(value.facilities) &&
    Array.isArray(value.operatingHours) &&
    Array.isArray(value.operatingHourExceptions) &&
    isRecord(value.photos) &&
    typeof value.photos.available === 'boolean' &&
    typeof value.photos.count === 'number'
  );
}

function isPublicPlaceListItem(value: unknown): value is PublicPlaceListItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    typeof value.distanceMeters === 'number' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    typeof value.dataFreshnessAt === 'string' &&
    Array.isArray(value.categories) &&
    Array.isArray(value.facilitySummary) &&
    isRecord(value.primaryCategory) &&
    (isRecord(value.cheapestAvailableMainItem) || value.cheapestAvailableMainItem === null) &&
    (typeof value.budgetMatch === 'boolean' || value.budgetMatch === null)
  );
}
