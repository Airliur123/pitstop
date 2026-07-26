import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProblem, getCategories, normalizeApiBaseUrl } from './client';

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
        headers: { Accept: 'application/json, application/problem+json' },
      }),
    );
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
