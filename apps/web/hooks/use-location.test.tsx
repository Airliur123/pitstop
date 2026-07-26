import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialLocationState } from '../lib/location';
import { MANUAL_LOCATION_AREAS } from '../lib/manual-location-resolver';
import {
  type GeolocationAdapter,
  LocationProvider,
  type LocationProviderProps,
  useLocation,
} from './use-location';

const tamboraArea = MANUAL_LOCATION_AREAS[0];
const kalideresArea = MANUAL_LOCATION_AREAS[2];
if (!tamboraArea || !kalideresArea) {
  throw new Error('Manual location test fixtures are incomplete.');
}

interface PendingGeolocationRequest {
  readonly error: PositionErrorCallback | null | undefined;
  readonly options: PositionOptions | undefined;
  readonly success: PositionCallback;
}

class ControlledGeolocation implements GeolocationAdapter {
  readonly requests: PendingGeolocationRequest[] = [];

  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) {
    this.requests.push({ error, options, success });
  }

  fail(index: number, code: 1 | 2 | 3) {
    this.requests[index]?.error?.({
      code,
      message: 'Geolocation test failure.',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  }

  succeed(
    index: number,
    {
      accuracy = 12,
      latitude = -6.1468,
      longitude = 106.8061,
      timestamp = 500,
    }: Readonly<{
      accuracy?: number;
      latitude?: number;
      longitude?: number;
      timestamp?: number;
    }> = {},
  ) {
    this.requests[index]?.success({
      coords: {
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude,
        longitude,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp,
      toJSON: () => ({}),
    });
  }
}

type ProviderOptions = Omit<LocationProviderProps, 'children'>;

function renderLocation(options: ProviderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const providerOptions: ProviderOptions = {
    initialState: initialLocationState,
    ...options,
  };
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>
        <LocationProvider {...providerOptions}>{children}</LocationProvider>
      </QueryClientProvider>
    );
  }
  return {
    queryClient,
    ...renderHook(() => useLocation(), { wrapper: Wrapper }),
  };
}

describe('LocationProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not request browser permission before an explicit user action', () => {
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({ geolocation });

    expect(result.current.state.status).toBe('PERMISSION_NOT_REQUESTED');
    expect(result.current.activeLocation).toBeNull();
    expect(geolocation.requests).toHaveLength(0);
  });

  it('activates current location after permission succeeds', () => {
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({
      currentLocationLabel: 'Lokasi saya',
      geolocation,
    });

    act(() => result.current.requestCurrentLocation());
    expect(result.current.state.status).toBe('LOCATION_REQUESTING');
    expect(geolocation.requests[0]?.options).toMatchObject({
      maximumAge: 0,
      timeout: 10_000,
    });

    act(() => geolocation.succeed(0));

    expect(result.current.state.status).toBe('CURRENT_LOCATION_ACTIVE');
    expect(result.current.activeLocation).toMatchObject({
      accuracy: 12,
      label: 'Lokasi saya',
      latitude: -6.1468,
      longitude: 106.8061,
      queryKey: ['location', 'CURRENT', -6.1468, 106.8061],
      source: 'CURRENT',
    });
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it('never writes precise coordinates to console output', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({ geolocation });

    act(() => result.current.requestCurrentLocation());
    act(() =>
      geolocation.succeed(0, {
        latitude: -6.1468,
        longitude: 106.8061,
      }),
    );

    const consoleOutput = [log, info, warn, error]
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .join(' ');
    expect(consoleOutput).not.toContain('-6.1468');
    expect(consoleOutput).not.toContain('106.8061');
    log.mockRestore();
    info.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it.each([
    [1, 'PERMISSION_DENIED'],
    [2, 'LOCATION_UNAVAILABLE'],
    [3, 'LOCATION_TIMEOUT'],
  ] as const)('maps browser error code %s to %s', (code, expectedStatus) => {
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({ geolocation });

    act(() => result.current.requestCurrentLocation());
    act(() => geolocation.fail(0, code));

    expect(result.current.state.status).toBe(expectedStatus);
    expect(result.current.activeLocation).toBeNull();
  });

  it('has its own bounded timeout when the browser never calls back', async () => {
    vi.useFakeTimers();
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({ geolocation, timeoutMs: 250 });

    act(() => result.current.requestCurrentLocation());
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(result.current.state.status).toBe('LOCATION_TIMEOUT');
    expect(result.current.activeLocation).toBeNull();
  });

  it('marks retrying and ignores a stale callback from the first attempt', () => {
    const geolocation = new ControlledGeolocation();
    const { result } = renderLocation({ geolocation });

    act(() => result.current.requestCurrentLocation());
    act(() => result.current.retryCurrentLocation());
    expect(result.current.state.status).toBe('LOCATION_RETRYING');
    expect(geolocation.requests).toHaveLength(2);

    act(() =>
      geolocation.succeed(1, {
        latitude: -6.138,
        longitude: 106.703,
        timestamp: 600,
      }),
    );
    expect(result.current.activeLocation).toMatchObject({
      latitude: -6.138,
      longitude: 106.703,
    });

    act(() =>
      geolocation.succeed(0, {
        latitude: -7,
        longitude: 107,
        timestamp: 700,
      }),
    );
    expect(result.current.activeLocation).toMatchObject({
      latitude: -6.138,
      longitude: 106.703,
      timestamp: 600,
    });
  });

  it('exposes manual select, active, invalid, and reset transitions', () => {
    const { result } = renderLocation({ geolocation: null });

    act(() => result.current.openManualLocation());
    expect(result.current.state.status).toBe('MANUAL_LOCATION');

    act(() => result.current.activateManualLocation(tamboraArea));
    expect(result.current.activeLocation).toMatchObject({
      id: 'tambora-jakarta-barat',
      label: 'Tambora, Jakarta Barat',
      source: 'MANUAL',
      status: 'MANUAL_LOCATION_ACTIVE',
    });

    act(() => result.current.setManualLocationInvalid('TOO_BROAD', 'Jakarta'));
    expect(result.current.state).toEqual({
      query: 'Jakarta',
      reason: 'TOO_BROAD',
      status: 'MANUAL_LOCATION_INVALID',
    });
    expect(result.current.activeLocation).toBeNull();

    act(() => result.current.resetLocation());
    expect(result.current.state.status).toBe('PERMISSION_NOT_REQUESTED');
  });

  it('cancels recommendation and place-search queries when location becomes inactive', async () => {
    const { queryClient, result } = renderLocation({
      initialState: {
        ...kalideresArea,
        id: 'kalideres-jakarta-barat',
        label: 'Kalideres, Jakarta Barat',
        queryKey: ['location', 'MANUAL', 'kalideres-jakarta-barat', -6.138, 106.703],
        source: 'MANUAL',
        status: 'MANUAL_LOCATION_ACTIVE',
        timestamp: 100,
      },
    });
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');

    act(() => result.current.openManualLocation());

    await waitFor(() => {
      expect(cancelQueries).toHaveBeenCalledWith({
        queryKey: ['public', 'recommendations'],
      });
      expect(cancelQueries).toHaveBeenCalledWith({
        queryKey: ['public', 'places', 'search'],
      });
    });
    expect(result.current.activeLocation).toBeNull();
  });

  it('reports unavailable when the browser geolocation API is absent', () => {
    const { result } = renderLocation({ geolocation: null });

    act(() => result.current.requestCurrentLocation());

    expect(result.current.state.status).toBe('LOCATION_UNAVAILABLE');
  });
});

describe('useLocation', () => {
  it('requires LocationProvider', () => {
    expect(() => renderHook(() => useLocation())).toThrow(
      'useLocation must be used within LocationProvider.',
    );
  });
});
