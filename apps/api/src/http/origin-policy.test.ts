import { describe, expect, it } from 'vitest';

import { isAllowedRequestOrigin } from './origin-policy';

const allowed = new Set(['https://app.pitstop.example', 'https://admin.pitstop.example']);

describe('isAllowedRequestOrigin', () => {
  it('allows server-to-server requests without Origin and exact configured origins', () => {
    expect(isAllowedRequestOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedRequestOrigin('https://app.pitstop.example', allowed)).toBe(true);
  });

  it('rejects arbitrary, credentialed, and path-confused origins', () => {
    expect(isAllowedRequestOrigin('https://evil.example', allowed)).toBe(false);
    expect(isAllowedRequestOrigin('https://app.pitstop.example.evil.example', allowed)).toBe(false);
    expect(isAllowedRequestOrigin('https://user@app.pitstop.example', allowed)).toBe(false);
    expect(isAllowedRequestOrigin('https://app.pitstop.example/path', allowed)).toBe(false);
    expect(isAllowedRequestOrigin('not a URL', allowed)).toBe(false);
  });
});
