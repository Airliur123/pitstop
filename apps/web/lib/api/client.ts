import type {
  ApiSuccess,
  CategoriesMeta,
  PlaceDetailMeta,
  PublicCategory,
  PublicCategoryCode,
  PublicPlaceDetail,
  PublicPlaceListItem,
  PublicPlacesMeta,
  PublicPlaceSort,
  RecommendationMeta,
  RecommendationResult,
} from '@pitstop/contracts';
import type { z } from 'zod';

import {
  categoriesResponseSchema,
  placeDetailResponseSchema,
  placesResponseSchema,
  problemDetailsSchema,
  recommendationsResponseSchema,
} from './schemas';

const REQUEST_TIMEOUT_MS = 8_000;

export class ApiProblem extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiProblem';
  }
}

export function normalizeApiBaseUrl(value: string | undefined) {
  if (!value) throw new Error('NEXT_PUBLIC_API_BASE_URL is required');
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function combinedSignal(signal: AbortSignal | undefined) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  );
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  return {
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    },
    signal: controller.signal,
  };
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const cancellation = combinedSignal(signal);
  try {
    const response = await fetch(
      `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}${path}`,
      {
        headers: { Accept: 'application/json, application/problem+json' },
        signal: cancellation.signal,
      },
    );
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (contentType !== 'application/json' && contentType !== 'application/problem+json') {
      throw new ApiProblem(
        'Server mengirim format respons yang tidak didukung.',
        response.status || 502,
        'INVALID_CONTENT_TYPE',
        response.headers.get('x-request-id'),
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiProblem(
        'Respons server tidak dapat dibaca.',
        response.status || 502,
        'INVALID_JSON',
        response.headers.get('x-request-id'),
      );
    }
    if (!response.ok) {
      const problem = problemDetailsSchema.safeParse(payload);
      if (!problem.success) {
        throw new ApiProblem(
          'Terjadi kendala saat menghubungi layanan.',
          response.status,
          'INVALID_PROBLEM_DETAILS',
          response.headers.get('x-request-id'),
        );
      }
      throw new ApiProblem(
        problem.data.detail,
        problem.data.status,
        problem.data.code,
        problem.data.requestId,
        retryAfterSeconds(response),
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiProblem(
        'Struktur respons layanan tidak sesuai kontrak.',
        502,
        'INVALID_RESPONSE',
        response.headers.get('x-request-id'),
      );
    }
    return parsed.data;
  } finally {
    cancellation.dispose();
  }
}

function queryString(values: Readonly<Record<string, number | string | null | undefined>>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) parameters.set(key, String(value));
  }
  return `?${parameters.toString()}`;
}

export function getCategories(signal?: AbortSignal) {
  return request<ApiSuccess<readonly PublicCategory[], CategoriesMeta>>(
    '/public/categories',
    categoriesResponseSchema,
    signal,
  );
}

export interface RecommendationInput {
  readonly budgetAmount: number | null;
  readonly category: PublicCategoryCode;
  readonly latitude: number;
  readonly limit?: number;
  readonly longitude: number;
  readonly radiusMeters?: number;
}

export function getRecommendations(input: RecommendationInput, signal?: AbortSignal) {
  return request<ApiSuccess<RecommendationResult, RecommendationMeta>>(
    `/public/recommendations${queryString({
      budgetAmount: input.budgetAmount,
      category: input.category,
      latitude: input.latitude,
      limit: input.limit ?? 4,
      longitude: input.longitude,
      radiusMeters: input.radiusMeters ?? 5_000,
    })}`,
    recommendationsResponseSchema,
    signal,
  );
}

export interface PlacesInput extends RecommendationInput {
  readonly cursor?: string;
  readonly sort?: PublicPlaceSort;
}

export function getPlaces(input: PlacesInput, signal?: AbortSignal) {
  return request<ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>>(
    `/public/places${queryString({
      budgetAmount: input.budgetAmount,
      category: input.category,
      cursor: input.cursor,
      latitude: input.latitude,
      limit: input.limit ?? 20,
      longitude: input.longitude,
      radiusMeters: input.radiusMeters ?? 5_000,
      sort: input.sort ?? 'NEAREST',
    })}`,
    placesResponseSchema,
    signal,
  );
}

export function getPlaceDetail(slug: string, signal?: AbortSignal) {
  return request<ApiSuccess<PublicPlaceDetail, PlaceDetailMeta>>(
    `/public/places/${encodeURIComponent(slug)}`,
    placeDetailResponseSchema,
    signal,
  );
}
