import { describe, expect, it } from 'vitest';

import {
  DeterministicGeocodingAdapter,
  GeocodingProviderError,
  parseSafeGoogleMapsCoordinates,
} from './geocoding.adapters';
import { calculateDuplicateHint } from './integration-worker.repository';
import { classifyWorkerError, integrationJobPolicy, PermanentWorkerError } from './job-policy';
import { withTimeout } from './worker-lifecycle.service';

describe('Phase 9 worker policies', () => {
  it('uses five exponential attempts and classifies safe errors', () => {
    expect(integrationJobPolicy).toMatchObject({
      attempts: 5,
      backoff: { delay: 1000, type: 'exponential' },
    });
    expect(classifyWorkerError(new GeocodingProviderError('PROVIDER_BUSY', true))).toEqual({
      code: 'PROVIDER_BUSY',
      errorClass: 'RETRYABLE_PROVIDER',
      retryable: true,
    });
    expect(classifyWorkerError(new PermanentWorkerError('INVALID_PAYLOAD')).retryable).toBe(false);
    expect(classifyWorkerError({ code: 'ER_LOCK_DEADLOCK' }).errorClass).toBe('RETRYABLE_DATABASE');
  });

  it('calculates deterministic moderator-only duplicate hints', () => {
    expect(
      calculateDuplicateHint({
        addressMatches: true,
        candidatePlaceId: '01K12345678901234567890123',
        distanceMeters: 25,
        nameMatches: true,
        radiusMeters: 250,
      }),
    ).toEqual({
      candidatePlaceId: '01K12345678901234567890123',
      distanceMeters: 25,
      matchedSignals: ['NORMALIZED_NAME', 'NORMALIZED_ADDRESS', 'SPATIAL_PROXIMITY', 'CATEGORY'],
      score: 0.98,
    });
  });

  it('provides deterministic offline geocoding and explicit low/not-found fixtures', async () => {
    const adapter = new DeterministicGeocodingAdapter();
    const first = await adapter.geocode({ address: 'Jl. A', area: 'Tambora' });
    const second = await adapter.geocode({ address: 'Jl. A', area: 'Tambora' });
    expect(first).toEqual(second);
    const low = await adapter.geocode({
      address: 'Jl. A [low-confidence]',
      area: 'Tambora',
    });
    expect(low.status === 'FOUND' ? low.confidence : 1).toBe(0.35);
    expect(await adapter.geocode({ address: '[not-found]', area: 'Tambora' })).toMatchObject({
      status: 'NOT_FOUND',
    });
  });

  it('parses allowlisted Maps coordinates without fetching and rejects short-link hosts', () => {
    expect(
      parseSafeGoogleMapsCoordinates('https://www.google.com/maps/place/X/@-6.2,106.8,17z'),
    ).toEqual({ latitude: -6.2, longitude: 106.8 });
    expect(parseSafeGoogleMapsCoordinates('https://maps.app.goo.gl/example')).toBeNull();
    expect(parseSafeGoogleMapsCoordinates('https://evil.example/@-6.2,106.8,17z')).toBeNull();
  });

  it('enforces a bounded job timeout', async () => {
    await expect(withTimeout(new Promise(() => undefined), 5)).rejects.toThrow('JOB_TIMEOUT');
  });
});
