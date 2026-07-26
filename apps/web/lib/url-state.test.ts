import { describe, expect, it } from 'vitest';

import { queryKeys } from './query-keys';
import { parsePlacesUrlState } from './url-state';

describe('places URL state', () => {
  it('canonicalizes valid query values', () => {
    expect(parsePlacesUrlState({ budget: '20000', category: 'ngopi', sort: 'cheapest' })).toEqual({
      budgetAmount: 20_000,
      category: 'NGOPI',
      sort: 'CHEAPEST',
    });
  });

  it('uses conservative defaults for malformed values', () => {
    expect(
      parsePlacesUrlState({
        budget: ['-1', '20000'],
        category: 'unknown',
        sort: 'random',
      }),
    ).toEqual({
      budgetAmount: 15_000,
      category: 'MAKAN_MURAH',
      sort: 'NEAREST',
    });
  });

  it('does not invent a budget for categories that do not support it', () => {
    expect(parsePlacesUrlState({ category: 'toilet' }).budgetAmount).toBeNull();
  });
});

describe('query keys', () => {
  it('normalizes coordinates while preserving query dimensions', () => {
    const first = queryKeys.recommendations({
      budgetAmount: 15_000,
      category: 'MAKAN_MURAH',
      latitude: -6.146_801,
      limit: 1,
      longitude: 106.806_101,
      radiusMeters: 5_000,
    });
    const second = queryKeys.recommendations({
      budgetAmount: 15_000,
      category: 'MAKAN_MURAH',
      latitude: -6.146_799,
      limit: 1,
      longitude: 106.806_099,
      radiusMeters: 5_000,
    });
    expect(first).toEqual(second);
  });
});
