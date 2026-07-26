import { describe, expect, it } from 'vitest';

import { buildGoogleMapsDirectionsUrl, type VerifiedPlaceDestination } from './directions';

const destination: VerifiedPlaceDestination = {
  latitude: -6.123456,
  longitude: 106.812345,
  verificationStatus: 'ADMIN_VERIFIED',
};

describe('Google Maps directions', () => {
  it('builds an encoded HTTPS directions URL for the verified destination', () => {
    const href = buildGoogleMapsDirectionsUrl(destination);
    const url = new URL(href);

    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('www.google.com');
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('-6.123456,106.812345');
    expect(url.search).toContain('destination=-6.123456%2C106.812345');
  });

  it('never includes a user origin or unrelated input in the URL', () => {
    const input: VerifiedPlaceDestination & {
      readonly originLatitude: number;
      readonly originLongitude: number;
    } = {
      ...destination,
      originLatitude: -6.2,
      originLongitude: 106.9,
    };
    const href = buildGoogleMapsDirectionsUrl(input);
    const url = new URL(href);

    expect([...url.searchParams.keys()]).toEqual(['api', 'destination']);
    expect(url.searchParams.has('origin')).toBe(false);
  });

  it.each([
    ['NaN latitude', Number.NaN, 106.8],
    ['infinite latitude', Number.POSITIVE_INFINITY, 106.8],
    ['latitude below range', -90.000_001, 106.8],
    ['latitude above range', 90.000_001, 106.8],
    ['NaN longitude', -6.1, Number.NaN],
    ['infinite longitude', -6.1, Number.NEGATIVE_INFINITY],
    ['longitude below range', -6.1, -180.000_001],
    ['longitude above range', -6.1, 180.000_001],
  ])('rejects %s', (_label, latitude, longitude) => {
    expect(() =>
      buildGoogleMapsDirectionsUrl({
        latitude,
        longitude,
        verificationStatus: 'ADMIN_VERIFIED',
      }),
    ).toThrow(RangeError);
  });

  it('rejects a destination that is not admin verified at runtime', () => {
    expect(() =>
      buildGoogleMapsDirectionsUrl({
        ...destination,
        verificationStatus: 'PENDING',
      } as unknown as VerifiedPlaceDestination),
    ).toThrow(TypeError);
  });
});
