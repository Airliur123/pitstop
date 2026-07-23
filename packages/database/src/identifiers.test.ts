import { describe, expect, it } from 'vitest';

import { createUlid, isUlid, parseUlid } from './identifiers';

describe('ULID identifiers', () => {
  it('creates valid, fixed-width, lexicographically sortable identifiers', () => {
    const timestamp = Date.now();
    const first = createUlid(timestamp);
    const second = createUlid(timestamp);

    expect(first).toHaveLength(26);
    expect(isUlid(first)).toBe(true);
    expect(second > first).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(() => parseUlid('not-a-ulid')).toThrow('Invalid ULID');
  });
});
