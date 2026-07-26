import type { PublicCategoryCode, PublicPlaceSort } from '@pitstop/contracts';

function coordinate(value: number) {
  return Number(value.toFixed(5));
}

export const queryKeys = {
  categories: () => ['public', 'categories'] as const,
  detail: (slug: string) => ['public', 'places', 'detail', slug] as const,
  places: (input: {
    budgetAmount: number | null;
    category: PublicCategoryCode;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    sort: PublicPlaceSort;
  }) =>
    [
      'public',
      'places',
      'search',
      coordinate(input.latitude),
      coordinate(input.longitude),
      input.radiusMeters,
      input.category,
      input.budgetAmount,
      input.sort,
    ] as const,
  recommendations: (input: {
    budgetAmount: number | null;
    category: PublicCategoryCode;
    latitude: number;
    limit: number;
    longitude: number;
    radiusMeters: number;
  }) =>
    [
      'public',
      'recommendations',
      coordinate(input.latitude),
      coordinate(input.longitude),
      input.radiusMeters,
      input.category,
      input.budgetAmount,
      input.limit,
    ] as const,
};
