import {
  type PublicCategoryCode,
  publicCategoryCodes,
  type PublicPlaceSort,
  publicPlaceSorts,
} from '@pitstop/contracts';

export interface PlacesUrlState {
  readonly budgetAmount: number | null;
  readonly category: PublicCategoryCode;
  readonly sort: PublicPlaceSort;
}

function first(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePlacesUrlState(
  input: Readonly<Record<string, string | readonly string[] | undefined>>,
): PlacesUrlState {
  const rawCategory = first(input.category)?.toUpperCase();
  const rawSort = first(input.sort)?.toUpperCase();
  const rawBudget = first(input.budget);
  const category = publicCategoryCodes.includes(rawCategory as PublicCategoryCode)
    ? (rawCategory as PublicCategoryCode)
    : 'MAKAN_MURAH';
  const sort = publicPlaceSorts.includes(rawSort as PublicPlaceSort)
    ? (rawSort as PublicPlaceSort)
    : 'NEAREST';
  const budget = rawBudget && /^\d+$/.test(rawBudget) ? Number(rawBudget) : null;
  return {
    budgetAmount:
      budget !== null && Number.isSafeInteger(budget) && budget >= 0 && budget <= 10_000_000
        ? budget
        : category === 'MAKAN_MURAH' || category === 'NGOPI'
          ? 15_000
          : null,
    category,
    sort,
  };
}
