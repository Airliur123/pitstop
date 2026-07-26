import type { ManualLocationErrorReason, ManualLocationResult } from './manual-location-resolver';
import { formatManualLocationLabel } from './manual-location-resolver';

export const NORMAL_RADIUS_METERS = 5_000;
export const DEFAULT_LOCATION_TIMEOUT_MS = 10_000;
export const DEFAULT_CURRENT_LOCATION_LABEL = 'Lokasi saat ini';

export type LocationSource = 'CURRENT' | 'MANUAL';

export type ActiveLocationQueryKey =
  | readonly ['location', 'CURRENT', number, number]
  | readonly ['location', 'MANUAL', string, number, number];

interface LocationAttemptState {
  readonly attemptId: number;
  readonly requestedAt: number;
}

export interface PermissionNotRequestedState {
  readonly status: 'PERMISSION_NOT_REQUESTED';
}

export interface LocationRequestingState extends LocationAttemptState {
  readonly status: 'LOCATION_REQUESTING';
}

export interface PermissionGrantedState extends LocationAttemptState {
  readonly status: 'PERMISSION_GRANTED';
}

export interface PermissionDeniedState {
  readonly attemptId: number;
  readonly occurredAt: number;
  readonly status: 'PERMISSION_DENIED';
}

export interface LocationUnavailableState {
  readonly attemptId: number;
  readonly occurredAt: number;
  readonly status: 'LOCATION_UNAVAILABLE';
}

export interface LocationTimeoutState {
  readonly attemptId: number;
  readonly occurredAt: number;
  readonly status: 'LOCATION_TIMEOUT';
}

export interface LocationRetryingState extends LocationAttemptState {
  readonly status: 'LOCATION_RETRYING';
}

export interface ManualLocationState {
  readonly status: 'MANUAL_LOCATION';
}

export interface ManualLocationInvalidState {
  readonly query?: string;
  readonly reason: ManualLocationErrorReason;
  readonly status: 'MANUAL_LOCATION_INVALID';
}

interface ActiveLocationBase {
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly source: LocationSource;
  readonly timestamp: number;
}

export interface CurrentLocationActiveState extends ActiveLocationBase {
  readonly accuracy?: number;
  readonly id: 'current-location';
  readonly queryKey: readonly ['location', 'CURRENT', number, number];
  readonly source: 'CURRENT';
  readonly status: 'CURRENT_LOCATION_ACTIVE';
}

export interface ManualLocationActiveState extends ActiveLocationBase {
  readonly queryKey: readonly ['location', 'MANUAL', string, number, number];
  readonly secondaryLabel?: string;
  readonly source: 'MANUAL';
  readonly status: 'MANUAL_LOCATION_ACTIVE';
}

export type ActiveLocation = CurrentLocationActiveState | ManualLocationActiveState;

export type LocationState =
  | PermissionNotRequestedState
  | LocationRequestingState
  | PermissionGrantedState
  | PermissionDeniedState
  | LocationUnavailableState
  | LocationTimeoutState
  | LocationRetryingState
  | ManualLocationState
  | ManualLocationInvalidState
  | CurrentLocationActiveState
  | ManualLocationActiveState;

export type CurrentLocationFailureStatus =
  'LOCATION_TIMEOUT' | 'LOCATION_UNAVAILABLE' | 'PERMISSION_DENIED';

export type LocationAction =
  | {
      readonly attemptId: number;
      readonly requestedAt: number;
      readonly retry: boolean;
      readonly type: 'REQUEST_CURRENT_LOCATION';
    }
  | {
      readonly attemptId: number;
      readonly type: 'PERMISSION_GRANTED';
    }
  | {
      readonly accuracy?: number;
      readonly attemptId: number;
      readonly label?: string;
      readonly latitude: number;
      readonly longitude: number;
      readonly timestamp: number;
      readonly type: 'CURRENT_LOCATION_RESOLVED';
    }
  | {
      readonly attemptId: number;
      readonly occurredAt: number;
      readonly status: CurrentLocationFailureStatus;
      readonly type: 'CURRENT_LOCATION_FAILED';
    }
  | {
      readonly type: 'OPEN_MANUAL_LOCATION';
    }
  | {
      readonly result: ManualLocationResult;
      readonly timestamp: number;
      readonly type: 'ACTIVATE_MANUAL_LOCATION';
    }
  | {
      readonly query?: string;
      readonly reason: ManualLocationErrorReason;
      readonly type: 'SET_MANUAL_LOCATION_INVALID';
    }
  | {
      readonly type: 'RESET_LOCATION';
    };

export const initialLocationState: PermissionNotRequestedState = Object.freeze({
  status: 'PERMISSION_NOT_REQUESTED',
});

function coordinateForQueryKey(value: number) {
  return Number(value.toFixed(5));
}

export function isValidLocationCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function hasMatchingAttempt(
  state: LocationState,
  attemptId: number,
): state is LocationRequestingState | LocationRetryingState | PermissionGrantedState {
  return (
    (state.status === 'LOCATION_REQUESTING' ||
      state.status === 'LOCATION_RETRYING' ||
      state.status === 'PERMISSION_GRANTED') &&
    state.attemptId === attemptId
  );
}

function currentLocationState(
  action: Extract<LocationAction, { type: 'CURRENT_LOCATION_RESOLVED' }>,
) {
  if (!isValidLocationCoordinate(action.latitude, action.longitude)) return null;

  const latitude = coordinateForQueryKey(action.latitude);
  const longitude = coordinateForQueryKey(action.longitude);
  const accuracy =
    action.accuracy !== undefined && Number.isFinite(action.accuracy) && action.accuracy >= 0
      ? action.accuracy
      : undefined;
  const label = action.label?.trim() || DEFAULT_CURRENT_LOCATION_LABEL;

  return {
    ...(accuracy === undefined ? {} : { accuracy }),
    id: 'current-location',
    label,
    latitude: action.latitude,
    longitude: action.longitude,
    queryKey: ['location', 'CURRENT', latitude, longitude],
    source: 'CURRENT',
    status: 'CURRENT_LOCATION_ACTIVE',
    timestamp: action.timestamp,
  } satisfies CurrentLocationActiveState;
}

export function createManualLocationActiveState(
  result: ManualLocationResult,
  timestamp: number,
): ManualLocationActiveState | ManualLocationInvalidState {
  if (
    !isValidLocationCoordinate(result.latitude, result.longitude) ||
    result.id.trim() === '' ||
    result.label.trim() === ''
  ) {
    return {
      reason: 'UNUSABLE_RESULT',
      status: 'MANUAL_LOCATION_INVALID',
    };
  }

  const latitude = coordinateForQueryKey(result.latitude);
  const longitude = coordinateForQueryKey(result.longitude);
  const secondaryLabel = result.secondaryLabel?.trim();

  return {
    id: result.id,
    label: formatManualLocationLabel(result),
    latitude: result.latitude,
    longitude: result.longitude,
    queryKey: ['location', 'MANUAL', result.id, latitude, longitude],
    ...(secondaryLabel ? { secondaryLabel } : {}),
    source: 'MANUAL',
    status: 'MANUAL_LOCATION_ACTIVE',
    timestamp,
  };
}

export function locationReducer(state: LocationState, action: LocationAction): LocationState {
  switch (action.type) {
    case 'REQUEST_CURRENT_LOCATION':
      return {
        attemptId: action.attemptId,
        requestedAt: action.requestedAt,
        status: action.retry ? 'LOCATION_RETRYING' : 'LOCATION_REQUESTING',
      };
    case 'PERMISSION_GRANTED':
      if (!hasMatchingAttempt(state, action.attemptId)) return state;
      return {
        attemptId: state.attemptId,
        requestedAt: state.requestedAt,
        status: 'PERMISSION_GRANTED',
      };
    case 'CURRENT_LOCATION_RESOLVED': {
      if (!hasMatchingAttempt(state, action.attemptId)) return state;
      const activeState = currentLocationState(action);
      return (
        activeState ?? {
          attemptId: action.attemptId,
          occurredAt: action.timestamp,
          status: 'LOCATION_UNAVAILABLE',
        }
      );
    }
    case 'CURRENT_LOCATION_FAILED':
      if (!hasMatchingAttempt(state, action.attemptId)) return state;
      return {
        attemptId: action.attemptId,
        occurredAt: action.occurredAt,
        status: action.status,
      };
    case 'OPEN_MANUAL_LOCATION':
      return { status: 'MANUAL_LOCATION' };
    case 'ACTIVATE_MANUAL_LOCATION':
      return createManualLocationActiveState(action.result, action.timestamp);
    case 'SET_MANUAL_LOCATION_INVALID': {
      const query = action.query?.trim();
      return {
        ...(query ? { query } : {}),
        reason: action.reason,
        status: 'MANUAL_LOCATION_INVALID',
      };
    }
    case 'RESET_LOCATION':
      return initialLocationState;
  }
}

export function getActiveLocation(state: LocationState): ActiveLocation | null {
  return state.status === 'CURRENT_LOCATION_ACTIVE' || state.status === 'MANUAL_LOCATION_ACTIVE'
    ? state
    : null;
}

export function isActiveLocationState(state: LocationState): state is ActiveLocation {
  return getActiveLocation(state) !== null;
}

/**
 * Compatibility adapter for the Phase 4 guest screens. It is intentionally
 * impossible to activate in production and requires an explicit development or
 * test flag. Phase 5 consumers should use LocationProvider/useLocation.
 */
export type LocationContext =
  | { readonly status: 'UNAVAILABLE' }
  | {
      readonly latitude: number;
      readonly label: string;
      readonly longitude: number;
      readonly source: 'DEVELOPMENT_PREVIEW';
      readonly status: 'READY';
    };

export function getLocationContext(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): LocationContext {
  if (
    environment.NODE_ENV === 'production' ||
    environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED !== 'true'
  ) {
    return { status: 'UNAVAILABLE' };
  }
  const latitude = Number(environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE);
  const longitude = Number(environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE);
  const label = environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL?.trim();
  if (!isValidLocationCoordinate(latitude, longitude) || !label) {
    return { status: 'UNAVAILABLE' };
  }
  return {
    label,
    latitude,
    longitude,
    source: 'DEVELOPMENT_PREVIEW',
    status: 'READY',
  };
}

export function createInitialLocationState(
  timestamp = Date.now(),
  preview = getLocationContext(),
): LocationState {
  if (preview.status !== 'READY') return initialLocationState;
  return createManualLocationActiveState(
    {
      id: 'development-preview',
      label: preview.label,
      latitude: preview.latitude,
      longitude: preview.longitude,
    },
    timestamp,
  );
}
