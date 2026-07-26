export const GUEST_PREFERENCES_STORAGE_KEY = 'pitstop.guest.preferences.v1';
const VERSION = 1 as const;
export const GUEST_BUDGET_PRESETS = [10_000, 15_000, 20_000, 25_000] as const;
export type GuestBudgetPreset = (typeof GUEST_BUDGET_PRESETS)[number];
export const DEFAULT_GUEST_BUDGET: GuestBudgetPreset = 15_000;

export interface GuestPreferences {
  readonly budgetAmount: GuestBudgetPreset | null;
  readonly version: typeof VERSION;
}

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function emptyGuestPreferences(): GuestPreferences {
  return { budgetAmount: null, version: VERSION };
}

function normalizeInvalidGuestPreferences(storage: StorageLike) {
  const normalized = emptyGuestPreferences();
  try {
    storage.setItem(GUEST_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    try {
      storage.removeItem(GUEST_PREFERENCES_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing or hardened environments.
    }
  }
  return normalized;
}

export function isValidBudget(value: unknown): value is GuestBudgetPreset {
  return typeof value === 'number' && GUEST_BUDGET_PRESETS.some((preset) => preset === value);
}

export function readGuestPreferences(storage: StorageLike): GuestPreferences {
  try {
    const raw = storage.getItem(GUEST_PREFERENCES_STORAGE_KEY);
    if (raw === null) return emptyGuestPreferences();
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== VERSION ||
      !('budgetAmount' in parsed) ||
      (parsed.budgetAmount !== null && !isValidBudget(parsed.budgetAmount))
    ) {
      return normalizeInvalidGuestPreferences(storage);
    }
    return { budgetAmount: parsed.budgetAmount, version: VERSION };
  } catch {
    return normalizeInvalidGuestPreferences(storage);
  }
}

export function writeGuestPreferences(storage: StorageLike, budgetAmount: number | null) {
  if (budgetAmount !== null && !isValidBudget(budgetAmount)) return false;
  try {
    storage.setItem(
      GUEST_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ budgetAmount, version: VERSION }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearGuestPreferences(storage: StorageLike) {
  try {
    storage.removeItem(GUEST_PREFERENCES_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
