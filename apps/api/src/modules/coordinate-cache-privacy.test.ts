import type { Pool } from '@pitstop/database';
import type { PublicPlacesQuery, RecommendationsQuery } from '@pitstop/validation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicCacheService } from '../common/cache/public-cache.service';
import type { ApiEnvironmentProvider } from '../configuration';
import { PublicPlacesService } from './public-places/public-places.service';
import { RecommendationsService } from './recommendations/recommendations.service';

const database = vi.hoisted(() => ({
  findRecommendationFallback: vi.fn(),
  searchPublicPlaces: vi.fn(),
}));

vi.mock('@pitstop/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pitstop/database')>();
  return {
    ...original,
    findRecommendationFallback: database.findRecommendationFallback,
    searchPublicPlaces: database.searchPublicPlaces,
  };
});

const environment = {
  PUBLIC_BUDGET_MAX_AMOUNT: 10_000_000,
  PUBLIC_CURSOR_SIGNING_SECRET: 'coordinate-cache-privacy-test-secret',
  PUBLIC_FALLBACK_RADIUS_METERS: 20_000,
  PUBLIC_MAX_SEARCH_LIMIT: 50,
  PUBLIC_RECOMMENDATION_CANDIDATE_LIMIT: 20,
} as ApiEnvironmentProvider;

const placesQuery: PublicPlacesQuery = {
  category: 'TOILET',
  latitude: -6.1468,
  limit: 20,
  longitude: 106.8061,
  radiusMeters: 5_000,
  sort: 'NEAREST',
};

const recommendationsQuery: RecommendationsQuery = {
  category: 'TOILET',
  latitude: -6.1468,
  limit: 4,
  longitude: 106.8061,
  radiusMeters: 5_000,
};

function cacheWithRedisSpy() {
  const redis = { run: vi.fn() };
  const cache = new PublicCacheService(
    { REDIS_CACHE_ENABLED: true } as ConstructorParameters<typeof PublicCacheService>[0],
    redis as unknown as ConstructorParameters<typeof PublicCacheService>[1],
  );
  return { cache, redis };
}

describe('coordinate-derived public lookup privacy', () => {
  beforeEach(() => {
    database.searchPublicPlaces.mockReset().mockResolvedValue({
      hasMore: false,
      places: [],
    });
    database.findRecommendationFallback.mockReset().mockResolvedValue({
      categoryPlaceCount: 0,
      minimumMainItemAmountWithinRadius: null,
      nearestOutsidePlace: null,
      verifiedPlaceCount: 0,
    });
  });

  it('bypasses every Redis read and write for public place search', async () => {
    const { cache, redis } = cacheWithRedisSpy();
    const service = new PublicPlacesService({} as Pool, environment, cache);

    const result = await service.search(placesQuery);

    expect(result.meta.cache).toBe('BYPASS');
    expect(result.meta.query).toMatchObject({
      latitude: placesQuery.latitude,
      longitude: placesQuery.longitude,
      radiusMeters: 5_000,
    });
    expect(database.searchPublicPlaces).toHaveBeenCalledOnce();
    expect(redis.run).not.toHaveBeenCalled();
  });

  it('bypasses every Redis read and write for recommendations', async () => {
    const { cache, redis } = cacheWithRedisSpy();
    const service = new RecommendationsService({} as Pool, environment, cache);

    const result = await service.find(recommendationsQuery);

    expect(result.meta.cache).toBe('BYPASS');
    expect(result.meta.query).toMatchObject({
      latitude: recommendationsQuery.latitude,
      longitude: recommendationsQuery.longitude,
      radiusMeters: 5_000,
    });
    expect(database.searchPublicPlaces).toHaveBeenCalledOnce();
    expect(database.findRecommendationFallback).toHaveBeenCalledOnce();
    expect(redis.run).not.toHaveBeenCalled();
  });
});
