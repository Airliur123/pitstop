export type ManualLocationErrorReason =
  'INVALID_FORMAT' | 'NOT_FOUND' | 'TOO_BROAD' | 'UNUSABLE_RESULT';

export interface ManualLocationResult {
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly secondaryLabel?: string;
}

export interface ManualLocationResolver {
  getById(id: string, signal: AbortSignal): Promise<ManualLocationResult>;
  search(query: string, signal: AbortSignal): Promise<readonly ManualLocationResult[]>;
}

export interface ManualLocationSearchController {
  cancel(): void;
  search(query: string): Promise<readonly ManualLocationResult[]>;
}

const errorMessages: Readonly<Record<ManualLocationErrorReason, string>> = {
  INVALID_FORMAT: 'Format lokasi tidak valid.',
  NOT_FOUND: 'Lokasi tidak ditemukan.',
  TOO_BROAD: 'Lokasi terlalu umum.',
  UNUSABLE_RESULT: 'Hasil lokasi tidak dapat digunakan.',
};

export class ManualLocationResolutionError extends Error {
  readonly reason: ManualLocationErrorReason;

  constructor(reason: ManualLocationErrorReason) {
    super(errorMessages[reason]);
    this.name = 'ManualLocationResolutionError';
    this.reason = reason;
  }
}

/**
 * These are the four deterministic choices shown by the Phase 5 Manual Location
 * design. Coordinates deliberately use existing seed anchors so development and
 * CI never need an external geocoder.
 */
export const MANUAL_LOCATION_AREAS: readonly ManualLocationResult[] = Object.freeze([
  Object.freeze({
    id: 'tambora-jakarta-barat',
    label: 'Tambora',
    latitude: -6.1468,
    longitude: 106.8061,
    secondaryLabel: 'Jakarta Barat',
  }),
  Object.freeze({
    id: 'grogol-petamburan-jakarta-barat',
    label: 'Grogol Petamburan',
    latitude: -6.167,
    longitude: 106.7972,
    secondaryLabel: 'Jakarta Barat',
  }),
  Object.freeze({
    id: 'kalideres-jakarta-barat',
    label: 'Kalideres',
    latitude: -6.138,
    longitude: 106.703,
    secondaryLabel: 'Jakarta Barat',
  }),
  Object.freeze({
    id: 'cengkareng-jakarta-barat',
    label: 'Cengkareng',
    latitude: -6.143,
    longitude: 106.734,
    secondaryLabel: 'Jakarta Barat',
  }),
]);

const overlyBroadQueries = new Set(['dki', 'dki jakarta', 'indonesia', 'jakarta', 'jakarta barat']);

function abortError() {
  return new DOMException('Manual location request was aborted.', 'AbortError');
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID');
}

function isUsableResult(result: ManualLocationResult) {
  return (
    result.id.trim().length > 0 &&
    result.label.trim().length > 0 &&
    Number.isFinite(result.latitude) &&
    result.latitude >= -90 &&
    result.latitude <= 90 &&
    Number.isFinite(result.longitude) &&
    result.longitude >= -180 &&
    result.longitude <= 180
  );
}

function validateSearchQuery(query: string) {
  const normalizedQuery = normalize(query);
  if (
    normalizedQuery.length < 3 ||
    !/[\p{L}]/u.test(normalizedQuery) ||
    /[<>{}[\]\\]/u.test(normalizedQuery)
  ) {
    throw new ManualLocationResolutionError('INVALID_FORMAT');
  }
  if (overlyBroadQueries.has(normalizedQuery)) {
    throw new ManualLocationResolutionError('TOO_BROAD');
  }
  return normalizedQuery;
}

export function formatManualLocationLabel(result: ManualLocationResult) {
  const label = result.label.trim();
  const secondaryLabel = result.secondaryLabel?.trim();
  return secondaryLabel ? `${label}, ${secondaryLabel}` : label;
}

export function createManualLocationResolver(
  areas: readonly ManualLocationResult[] = MANUAL_LOCATION_AREAS,
): ManualLocationResolver {
  return {
    getById(id, signal) {
      return Promise.resolve().then(() => {
        assertNotAborted(signal);
        const result = areas.find((area) => area.id === id);
        if (!result) throw new ManualLocationResolutionError('NOT_FOUND');
        if (!isUsableResult(result)) {
          throw new ManualLocationResolutionError('UNUSABLE_RESULT');
        }
        return result;
      });
    },
    search(query, signal) {
      return Promise.resolve().then(() => {
        assertNotAborted(signal);
        const normalizedQuery = validateSearchQuery(query);
        const results = areas.filter((area) => {
          const haystack = normalize(
            `${area.label} ${area.secondaryLabel ?? ''} ${area.id.replaceAll('-', ' ')}`,
          );
          return haystack.includes(normalizedQuery);
        });
        if (results.length === 0) {
          throw new ManualLocationResolutionError('NOT_FOUND');
        }
        if (results.some((result) => !isUsableResult(result))) {
          throw new ManualLocationResolutionError('UNUSABLE_RESULT');
        }
        return results;
      });
    },
  };
}

export const manualLocationResolver = createManualLocationResolver();

/**
 * Owns one in-flight manual search. Starting a new search aborts the previous
 * request, and a resolver that ignores AbortSignal still cannot publish its
 * stale result.
 */
export function createManualLocationSearchController(
  resolver: ManualLocationResolver = manualLocationResolver,
): ManualLocationSearchController {
  let activeController: AbortController | null = null;
  let sequence = 0;

  return {
    cancel() {
      sequence += 1;
      activeController?.abort();
      activeController = null;
    },
    async search(query) {
      const requestSequence = sequence + 1;
      sequence = requestSequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const results = await resolver.search(query, controller.signal);
        if (requestSequence !== sequence || controller.signal.aborted) {
          throw abortError();
        }
        return results;
      } finally {
        if (requestSequence === sequence) activeController = null;
      }
    },
  };
}
