import { describe, expect, it } from 'vitest';

import {
  createInitialLocationState,
  createManualLocationActiveState,
  getActiveLocation,
  getLocationContext,
  initialLocationState,
  locationReducer,
  type LocationState,
  NORMAL_RADIUS_METERS,
} from './location';

const requested: LocationState = {
  attemptId: 1,
  requestedAt: 100,
  status: 'LOCATION_REQUESTING',
};

describe('location state machine', () => {
  it('starts without pretending permission or coordinates are available', () => {
    expect(initialLocationState).toEqual({ status: 'PERMISSION_NOT_REQUESTED' });
    expect(getActiveLocation(initialLocationState)).toBeNull();
    expect(NORMAL_RADIUS_METERS).toBe(5_000);
  });

  it('represents requesting, permission granted, and current location active states', () => {
    const permissionGranted = locationReducer(requested, {
      attemptId: 1,
      type: 'PERMISSION_GRANTED',
    });
    expect(permissionGranted).toEqual({
      attemptId: 1,
      requestedAt: 100,
      status: 'PERMISSION_GRANTED',
    });

    const active = locationReducer(permissionGranted, {
      accuracy: 18,
      attemptId: 1,
      label: 'Lokasi saat ini',
      latitude: -6.1468123,
      longitude: 106.8061456,
      timestamp: 200,
      type: 'CURRENT_LOCATION_RESOLVED',
    });

    expect(active).toEqual({
      accuracy: 18,
      id: 'current-location',
      label: 'Lokasi saat ini',
      latitude: -6.1468123,
      longitude: 106.8061456,
      queryKey: ['location', 'CURRENT', -6.14681, 106.80615],
      source: 'CURRENT',
      status: 'CURRENT_LOCATION_ACTIVE',
      timestamp: 200,
    });
    expect(getActiveLocation(active)).toBe(active);
  });

  it.each([
    ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
    ['LOCATION_UNAVAILABLE', 'LOCATION_UNAVAILABLE'],
    ['LOCATION_TIMEOUT', 'LOCATION_TIMEOUT'],
  ] as const)('maps a current-location failure to %s', (_name, status) => {
    expect(
      locationReducer(requested, {
        attemptId: 1,
        occurredAt: 300,
        status,
        type: 'CURRENT_LOCATION_FAILED',
      }),
    ).toEqual({ attemptId: 1, occurredAt: 300, status });
  });

  it('uses a distinct retrying state', () => {
    expect(
      locationReducer(
        { attemptId: 1, occurredAt: 100, status: 'LOCATION_TIMEOUT' },
        {
          attemptId: 2,
          requestedAt: 200,
          retry: true,
          type: 'REQUEST_CURRENT_LOCATION',
        },
      ),
    ).toEqual({ attemptId: 2, requestedAt: 200, status: 'LOCATION_RETRYING' });
  });

  it('ignores callbacks from an older attempt', () => {
    const retrying: LocationState = {
      attemptId: 2,
      requestedAt: 200,
      status: 'LOCATION_RETRYING',
    };
    expect(
      locationReducer(retrying, {
        attemptId: 1,
        latitude: -6.1,
        longitude: 106.8,
        timestamp: 300,
        type: 'CURRENT_LOCATION_RESOLVED',
      }),
    ).toBe(retrying);
    expect(
      locationReducer(retrying, {
        attemptId: 1,
        occurredAt: 300,
        status: 'PERMISSION_DENIED',
        type: 'CURRENT_LOCATION_FAILED',
      }),
    ).toBe(retrying);
  });

  it('never activates unusable browser coordinates', () => {
    expect(
      locationReducer(requested, {
        attemptId: 1,
        latitude: Number.NaN,
        longitude: 106.8,
        timestamp: 300,
        type: 'CURRENT_LOCATION_RESOLVED',
      }),
    ).toEqual({ attemptId: 1, occurredAt: 300, status: 'LOCATION_UNAVAILABLE' });
  });

  it('opens manual selection, activates a typed manual context, and resets', () => {
    const selecting = locationReducer(requested, { type: 'OPEN_MANUAL_LOCATION' });
    expect(selecting).toEqual({ status: 'MANUAL_LOCATION' });

    const active = locationReducer(selecting, {
      result: {
        id: 'tambora-jakarta-barat',
        label: 'Tambora',
        latitude: -6.1468,
        longitude: 106.8061,
        secondaryLabel: 'Jakarta Barat',
      },
      timestamp: 400,
      type: 'ACTIVATE_MANUAL_LOCATION',
    });
    expect(active).toEqual({
      id: 'tambora-jakarta-barat',
      label: 'Tambora, Jakarta Barat',
      latitude: -6.1468,
      longitude: 106.8061,
      queryKey: ['location', 'MANUAL', 'tambora-jakarta-barat', -6.1468, 106.8061],
      secondaryLabel: 'Jakarta Barat',
      source: 'MANUAL',
      status: 'MANUAL_LOCATION_ACTIVE',
      timestamp: 400,
    });
    expect(locationReducer(active, { type: 'RESET_LOCATION' })).toBe(initialLocationState);
  });

  it('keeps invalid manual input inactive and does not retain a prior location', () => {
    const active = createManualLocationActiveState(
      {
        id: 'kalideres-jakarta-barat',
        label: 'Kalideres',
        latitude: -6.138,
        longitude: 106.703,
      },
      400,
    );
    const invalid = locationReducer(active, {
      query: 'Jakarta',
      reason: 'TOO_BROAD',
      type: 'SET_MANUAL_LOCATION_INVALID',
    });
    expect(invalid).toEqual({
      query: 'Jakarta',
      reason: 'TOO_BROAD',
      status: 'MANUAL_LOCATION_INVALID',
    });
    expect(getActiveLocation(invalid)).toBeNull();
  });
});

describe('development location fixture', () => {
  const previewEnvironment = {
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED: 'true',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: 'Kalideres, Jakarta Barat',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE: '-6.138',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE: '106.703',
  };

  it('requires an explicit non-production flag', () => {
    expect(getLocationContext({ NODE_ENV: 'development' })).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(getLocationContext({ ...previewEnvironment, NODE_ENV: 'production' })).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(getLocationContext({ ...previewEnvironment, NODE_ENV: 'test' })).toEqual({
      label: 'Kalideres, Jakarta Barat',
      latitude: -6.138,
      longitude: 106.703,
      source: 'DEVELOPMENT_PREVIEW',
      status: 'READY',
    });
  });

  it('converts an explicit preview into a memory-only manual context', () => {
    expect(
      createInitialLocationState(500, {
        label: 'Kalideres, Jakarta Barat',
        latitude: -6.138,
        longitude: 106.703,
        source: 'DEVELOPMENT_PREVIEW',
        status: 'READY',
      }),
    ).toEqual({
      id: 'development-preview',
      label: 'Kalideres, Jakarta Barat',
      latitude: -6.138,
      longitude: 106.703,
      queryKey: ['location', 'MANUAL', 'development-preview', -6.138, 106.703],
      source: 'MANUAL',
      status: 'MANUAL_LOCATION_ACTIVE',
      timestamp: 500,
    });
  });
});
