import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiClientValidationError,
  ApiProblem,
  getActivity,
  getCategories,
  getPlaces,
  getRecommendations,
  normalizeApiBaseUrl,
  type RecommendationInput,
} from './client';
import { activityItemSchema } from './schemas';

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

describe('public API client', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test/api/v1/';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes a configured API base URL', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/api/v1/?ignored=yes#hash')).toBe(
      'https://api.example.test/api/v1',
    );
  });

  it('validates a successful response at runtime', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            code: 'MAKAN_MURAH',
            description: null,
            id: 'category-1',
            isPrimary: true,
            name: 'Makan Murah',
            sortOrder: 1,
            supportsBudget: true,
          },
        ],
        meta: {
          cache: 'MISS',
          generatedAt: '2026-07-24T00:00:00.000Z',
          requestId: 'request-1',
        },
        requestId: 'request-1',
        success: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCategories()).resolves.toMatchObject({
      data: [{ code: 'MAKAN_MURAH' }],
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/categories',
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({
          Accept: 'application/json, application/problem+json',
          'X-Correlation-Id': expect.stringMatching(/^[A-Za-z0-9-]{36}$/),
          'X-Request-Id': expect.stringMatching(/^[A-Za-z0-9-]{36}$/),
        }),
      }),
    );
    const headers = Reflect.get(fetchMock.mock.calls[0]?.[1] ?? {}, 'headers') as Record<
      string,
      string
    >;
    expect(headers['X-Correlation-Id']).toBe(headers['X-Request-Id']);
  });

  it('requests authenticated Activity with credentials, no-store, and compatible filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          items: [],
          pagination: { hasMore: false, nextCursor: null },
        },
        meta: {
          generatedAt: '2026-08-01T00:00:00.000Z',
          requestId: 'activity-request',
        },
        requestId: 'activity-request',
        success: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getActivity({ limit: 1, status: 'APPLIED', type: 'REPORT' }),
    ).resolves.toMatchObject({
      data: { items: [] },
      success: true,
    });

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.test/api/v1/activity?limit=1&status=APPLIED&type=REPORT');
    expect(options).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
      }),
    );
  });

  it('accepts the API Activity contract for a nameless CONTRIBUTION DRAFT', async () => {
    const responseBody = {
      data: {
        items: [
          {
            createdAt: '2026-07-31T19:37:21.290Z',
            id: '01KYWTWRM9Q7YFN8R6F5AP6Z16',
            placeId: null,
            placeName: null,
            status: 'DRAFT',
            type: 'CONTRIBUTION',
            updatedAt: '2026-07-31T19:37:21.290Z',
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      },
      meta: {
        generatedAt: '2026-07-31T19:37:21.322Z',
        requestId: '492a69a5-ae1a-4c7b-8d3d-84e914abe9be',
      },
      requestId: '492a69a5-ae1a-4c7b-8d3d-84e914abe9be',
      success: true,
    } as const;
    const fetchMock = vi.fn().mockResolvedValue(Response.json(responseBody));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getActivity({ limit: 20, status: 'DRAFT', type: 'CONTRIBUTION' }),
    ).resolves.toEqual(responseBody);
    expect(activityItemSchema.safeParse(responseBody.data.items[0])).toMatchObject({
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/activity?limit=20&status=DRAFT&type=CONTRIBUTION',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('turns a malformed Activity item into a safe client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            items: [
              {
                createdAt: '2026-07-31T19:37:21.290Z',
                id: '01KYWTWRM9Q7YFN8R6F5AP6Z16',
                placeId: null,
                placeName: 42,
                status: 'DRAFT',
                type: 'CONTRIBUTION',
                updatedAt: '2026-07-31T19:37:21.290Z',
              },
            ],
            pagination: { hasMore: false, nextCursor: null },
          },
          meta: { generatedAt: '2026-07-31T19:37:21.322Z', requestId: 'activity-invalid' },
          requestId: 'activity-invalid',
          success: true,
        }),
      ),
    );

    await expect(getActivity({ status: 'DRAFT', type: 'CONTRIBUTION' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  function searchInput(
    category: RecommendationInput['category'],
    budgetAmount: unknown,
  ): RecommendationInput {
    return {
      budgetAmount,
      category,
      latitude: -6.1,
      longitude: 106.8,
    } as RecommendationInput;
  }

  it.each([
    ['MAKAN_MURAH', 10_000],
    ['NGOPI', 25_000],
  ] as const)('sends the official budget for %s', async (category, budgetAmount) => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getRecommendations(searchInput(category, budgetAmount))).rejects.toThrow(
      'offline',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get('category')).toBe(category);
    expect(requestUrl.searchParams.get('budgetAmount')).toBe(String(budgetAmount));
  });

  it.each([
    ['TOILET', 20_000],
    ['MUSALA', 12_000],
    ['ISTIRAHAT', null],
  ] as const)('omits any budget supplied for %s', async (category, budgetAmount) => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getRecommendations(searchInput(category, budgetAmount))).rejects.toThrow(
      'offline',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get('category')).toBe(category);
    expect(requestUrl.searchParams.has('budgetAmount')).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['negative', -1],
    ['zero', 0],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['NaN', Number.NaN],
    ['numeric string', '15000'],
    ['non-preset', 12_000],
  ])('rejects a %s budget before fetch for a budget category', (_label, budgetAmount) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => getRecommendations(searchInput('MAKAN_MURAH', budgetAmount))).toThrow(
      ApiClientValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid Ngopi budget before fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => getRecommendations(searchInput('NGOPI', Number.NaN))).toThrow(
      ApiClientValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['recommendations', getRecommendations, 'public/recommendations'],
    ['places', getPlaces, 'public/places'],
  ] as const)(
    'enforces category and budget rules at the %s transport boundary',
    async (_transportName, transport, expectedPath) => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
      vi.stubGlobal('fetch', fetchMock);

      expect(() => transport(searchInput('MAKAN_MURAH', 12_000))).toThrow(ApiClientValidationError);
      expect(fetchMock).not.toHaveBeenCalled();

      await expect(transport(searchInput('TOILET', 20_000))).rejects.toThrow('offline');
      expect(fetchMock).toHaveBeenCalledOnce();
      const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(requestUrl.pathname).toContain(expectedPath);
      expect(requestUrl.searchParams.has('budgetAmount')).toBe(false);

      fetchMock.mockClear();
      await expect(transport(searchInput('NGOPI', 25_000))).rejects.toThrow('offline');
      expect(fetchMock).toHaveBeenCalledOnce();
      const budgetRequestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(budgetRequestUrl.pathname).toContain(expectedPath);
      expect(budgetRequestUrl.searchParams.get('budgetAmount')).toBe('25000');
    },
  );

  it.each([
    ['recommendations', getRecommendations],
    ['places', getPlaces],
  ] as const)('always sends the locked 5 km radius for %s', async (_name, transport) => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(transport(searchInput('TOILET', null))).rejects.toThrow('offline');

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get('radiusMeters')).toBe('5000');
  });

  it('maps RFC 9457 Problem Details and Retry-After into a typed error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'RATE_LIMITED',
            detail: 'Terlalu banyak permintaan.',
            error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan.' },
            instance: '/api/v1/public/categories',
            requestId: 'request-2',
            status: 429,
            success: false,
            title: 'Too Many Requests',
            type: 'https://pitstop.local/problems/rate-limited',
          },
          { headers: { 'Retry-After': '3' }, status: 429 },
        ),
      ),
    );

    const error = await getCategories().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiProblem);
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      requestId: 'request-2',
      retryAfterSeconds: 3,
      status: 429,
    });
  });

  it('honors an HTTP-date Retry-After value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T00:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'RATE_LIMITED',
            detail: 'Terlalu banyak permintaan.',
            error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan.' },
            instance: '/api/v1/public/categories',
            requestId: 'request-date',
            status: 429,
            success: false,
            title: 'Too Many Requests',
            type: 'https://pitstop.local/problems/rate-limited',
          },
          {
            headers: { 'Retry-After': 'Sun, 26 Jul 2026 00:00:03 GMT' },
            status: 429,
          },
        ),
      ),
    );

    await expect(getCategories()).rejects.toMatchObject({
      retryAfterSeconds: 3,
      status: 429,
    });
    vi.useRealTimers();
  });

  it('rejects a 2xx payload that drifts from the contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: 'unexpected', success: true })),
    );
    await expect(getCategories()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('rejects malformed JSON even when the content type is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{', {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    );
    await expect(getCategories()).rejects.toMatchObject({
      code: 'INVALID_JSON',
      status: 200,
    });
  });

  it('rejects non-JSON responses without exposing their body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>proxy error</html>', {
          headers: { 'content-type': 'text/html' },
          status: 502,
        }),
      ),
    );
    await expect(getCategories()).rejects.toMatchObject({
      code: 'INVALID_CONTENT_TYPE',
      status: 502,
    });
  });

  it('forwards cancellation to an in-flight fetch', async () => {
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('missing signal'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const request = getCategories(controller.signal);
    controller.abort(new DOMException('Filter changed', 'AbortError'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
