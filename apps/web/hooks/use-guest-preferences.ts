'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  GUEST_PREFERENCES_STORAGE_KEY,
  readGuestPreferences,
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

function getServerSnapshot() {
  return null;
}

export function useGuestPreferences() {
  const rawPreferences = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const stored =
    rawPreferences === null ? { budgetAmount: null } : readGuestPreferences(window.localStorage);
  const budgetAmount = stored.budgetAmount ?? 15_000;
  const hydrated = rawPreferences !== null;

  const setBudgetAmount = useCallback((value: number | null) => {
    if (writeGuestPreferences(window.localStorage, value)) {
      window.dispatchEvent(new Event(preferencesChangedEvent));
    }
  }, []);

  return { budgetAmount, hydrated, setBudgetAmount };
}
