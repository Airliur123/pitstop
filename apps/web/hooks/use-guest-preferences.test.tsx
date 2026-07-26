import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { GUEST_PREFERENCES_STORAGE_KEY } from '../lib/preferences';
import { useGuestPreferences } from './use-guest-preferences';

describe('useGuestPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hydrates with the conservative default and persists updates', async () => {
    const { result } = renderHook(() => useGuestPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.budgetAmount).toBe(15_000);

    act(() => result.current.setBudgetAmount(20_000));

    await waitFor(() => expect(result.current.budgetAmount).toBe(20_000));
    expect(window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY)).toBe(
      '{"budgetAmount":20000,"version":1}',
    );
  });

  it('restores the latest valid budget', async () => {
    window.localStorage.setItem(
      GUEST_PREFERENCES_STORAGE_KEY,
      '{"budgetAmount":25000,"version":1}',
    );
    const { result } = renderHook(() => useGuestPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.budgetAmount).toBe(25_000);
  });

  it('rejects an invalid stored budget without silently activating Rp15.000', async () => {
    window.localStorage.setItem(
      GUEST_PREFERENCES_STORAGE_KEY,
      '{"budgetAmount":12000,"version":1}',
    );
    const { result } = renderHook(() => useGuestPreferences());

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.budgetAmount).toBeNull();
    expect(window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY)).toBe(
      '{"budgetAmount":null,"version":1}',
    );
  });

  it('ignores an invalid update instead of applying it as volatile state', async () => {
    const { result } = renderHook(() => useGuestPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setBudgetAmount(12_000));

    expect(result.current.budgetAmount).toBe(15_000);
    expect(window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('remains usable when the localStorage getter is denied', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    });

    try {
      const { result } = renderHook(() => useGuestPreferences());
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      act(() => result.current.setBudgetAmount(20_000));
      expect(result.current.budgetAmount).toBe(20_000);
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
    }
  });
});
