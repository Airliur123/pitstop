import type {
  ApiSuccess,
  AuthSession,
  CategoriesMeta,
  LogoutResult,
  MagicLinkRequestResult,
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
import type { MagicLinkRequestInput } from '@pitstop/validation';
import type { z } from 'zod';

import { NORMAL_RADIUS_METERS } from '../location';
import { type GuestBudgetPreset, isValidBudget } from '../preferences';
import {
  authSessionResponseSchema,
  categoriesResponseSchema,
  logoutResponseSchema,
  magicLinkRequestResponseSchema,
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

export class ApiClientValidationError extends TypeError {
  readonly code = 'INVALID_BUDGET';

  constructor(readonly category: PublicCategoryCode) {
    super(`Budget untuk ${category} harus menggunakan salah satu preset resmi.`);
    this.name = 'ApiClientValidationError';
  }
}

function budgetAmountForRequest(category: PublicCategoryCode, value: unknown) {
  if (category !== 'MAKAN_MURAH' && category !== 'NGOPI') return null;
  if (!isValidBudget(value)) throw new ApiClientValidationError(category);
  return value;
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
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

interface RequestOptions {
  readonly body?: unknown;
  readonly method?: 'GET' | 'POST';
  readonly signal?: AbortSignal | undefined;
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const cancellation = combinedSignal(options.signal);
  try {
    const hasBody = options.body !== undefined;
    const response = await fetch(
      `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}${path}`,
      {
        credentials: 'include',
        headers: {
          Accept: 'application/json, application/problem+json',
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        method: options.method ?? 'GET',
        signal: cancellation.signal,
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
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
    { signal },
  );
}

export interface RecommendationInput {
  readonly budgetAmount?: GuestBudgetPreset | null;
  readonly category: PublicCategoryCode;
  readonly latitude: number;
  readonly limit?: number;
  readonly longitude: number;
}

export function getRecommendations(input: RecommendationInput, signal?: AbortSignal) {
  const budgetAmount = budgetAmountForRequest(input.category, input.budgetAmount);
  return request<ApiSuccess<RecommendationResult, RecommendationMeta>>(
    `/public/recommendations${queryString({
      budgetAmount,
      category: input.category,
      latitude: input.latitude,
      limit: input.limit ?? 4,
      longitude: input.longitude,
      radiusMeters: NORMAL_RADIUS_METERS,
    })}`,
    recommendationsResponseSchema,
    { signal },
  );
}

export interface PlacesInput extends RecommendationInput {
  readonly cursor?: string;
  readonly sort?: PublicPlaceSort;
}

export function getPlaces(input: PlacesInput, signal?: AbortSignal) {
  const budgetAmount = budgetAmountForRequest(input.category, input.budgetAmount);
  return request<ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>>(
    `/public/places${queryString({
      budgetAmount,
      category: input.category,
      cursor: input.cursor,
      latitude: input.latitude,
      limit: input.limit ?? 20,
      longitude: input.longitude,
      radiusMeters: NORMAL_RADIUS_METERS,
      sort: input.sort ?? 'NEAREST',
    })}`,
    placesResponseSchema,
    { signal },
  );
}

export function getPlaceDetail(slug: string, signal?: AbortSignal) {
  return request<ApiSuccess<PublicPlaceDetail, PlaceDetailMeta>>(
    `/public/places/${encodeURIComponent(slug)}`,
    placeDetailResponseSchema,
    { signal },
  );
}

export function requestMagicLink(input: MagicLinkRequestInput, signal?: AbortSignal) {
  return request<ApiSuccess<MagicLinkRequestResult>>(
    '/auth/email/request',
    magicLinkRequestResponseSchema,
    { body: input, method: 'POST', signal },
  );
}

export function getAuthSession(signal?: AbortSignal) {
  return request<ApiSuccess<AuthSession>>('/auth/session', authSessionResponseSchema, { signal });
}

export function logout(signal?: AbortSignal) {
  return request<ApiSuccess<LogoutResult>>('/auth/logout', logoutResponseSchema, {
    body: {},
    method: 'POST',
    signal,
  });
}
