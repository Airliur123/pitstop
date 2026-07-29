import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { WORKER_ENVIRONMENT, type WorkerEnvironmentProvider } from './configuration';
import type { GeocodingInput, GeocodingPort, GeocodingResult } from './geocoding.port';

@Injectable()
export class ConfiguredGeocodingAdapter implements GeocodingPort {
  private readonly adapter: GeocodingPort;

  constructor(@Inject(WORKER_ENVIRONMENT) environment: WorkerEnvironmentProvider) {
    this.adapter =
      environment.GEOCODING_PROVIDER === 'nominatim'
        ? new NominatimGeocodingAdapter(environment)
        : new DeterministicGeocodingAdapter();
  }

  geocode(input: GeocodingInput): Promise<GeocodingResult> {
    const coordinates = parseSafeGoogleMapsCoordinates(input.mapUrl);
    if (coordinates) {
      return Promise.resolve({
        confidence: 0.8,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        normalizedAddress: [input.address, input.area].filter(Boolean).join(', '),
        provider: 'GOOGLE_MAPS_URL',
        rawSummary: { parsedCoordinate: true },
        status: 'FOUND',
      });
    }
    return this.adapter.geocode(input);
  }
}

export class DeterministicGeocodingAdapter implements GeocodingPort {
  async geocode(input: GeocodingInput): Promise<GeocodingResult> {
    const query = [input.address, input.area, input.landmark].filter(Boolean).join(', ');
    const normalized = query.normalize('NFKC').toLocaleLowerCase('id-ID');
    if (normalized.includes('[not-found]')) {
      return {
        provider: 'DETERMINISTIC',
        rawSummary: { fixture: 'not-found' },
        status: 'NOT_FOUND',
      };
    }
    const hash = createHash('sha256').update(normalized).digest();
    const longitude = 106.7 + hash.readUInt16BE(0) / 65_535 / 5;
    const latitude = -6.25 + hash.readUInt16BE(2) / 65_535 / 5;
    return {
      confidence: normalized.includes('[low-confidence]') ? 0.35 : 0.92,
      latitude: Number(latitude.toFixed(7)),
      longitude: Number(longitude.toFixed(7)),
      normalizedAddress: query,
      provider: 'DETERMINISTIC',
      rawSummary: { fixture: 'deterministic-v1' },
      status: 'FOUND',
    };
  }
}

class NominatimGeocodingAdapter implements GeocodingPort {
  constructor(private readonly environment: WorkerEnvironmentProvider) {}

  async geocode(input: GeocodingInput): Promise<GeocodingResult> {
    const url = new URL('/search', this.environment.GEOCODING_BASE_URL);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      q: [input.address, input.area, input.landmark].filter(Boolean).join(', '),
    }).toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': this.environment.GEOCODING_USER_AGENT },
      signal: AbortSignal.timeout(this.environment.GEOCODING_HTTP_TIMEOUT_MS),
    });
    if (response.status === 429 || response.status >= 500) {
      throw new GeocodingProviderError('PROVIDER_RETRYABLE', true);
    }
    if (!response.ok) throw new GeocodingProviderError('PROVIDER_RESPONSE_INVALID', false);
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      return { provider: 'NOMINATIM', rawSummary: { resultCount: 0 }, status: 'NOT_FOUND' };
    }
    const candidate = payload[0];
    if (typeof candidate !== 'object' || candidate === null) {
      throw new GeocodingProviderError('PROVIDER_RESPONSE_INVALID', false);
    }
    const latitude = Number(Reflect.get(candidate, 'lat'));
    const longitude = Number(Reflect.get(candidate, 'lon'));
    const displayName = Reflect.get(candidate, 'display_name');
    const importance = Number(Reflect.get(candidate, 'importance'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new GeocodingProviderError('PROVIDER_RESPONSE_INVALID', false);
    }
    return {
      confidence: Number.isFinite(importance) ? Math.max(0, Math.min(1, importance)) : 0.5,
      latitude,
      longitude,
      normalizedAddress:
        typeof displayName === 'string' ? displayName.slice(0, 500) : input.address,
      provider: 'NOMINATIM',
      rawSummary: {
        category: safeProviderString(candidate, 'category'),
        resultCount: payload.length,
        type: safeProviderString(candidate, 'type'),
      },
      status: 'FOUND',
    };
  }
}

export class GeocodingProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'GeocodingProviderError';
  }
}

export function parseSafeGoogleMapsCoordinates(
  value: string | undefined,
): { readonly latitude: number; readonly longitude: number } | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['google.com', 'www.google.com', 'maps.google.com'].includes(url.hostname.toLowerCase())) {
    return null;
  }
  const match = url.pathname.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null;
}

function safeProviderString(value: object, key: string): string | null {
  const field = Reflect.get(value, key);
  return typeof field === 'string' ? field.slice(0, 80) : null;
}
