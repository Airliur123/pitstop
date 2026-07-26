import { describe, expect, it } from 'vitest';

import { queryKeys } from './query-keys';
import { parsePlacesUrlState, placesUrl } from './url-state';

describe('places URL state', () => {
  it('canonicalizes valid query values', () => {
    expect(parsePlacesUrlState({ budget: '20000', category: 'ngopi', sort: 'cheapest' })).toEqual({
      budgetAmount: 20_000,
      category: 'NGOPI',
      sort: 'CHEAPEST',
      view: 'LIST',
    });
  });

  it('rejects explicitly malformed values instead of silently changing the budget', () => {
    expect(
      parsePlacesUrlState({
        budget: ['-1', '20000'],
        category: 'unknown',
        sort: 'random',
      }),
    ).toEqual({
      budgetAmount: null,
      category: 'MAKAN_MURAH',
      sort: 'NEAREST',
      view: 'LIST',
    });
  });

  it('uses the conservative preset only when the budget parameter is absent', () => {
    expect(parsePlacesUrlState({ category: 'makan_murah' }).budgetAmount).toBe(15_000);
    expect(
      parsePlacesUrlState({ budget: '12000', category: 'makan_murah' }).budgetAmount,
    ).toBeNull();
  });

  it('does not invent a budget for categories that do not support it', () => {
    expect(parsePlacesUrlState({ budget: '20000', category: 'toilet' }).budgetAmount).toBeNull();
  });

  it('keeps list/map state public without accepting arbitrary values', () => {
    expect(parsePlacesUrlState({ view: 'map' }).view).toBe('MAP');
    expect(parsePlacesUrlState({ view: 'unexpected' }).view).toBe('LIST');
  });

  it('builds a shareable map URL without location coordinates', () => {
    const url = placesUrl({
      budgetAmount: 15_000,
      category: 'MAKAN_MURAH',
      sort: 'NEAREST',
      view: 'MAP',
    });

    expect(url).toContain('category=MAKAN_MURAH');
    expect(url).toContain('budget=15000');
    expect(url).toContain('view=map');
    expect(url).not.toMatch(/latitude|longitude|-6\.1|106\.8/);
  });
});

describe('query keys', () => {
  it('uses the stable location identity without a raw address', () => {
    const locationKey = ['location', 'CURRENT', -6.1468, 106.8061] as const;
    const input = {
      budgetAmount: 15_000,
      category: 'MAKAN_MURAH',
      limit: 1,
    } as const;
    const first = queryKeys.recommendations(locationKey, input);
    const second = queryKeys.recommendations(locationKey, input);

    expect(first).toEqual(second);
    expect(first).toContain(5_000);
    expect(JSON.stringify(first)).not.toContain('Jl.');
  });

  it('keeps current and manual location caches separate', () => {
    const input = {
      budgetAmount: null,
      category: 'TOILET',
      limit: 4,
    } as const;

    expect(
      queryKeys.recommendations(['location', 'CURRENT', -6.1468, 106.8061], input),
    ).not.toEqual(
      queryKeys.recommendations(
        ['location', 'MANUAL', 'tambora-jakarta-barat', -6.1468, 106.8061],
        input,
      ),
    );
  });
});
