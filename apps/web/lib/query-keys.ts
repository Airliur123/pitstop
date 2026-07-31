import type { PublicCategoryCode, PublicPlaceSort } from '@pitstop/contracts';

import { type ActiveLocationQueryKey, NORMAL_RADIUS_METERS } from './location';

export const queryKeys = {
  activity: (
    userId: string,
    input: Readonly<{ cursor?: string; status?: string; type?: string }>,
  ) =>
    [
      'private',
      'activity',
      userId,
      input.type ?? '',
      input.status ?? '',
      input.cursor ?? '',
    ] as const,
  authSession: () => ['auth', 'session'] as const,
  categories: () => ['public', 'categories'] as const,
  contribution: (userId: string, contributionId: string) =>
    ['private', 'contributions', userId, contributionId] as const,
  contributionsPrivate: () => ['private', 'contributions'] as const,
  privateData: () => ['private'] as const,
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
  report: (userId: string, reportId: string) => ['private', 'reports', userId, reportId] as const,
};
