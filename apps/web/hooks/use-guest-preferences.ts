'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  DEFAULT_GUEST_BUDGET,
  GUEST_PREFERENCES_STORAGE_KEY,
  type GuestBudgetPreset,
  isValidBudget,
  readGuestPreferences,
  type StorageLike,
  writeGuestPreferences,
} from '../lib/preferences';

const preferencesChangedEvent = 'pitstop:guest-preferences-changed';
const missingPreferencesSnapshot = 'missing';
const storedPreferencesSnapshotPrefix = 'stored:';
const unavailablePreferencesSnapshot = 'unavailable';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(preferencesChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(preferencesChangedEvent, onStoreChange);
  };
}

function getClientSnapshot() {
  try {
    const value = window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY);
    return value === null
      ? missingPreferencesSnapshot
      : `${storedPreferencesSnapshotPrefix}${value}`;
  } catch {
    return unavailablePreferencesSnapshot;
  }
}

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getServerSnapshot() {
  return null;
}

export function useGuestPreferences() {
  const rawPreferences = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [volatileBudgetAmount, setVolatileBudgetAmount] = useState<
    GuestBudgetPreset | null | undefined
  >();
  const storage = getStorage();
  const hasStoredPreferences = rawPreferences?.startsWith(storedPreferencesSnapshotPrefix) ?? false;
  const storedBudgetAmount =
    !hasStoredPreferences || storage === null ? null : readGuestPreferences(storage).budgetAmount;
  const persistedBudgetAmount =
    rawPreferences === null
      ? null
      : hasStoredPreferences
        ? storedBudgetAmount
        : DEFAULT_GUEST_BUDGET;
  const budgetAmount =
    volatileBudgetAmount === undefined ? persistedBudgetAmount : volatileBudgetAmount;
  const hydrated = rawPreferences !== null;

  const setBudgetAmount = useCallback((value: number | null) => {
    if (value !== null && !isValidBudget(value)) return;
    const nextStorage = getStorage();
    if (nextStorage !== null && writeGuestPreferences(nextStorage, value)) {
      setVolatileBudgetAmount(undefined);
      window.dispatchEvent(new Event(preferencesChangedEvent));
      return;
    }
    setVolatileBudgetAmount(value);
  }, []);

  return { budgetAmount, hydrated, setBudgetAmount };
}
