'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  GUEST_PREFERENCES_STORAGE_KEY,
  readGuestPreferences,
  type StorageLike,
  writeGuestPreferences,
} from '../lib/preferences';

const preferencesChangedEvent = 'pitstop:guest-preferences-changed';

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
    return window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY) ?? '';
  } catch {
    return '';
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
  const [volatileBudgetAmount, setVolatileBudgetAmount] = useState<number | undefined>();
  const storage = getStorage();
  const stored =
    rawPreferences === null || storage === null
      ? { budgetAmount: null }
      : readGuestPreferences(storage);
  const budgetAmount = volatileBudgetAmount ?? stored.budgetAmount ?? 15_000;
  const hydrated = rawPreferences !== null;

  const setBudgetAmount = useCallback((value: number | null) => {
    const nextStorage = getStorage();
    if (nextStorage !== null && writeGuestPreferences(nextStorage, value)) {
      setVolatileBudgetAmount(undefined);
      window.dispatchEvent(new Event(preferencesChangedEvent));
      return;
    }
    setVolatileBudgetAmount(value ?? undefined);
  }, []);

  return { budgetAmount, hydrated, setBudgetAmount };
}
