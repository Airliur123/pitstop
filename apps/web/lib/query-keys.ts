import type { PublicCategoryCode, PublicPlaceSort } from '@pitstop/contracts';

import { type ActiveLocationQueryKey, NORMAL_RADIUS_METERS } from './location';

export const queryKeys = {
  authSession: () => ['auth', 'session'] as const,
  categories: () => ['public', 'categories'] as const,
  detail: (slug: string) => ['public', 'places', 'detail', slug] as const,
  places: (
    locationKey: ActiveLocationQueryKey,
    input: {
      budgetAmount: number | null;
      category: PublicCategoryCode;
      sort: PublicPlaceSort;
    },
  ) =>
    [
      'public',
      'places',
      'search',
      ...locationKey,
      NORMAL_RADIUS_METERS,
      input.category,
      input.budgetAmount,
      input.sort,
    ] as const,
  recommendations: (
    locationKey: ActiveLocationQueryKey,
    input: {
      budgetAmount: number | null;
      category: PublicCategoryCode;
      limit: number;
    },
  ) =>
    [
      'public',
      'recommendations',
      ...locationKey,
      NORMAL_RADIUS_METERS,
      input.category,
      input.budgetAmount,
      input.limit,
    ] as const,
};
