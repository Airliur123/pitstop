import type { DatabasePublicPlace } from '@pitstop/database';
import { publicPlacesQuerySchema, recommendationsQuerySchema } from '@pitstop/validation';
import { describe, expect, it, vi } from 'vitest';

import { mapPublicPlace } from '../modules/public-places/public-place.mapper';
import { resolveOpenStatus } from '../modules/recommendations/open-status';
import { rankRecommendations } from '../modules/recommendations/recommendation-ranking';
import { createCacheKey } from './cache/cache-key';
import { PublicCacheService } from './cache/public-cache.service';
import { createCursorQueryHash, decodeCursor, encodeCursor } from './pagination/cursor';

describe('Phase 3 public API foundation', () => {
  it('validates plain coordinates and rejects exponent/duplicate coordinate inputs', () => {
    expect(
      publicPlacesQuerySchema.parse({ latitude: '-6.1468', longitude: '106.8061' }),
    ).toMatchObject({ latitude: -6.1468, longitude: 106.8061, radiusMeters: 5_000 });
    expect(() =>
      publicPlacesQuerySchema.parse({ latitude: '1e2', longitude: '106.8061' }),
    ).toThrow();
    expect(() =>
      publicPlacesQuerySchema.parse({ latitude: ['-6.1', '-6.2'], longitude: '106.8' }),
    ).toThrow();
  });

  it('enforces radius, budget, limit, and category constraints', () => {
    expect(() =>
      publicPlacesQuerySchema.parse({
        latitude: '-6.1',
        longitude: '106.8',
        radiusMeters: '5001',
      }),
    ).toThrow();
    expect(() =>
      publicPlacesQuerySchema.parse({
        latitude: '-6.1',
        longitude: '106.8',
        budgetAmount: '10.5',
      }),
    ).toThrow();
    expect(() =>
      publicPlacesQuerySchema.parse({
        latitude: '-6.1',
        longitude: '106.8',
        sort: 'DROP TABLE places',
      }),
    ).toThrow();
    expect(() =>
      recommendationsQuerySchema.parse({
        latitude: '-6.1',
        longitude: '106.8',
        category: 'MAKAN_MURAH',
      }),
    ).toThrow(/budgetAmount/);
  });

  it('signs a query-bound cursor and rejects payload, signature, and query tampering', () => {
    const signingSecret = 'test-public-cursor-signing-secret-0123456789';
    const query = {
      latitude: -6.1468,
      longitude: 106.8061,
      radiusMeters: 5_000,
      category: 'MAKAN_MURAH',
      budgetAmount: 12_000,
      budgetApplied: true,
      sort: 'NEAREST' as const,
    };
    const queryHash = createCursorQueryHash(query);
    const cursor = encodeCursor(
      {
        version: 2,
        queryHash,
        sort: 'NEAREST',
        id: '01J00000000000000000000000',
        distanceMeters: 123.45,
        priceAmount: 12_000,
        dataFreshnessAt: '2026-07-23T00:00:00.000Z',
      },
      signingSecret,
    );
    expect(cursor).not.toContain('{');
    expect(decodeCursor(cursor, 'NEAREST', queryHash, signingSecret).distanceMeters).toBe(123.45);

    const [payload, signature] = cursor.split('.');
    if (!payload || !signature) throw new Error('Expected a payload and signature');
    expect(() =>
      decodeCursor(`${flipCharacter(payload)}.${signature}`, 'NEAREST', queryHash, signingSecret),
    ).toThrow(/cursor/i);
    expect(() =>
      decodeCursor(`${payload}.${flipCharacter(signature)}`, 'NEAREST', queryHash, signingSecret),
    ).toThrow(/cursor/i);
    expect(() => decodeCursor(cursor, 'CHEAPEST', queryHash, signingSecret)).toThrow(/cursor/i);
    expect(() =>
      decodeCursor(
        cursor,
        'NEAREST',
        createCursorQueryHash({ ...query, category: 'NGOPI' }),
        signingSecret,
      ),
    ).toThrow(/cursor/i);
    expect(() =>
      decodeCursor(
        cursor,
        'NEAREST',
        createCursorQueryHash({ ...query, budgetAmount: 15_000 }),
        signingSecret,
      ),
    ).toThrow(/cursor/i);
    expect(() =>
      decodeCursor(
        cursor,
        'NEAREST',
        createCursorQueryHash({ ...query, radiusMeters: 1_000 }),
        signingSecret,
      ),
    ).toThrow(/cursor/i);
    expect(() =>
      decodeCursor(
        cursor,
        'NEAREST',
        createCursorQueryHash({ ...query, latitude: -6.15 }),
        signingSecret,
      ),
    ).toThrow(/cursor/i);
    expect(() => decodeCursor('JyBPUiAxPTEgLS0', 'NEAREST', queryHash, signingSecret)).toThrow(
      /cursor/i,
    );
    expect(createCursorQueryHash({ ...query, latitude: -0, longitude: 0 })).toBe(
      createCursorQueryHash({ ...query, latitude: 0, longitude: 0 }),
    );
  });

  it('normalizes cache objects and hashes precise query data', () => {
    const left = createCacheKey('search', { longitude: 106.8, category: 'NGOPI', limit: 20 });
    const right = createCacheKey('search', { limit: 20, category: 'NGOPI', longitude: 106.8 });
    expect(left).toBe(right);
    expect(left).not.toContain('106.8');
    expect(left).not.toContain('NGOPI');
  });

  it.each([
    ['null', 'null'],
    ['object with an invalid shape', '{"unexpected":true}'],
    ['array with an invalid item', '["MAKAN_MURAH",3]'],
  ])('treats a JSON-valid but shape-invalid cache entry (%s) as a miss', async (_label, cached) => {
    const redis = {
      run: vi
        .fn()
        .mockResolvedValueOnce(cached)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce('OK'),
    };
    const cache = new PublicCacheService(
      { REDIS_CACHE_ENABLED: true } as ConstructorParameters<typeof PublicCacheService>[0],
      redis as unknown as ConstructorParameters<typeof PublicCacheService>[1],
    );
    const loader = vi.fn().mockResolvedValue(['MAKAN_MURAH']);
    const isValidCategoryCodes = (value: unknown): value is readonly string[] =>
      Array.isArray(value) && value.every((entry) => typeof entry === 'string');

    await expect(
      cache.remember('categories', { active: true }, 60, loader, isValidCategoryCodes),
    ).resolves.toEqual({ value: ['MAKAN_MURAH'], status: 'MISS' });
    expect(loader).toHaveBeenCalledOnce();
    expect(redis.run).toHaveBeenCalledTimes(3);
  });

  it('does not cache a loader error after deleting a malformed cache entry', async () => {
    const redis = { run: vi.fn().mockResolvedValueOnce('null').mockResolvedValueOnce(1) };
    const cache = new PublicCacheService(
      { REDIS_CACHE_ENABLED: true } as ConstructorParameters<typeof PublicCacheService>[0],
      redis as unknown as ConstructorParameters<typeof PublicCacheService>[1],
    );
    const loader = vi.fn().mockRejectedValue(new Error('database unavailable'));

    await expect(
      cache.remember('categories', { active: true }, 60, loader, Array.isArray),
    ).rejects.toThrow('database unavailable');
    expect(redis.run).toHaveBeenCalledTimes(2);
  });

  it('evaluates overnight and 24-hour schedules in Asia/Jakarta', () => {
    const overnight = [
      {
        dayOfWeek: 4,
        sequence: 0,
        opensAt: '17:00:00',
        closesAt: '01:00:00',
        is24Hours: false,
      },
    ];
    expect(resolveOpenStatus(overnight, [], new Date('2026-07-23T16:30:00.000Z'))).toBe('OPEN');
    expect(resolveOpenStatus(overnight, [], new Date('2026-07-23T17:30:00.000Z'))).toBe(
      'CLOSING_SOON',
    );
    expect(
      resolveOpenStatus(
        [
          {
            dayOfWeek: 4,
            sequence: 0,
            opensAt: null,
            closesAt: null,
            is24Hours: true,
          },
        ],
        [],
        new Date('2026-07-23T05:00:00.000Z'),
      ),
    ).toBe('OPEN');
    expect(resolveOpenStatus([], [], new Date('2026-07-23T05:00:00.000Z'))).toBe('UNKNOWN');
  });

  it('ranks deterministically with transparent score components and stable tie-breakers', () => {
    const now = new Date('2026-07-23T05:00:00.000Z');
    const nearest = candidate({
      id: '01J00000000000000000000001',
      name: 'Nearest',
      distanceMeters: 100,
      priceAmount: 12_000,
    });
    const cheapest = candidate({
      id: '01J00000000000000000000002',
      name: 'Cheapest',
      distanceMeters: 500,
      priceAmount: 5_000,
    });
    const ranked = rankRecommendations({
      candidates: [nearest, cheapest],
      budgetAmount: 15_000,
      budgetApplied: true,
      radiusMeters: 5_000,
      limit: 4,
      now,
    });
    expect(ranked.map(({ name }) => name)).toEqual(['Cheapest', 'Nearest']);
    expect(ranked[0]?.rankingReason).toBe('CHEAPEST_NEARBY');
    expect(ranked[0]?.score).toMatchObject({
      budgetFit: 0.666667,
      open: 1,
    });
  });

  it('maps database rows without leaking internal fields', () => {
    const mapped = mapPublicPlace(
      candidate({
        id: '01J00000000000000000000001',
        name: 'Safe projection',
        distanceMeters: 100,
        priceAmount: 12_000,
      }),
      true,
    );
    expect(mapped).toMatchObject({
      name: 'Safe projection',
      placeStatus: 'ACTIVE',
      verificationStatus: 'ADMIN_VERIFIED',
      budgetMatch: true,
    });
    expect(JSON.stringify(mapped)).not.toContain('deletedAt');
    expect(JSON.stringify(mapped)).not.toContain('objectKey');
  });
});

function flipCharacter(value: string): string {
  const first = value.at(0);
  if (!first) throw new Error('Expected a non-empty encoded cursor component');
  return `${first === 'A' ? 'B' : 'A'}${value.slice(1)}`;
}

function candidate(input: {
  readonly id: string;
  readonly name: string;
  readonly distanceMeters: number;
  readonly priceAmount: number;
}): DatabasePublicPlace {
  return {
    id: input.id,
    slug: input.name.toLowerCase(),
    name: input.name,
    description: 'Data Simulasi',
    address: 'Alamat Data Simulasi',
    landmark: null,
    district: 'Tambora',
    city: 'Jakarta Barat',
    province: 'DKI Jakarta',
    postalCode: null,
    longitude: 106.8,
    latitude: -6.14,
    distanceMeters: input.distanceMeters,
    dataFreshnessAt: '2026-07-23T00:00:00.000Z',
    primaryCategory: {
      id: '01J00000000000000000000010',
      code: 'MAKAN_MURAH',
      name: 'Makan Murah',
      isPrimary: true,
    },
    categories: [
      {
        id: '01J00000000000000000000010',
        code: 'MAKAN_MURAH',
        name: 'Makan Murah',
        isPrimary: true,
      },
    ],
    facilities: [],
    cheapestAvailableMainItem: { name: 'Menu', priceAmount: input.priceAmount },
    cheapestQualifyingItem: { name: 'Menu', priceAmount: input.priceAmount },
    operatingHours: [
      {
        dayOfWeek: 4,
        sequence: 0,
        opensAt: '08:00:00',
        closesAt: '22:00:00',
        is24Hours: false,
      },
    ],
    operatingHourExceptions: [],
    communityConfirmationCount: 0,
  };
}
