'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import {
  type ActiveLocation,
  createInitialLocationState,
  type CurrentLocationFailureStatus,
  DEFAULT_CURRENT_LOCATION_LABEL,
  DEFAULT_LOCATION_TIMEOUT_MS,
  getActiveLocation,
  locationReducer,
  type LocationState,
} from '../lib/location';
import type {
  ManualLocationErrorReason,
  ManualLocationResult,
} from '../lib/manual-location-resolver';

export interface GeolocationAdapter {
  getCurrentPosition(
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): void;
}

export interface LocationController {
  readonly activeLocation: ActiveLocation | null;
  activateManualLocation(result: ManualLocationResult): void;
  openManualLocation(): void;
  requestCurrentLocation(): void;
  resetLocation(): void;
  retryCurrentLocation(): void;
  setManualLocationInvalid(reason: ManualLocationErrorReason, query?: string): void;
  readonly state: LocationState;
}

export interface LocationProviderProps {
  readonly children: ReactNode;
  readonly currentLocationLabel?: string;
  readonly geolocation?: GeolocationAdapter | null;
  readonly initialState?: LocationState;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

const LocationContext = createContext<LocationController | null>(null);

function getBrowserGeolocation(): GeolocationAdapter | null {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return navigator.geolocation;
}

function failureStatus(error: GeolocationPositionError): CurrentLocationFailureStatus {
  if (error.code === 1) return 'PERMISSION_DENIED';
  if (error.code === 3) return 'LOCATION_TIMEOUT';
  return 'LOCATION_UNAVAILABLE';
}

function safeTimeout(timeoutMs: number) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, 60_000)
    : DEFAULT_LOCATION_TIMEOUT_MS;
}

async function cancelLocationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ['public', 'recommendations'] }),
    queryClient.cancelQueries({ queryKey: ['public', 'places', 'search'] }),
  ]);
}

export function LocationProvider({
  children,
  currentLocationLabel = DEFAULT_CURRENT_LOCATION_LABEL,
  geolocation: geolocationOverride,
  initialState: providedInitialState,
  now = Date.now,
  timeoutMs = DEFAULT_LOCATION_TIMEOUT_MS,
}: LocationProviderProps) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    locationReducer,
    providedInitialState,
    (provided) => provided ?? createInitialLocationState(now()),
  );
  const activeAttempt = useRef<number | null>(null);
  const attemptSequence = useRef(0);
  const timeoutHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAttemptTimer = useCallback(() => {
    if (timeoutHandle.current !== null) {
      clearTimeout(timeoutHandle.current);
      timeoutHandle.current = null;
    }
  }, []);

  const invalidateCurrentAttempt = useCallback(() => {
    activeAttempt.current = null;
    clearAttemptTimer();
  }, [clearAttemptTimer]);

  useEffect(() => invalidateCurrentAttempt, [invalidateCurrentAttempt]);

  const cancelQueries = useCallback(() => {
    void cancelLocationQueries(queryClient);
  }, [queryClient]);

  const completeFailure = useCallback(
    (attemptId: number, status: CurrentLocationFailureStatus) => {
      if (activeAttempt.current !== attemptId) return;
      activeAttempt.current = null;
      clearAttemptTimer();
      dispatch({
        attemptId,
        occurredAt: now(),
        status,
        type: 'CURRENT_LOCATION_FAILED',
      });
    },
    [clearAttemptTimer, now],
  );

  const startCurrentLocationRequest = useCallback(
    (retry: boolean) => {
      invalidateCurrentAttempt();
      cancelQueries();

      const attemptId = attemptSequence.current + 1;
      attemptSequence.current = attemptId;
      activeAttempt.current = attemptId;
      dispatch({
        attemptId,
        requestedAt: now(),
        retry,
        type: 'REQUEST_CURRENT_LOCATION',
      });

      const geolocation =
        geolocationOverride === undefined ? getBrowserGeolocation() : geolocationOverride;
      if (!geolocation) {
        completeFailure(attemptId, 'LOCATION_UNAVAILABLE');
        return;
      }

      timeoutHandle.current = setTimeout(() => {
        completeFailure(attemptId, 'LOCATION_TIMEOUT');
      }, safeTimeout(timeoutMs));

      try {
        geolocation.getCurrentPosition(
          (position) => {
            if (activeAttempt.current !== attemptId) return;
            activeAttempt.current = null;
            clearAttemptTimer();
            cancelQueries();
            dispatch({ attemptId, type: 'PERMISSION_GRANTED' });
            dispatch({
              accuracy: position.coords.accuracy,
              attemptId,
              label: currentLocationLabel,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: position.timestamp || now(),
              type: 'CURRENT_LOCATION_RESOLVED',
            });
          },
          (error) => {
            completeFailure(attemptId, failureStatus(error));
          },
          {
            enableHighAccuracy: false,
            maximumAge: 0,
            timeout: safeTimeout(timeoutMs),
          },
        );
      } catch (error) {
        completeFailure(
          attemptId,
          error instanceof DOMException && error.name === 'SecurityError'
            ? 'PERMISSION_DENIED'
            : 'LOCATION_UNAVAILABLE',
        );
      }
    },
    [
      cancelQueries,
      clearAttemptTimer,
      completeFailure,
      currentLocationLabel,
      geolocationOverride,
      invalidateCurrentAttempt,
      now,
      timeoutMs,
    ],
  );

  const requestCurrentLocation = useCallback(
    () => startCurrentLocationRequest(false),
    [startCurrentLocationRequest],
  );
  const retryCurrentLocation = useCallback(
    () => startCurrentLocationRequest(true),
    [startCurrentLocationRequest],
  );

  const openManualLocation = useCallback(() => {
    invalidateCurrentAttempt();
    cancelQueries();
    dispatch({ type: 'OPEN_MANUAL_LOCATION' });
  }, [cancelQueries, invalidateCurrentAttempt]);

  const activateManualLocation = useCallback(
    (result: ManualLocationResult) => {
      invalidateCurrentAttempt();
      cancelQueries();
      dispatch({ result, timestamp: now(), type: 'ACTIVATE_MANUAL_LOCATION' });
    },
    [cancelQueries, invalidateCurrentAttempt, now],
  );

  const setManualLocationInvalid = useCallback(
    (reason: ManualLocationErrorReason, query?: string) => {
      invalidateCurrentAttempt();
      cancelQueries();
      dispatch({
        ...(query === undefined ? {} : { query }),
        reason,
        type: 'SET_MANUAL_LOCATION_INVALID',
      });
    },
    [cancelQueries, invalidateCurrentAttempt],
  );

  const resetLocation = useCallback(() => {
    invalidateCurrentAttempt();
    cancelQueries();
    dispatch({ type: 'RESET_LOCATION' });
  }, [cancelQueries, invalidateCurrentAttempt]);

  const activeLocation = getActiveLocation(state);
  const controller = useMemo<LocationController>(
    () => ({
      activeLocation,
      activateManualLocation,
      openManualLocation,
      requestCurrentLocation,
      resetLocation,
      retryCurrentLocation,
      setManualLocationInvalid,
      state,
    }),
    [
      activeLocation,
      activateManualLocation,
      openManualLocation,
      requestCurrentLocation,
      resetLocation,
      retryCurrentLocation,
      setManualLocationInvalid,
      state,
    ],
  );

  return <LocationContext value={controller}>{children}</LocationContext>;
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocation must be used within LocationProvider.');
  return context;
}
