import {
  type PublicCategoryCode,
  publicCategoryCodes,
  type PublicPlaceSort,
  publicPlaceSorts,
} from '@pitstop/contracts';

import { DEFAULT_GUEST_BUDGET, type GuestBudgetPreset, isValidBudget } from './preferences';

export interface PlacesUrlState {
  readonly budgetAmount: GuestBudgetPreset | null;
  readonly category: PublicCategoryCode;
  readonly sort: PublicPlaceSort;
  readonly view: 'LIST' | 'MAP';
}

function first(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePlacesUrlState(
  input: Readonly<Record<string, string | readonly string[] | undefined>>,
): PlacesUrlState {
  const rawCategory = first(input.category)?.toUpperCase();
  const rawSort = first(input.sort)?.toUpperCase();
  const rawView = first(input.view)?.toUpperCase();
  const rawBudget = first(input.budget);
  const category = publicCategoryCodes.includes(rawCategory as PublicCategoryCode)
    ? (rawCategory as PublicCategoryCode)
    : 'MAKAN_MURAH';
  const sort = publicPlaceSorts.includes(rawSort as PublicPlaceSort)
    ? (rawSort as PublicPlaceSort)
    : 'NEAREST';
  const budget = rawBudget && /^\d+$/.test(rawBudget) ? Number(rawBudget) : null;
  const supportsBudget = category === 'MAKAN_MURAH' || category === 'NGOPI';
  return {
    budgetAmount: supportsBudget
      ? rawBudget === undefined
        ? DEFAULT_GUEST_BUDGET
        : isValidBudget(budget)
          ? budget
          : null
      : null,
    category,
    sort,
    view: rawView === 'MAP' ? 'MAP' : 'LIST',
  };
}

export function placesUrl(state: PlacesUrlState) {
  const query = new URLSearchParams({
    category: state.category,
    sort: state.sort,
  });
  if (state.budgetAmount !== null) query.set('budget', String(state.budgetAmount));
  if (state.view === 'MAP') query.set('view', 'map');
  return `/places?${query.toString()}`;
}
