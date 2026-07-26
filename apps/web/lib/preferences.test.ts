import { describe, expect, it, vi } from 'vitest';

import {
  clearGuestPreferences,
  GUEST_PREFERENCES_STORAGE_KEY,
  readGuestPreferences,
  type StorageLike,
  writeGuestPreferences,
} from './preferences';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    storage: {
      getItem: vi.fn(() => value),
      removeItem: vi.fn(() => {
        value = null;
      }),
      setItem: vi.fn((_key: string, next: string) => {
        value = next;
      }),
    } satisfies StorageLike,
    value: () => value,
  };
}

describe('guest preferences', () => {
  it('uses an empty preference on first load', () => {
    const store = memoryStorage();
    expect(readGuestPreferences(store.storage)).toEqual({ budgetAmount: null, version: 1 });
  });

  it('restores a valid versioned budget', () => {
    const store = memoryStorage(JSON.stringify({ budgetAmount: 20_000, version: 1 }));
    expect(readGuestPreferences(store.storage)).toEqual({ budgetAmount: 20_000, version: 1 });
  });

  it.each(['{broken', JSON.stringify({ budgetAmount: -1, version: 1 }), '{"version":2}'])(
    'clears corrupt, invalid, or unsupported data: %s',
    (raw) => {
      const store = memoryStorage(raw);
      expect(readGuestPreferences(store.storage)).toEqual({ budgetAmount: null, version: 1 });
      expect(store.storage.removeItem).toHaveBeenCalledWith(GUEST_PREFERENCES_STORAGE_KEY);
    },
  );

  it('writes and clears only the namespaced value', () => {
    const store = memoryStorage();
    expect(writeGuestPreferences(store.storage, 25_000)).toBe(true);
    expect(store.value()).toBe('{"budgetAmount":25000,"version":1}');
    expect(clearGuestPreferences(store.storage)).toBe(true);
    expect(store.value()).toBeNull();
  });

  it('does not throw when storage is denied', () => {
    const denied: StorageLike = {
      getItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    };
    expect(readGuestPreferences(denied)).toEqual({ budgetAmount: null, version: 1 });
    expect(writeGuestPreferences(denied, 15_000)).toBe(false);
    expect(clearGuestPreferences(denied)).toBe(false);
  });
});
