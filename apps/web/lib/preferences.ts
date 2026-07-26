export const GUEST_PREFERENCES_STORAGE_KEY = 'pitstop.guest.preferences.v1';
const VERSION = 1 as const;
export const MAX_BUDGET = 10_000_000;

export interface GuestPreferences {
  readonly budgetAmount: number | null;
  readonly version: typeof VERSION;
}

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function isValidBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_BUDGET;
}

export function readGuestPreferences(storage: StorageLike): GuestPreferences {
  try {
    const raw = storage.getItem(GUEST_PREFERENCES_STORAGE_KEY);
    if (!raw) return { budgetAmount: null, version: VERSION };
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== VERSION ||
      !('budgetAmount' in parsed) ||
      (parsed.budgetAmount !== null && !isValidBudget(parsed.budgetAmount))
    ) {
      storage.removeItem(GUEST_PREFERENCES_STORAGE_KEY);
      return { budgetAmount: null, version: VERSION };
    }
    return { budgetAmount: parsed.budgetAmount, version: VERSION };
  } catch {
    try {
      storage.removeItem(GUEST_PREFERENCES_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing or hardened environments.
    }
    return { budgetAmount: null, version: VERSION };
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
