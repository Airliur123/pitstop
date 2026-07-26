import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  RecommendationFallback,
  RecommendationMeta,
  RecommendationQueryMeta,
  RecommendationResult,
} from '@pitstop/contracts';
import {
  type DatabasePublicPlace,
  findRecommendationFallback,
  type Pool,
  searchPublicPlaces,
} from '@pitstop/database';
import type { RecommendationsQuery } from '@pitstop/validation';

import { PublicCacheService } from '../../common/cache/public-cache.service';
import { DATABASE_POOL } from '../../common/database/database.module';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { mapPublicPlace } from '../public-places/public-place.mapper';
import { rankRecommendations } from './recommendation-ranking';

export interface RecommendationsServiceResult {
  readonly data: RecommendationResult;
  readonly meta: Omit<RecommendationMeta, 'requestId' | 'generatedAt'>;
}

interface CachedRecommendation {
  readonly data: RecommendationResult;
  readonly fallback: RecommendationFallback | null;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(PublicCacheService) private readonly cache: PublicCacheService,
  ) {}

  async find(query: RecommendationsQuery): Promise<RecommendationsServiceResult> {
    const budgetApplied = query.category === 'MAKAN_MURAH' || query.category === 'NGOPI';
    const lookup = await this.cache.bypass(async (): Promise<CachedRecommendation> => {
      const candidates = await searchPublicPlaces(this.pool, {
        latitude: query.latitude,
        longitude: query.longitude,
        radiusMeters: query.radiusMeters,
        category: query.category,
        budgetAmount: query.budgetAmount ?? null,
        budgetApplied,
        sort: 'NEAREST',
        limit: this.environment.PUBLIC_RECOMMENDATION_CANDIDATE_LIMIT,
      });
      const ranked = rankRecommendations({
        candidates: candidates.places,
        budgetAmount: query.budgetAmount ?? null,
        budgetApplied,
        radiusMeters: query.radiusMeters,
        limit: query.limit,
        now: new Date(),
      });
      if (ranked.length > 0) {
        return {
          data: { primary: ranked[0] ?? null, alternatives: ranked.slice(1, 4) },
          fallback: null,
        };
      }
      if (candidates.places.length > 0) {
        return {
          data: { primary: null, alternatives: [] },
          fallback: { reason: 'ALL_PLACES_CLOSED' },
        };
      }
      const diagnostic = await findRecommendationFallback(this.pool, {
        latitude: query.latitude,
        longitude: query.longitude,
        radiusMeters: query.radiusMeters,
        fallbackRadiusMeters: this.environment.PUBLIC_FALLBACK_RADIUS_METERS,
        category: query.category,
        budgetAmount: query.budgetAmount ?? null,
        budgetApplied,
      });
      return {
        data: { primary: null, alternatives: [] },
        fallback: this.mapFallback(diagnostic, query.budgetAmount ?? null, budgetApplied),
      };
    });
    if (lookup.value.fallback) {
      this.logger.debug({ fallbackReason: lookup.value.fallback.reason });
    }
    const queryMeta: RecommendationQueryMeta = {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusMeters: query.radiusMeters,
      category: query.category,
      budgetAmount: query.budgetAmount ?? null,
      budgetApplied,
      limit: query.limit,
    };
    return {
      data: lookup.value.data,
      meta: {
        query: queryMeta,
        fallback: lookup.value.fallback,
        cache: lookup.status,
      },
    };
  }

  private mapFallback(
    diagnostic: Awaited<ReturnType<typeof findRecommendationFallback>>,
    budgetAmount: number | null,
    budgetApplied: boolean,
  ): RecommendationFallback {
    if (
      budgetApplied &&
      budgetAmount !== null &&
      diagnostic.minimumMainItemAmountWithinRadius !== null &&
      diagnostic.minimumMainItemAmountWithinRadius > budgetAmount
    ) {
      return {
        reason: 'BUDGET_TOO_LOW',
        minimumRequiredBudgetAmount: diagnostic.minimumMainItemAmountWithinRadius,
      };
    }
    if (diagnostic.nearestOutsidePlace) {
      return this.outsideRadiusFallback(diagnostic.nearestOutsidePlace, budgetApplied);
    }
    if (diagnostic.categoryPlaceCount === 0) return { reason: 'NO_CATEGORY_MATCH' };
    return { reason: 'NO_VERIFIED_MATCH' };
  }

  private outsideRadiusFallback(
    place: DatabasePublicPlace,
    budgetApplied: boolean,
  ): RecommendationFallback {
    const mapped = mapPublicPlace(place, budgetApplied);
    return {
      reason: 'OUTSIDE_RADIUS',
      nearestDistanceMeters: mapped.distanceMeters,
      nearestPlace: {
        id: mapped.id,
        slug: mapped.slug,
        name: mapped.name,
        distanceMeters: mapped.distanceMeters,
        primaryCategory: mapped.primaryCategory,
      },
    };
  }
}
