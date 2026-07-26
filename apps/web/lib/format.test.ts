import { describe, expect, it } from 'vitest';

import { formatDistance, formatRupiah } from './format';

describe('guest display formatting', () => {
  it('formats rupiah without fractional digits', () => {
    expect(formatRupiah(15_000)).toBe('Rp15.000');
  });

  it('keeps short distances in meters and long distances in kilometers', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1_250)).toBe('1,3 km');
  });
});
