import { describe, expect, it } from 'vitest';

import {
  isHashedStaticRequest,
  isPublicCategoriesRequest,
  isResponseSafeToCache,
  PWA_CACHE_NAMES,
  PWA_CACHE_NAMESPACE,
  shouldDeleteOutdatedPwaCache,
  shouldPurgeCacheOnLogout,
} from './cache-policy';

const apiBaseUrl = 'https://api.pitstop.example/api/v1';

describe('PWA cache policy', () => {
  it('only admits credential-free GET requests for the exact public categories endpoint', () => {
    const safeRequest = new Request(`${apiBaseUrl}/public/categories`, {
      credentials: 'omit',
    });
    expect(isPublicCategoriesRequest(safeRequest, apiBaseUrl)).toBe(true);

    for (const request of [
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'include',
      }),
      new Request(`${apiBaseUrl}/public/categories?user=1`, {
        credentials: 'omit',
      }),
      new Request(`${apiBaseUrl}/public/places`, {
        credentials: 'omit',
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        headers: { Authorization: 'Bearer private' },
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        headers: { Cookie: 'session=private' },
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        headers: { 'Cache-Control': 'no-store' },
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        headers: { 'Cache-Control': 'no-cache' },
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        headers: { 'X-PitStop-Signature': 'private' },
      }),
      new Request(`${apiBaseUrl}/public/categories`, {
        credentials: 'omit',
        method: 'POST',
      }),
    ]) {
      expect(isPublicCategoriesRequest(request, apiBaseUrl)).toBe(false);
    }
  });

  it('never treats private routes or mutations as runtime cache candidates', () => {
    const privateRequests = [
      new Request(`${apiBaseUrl}/activity`, { credentials: 'include' }),
      new Request(`${apiBaseUrl}/contributions/01ABC`, { credentials: 'include' }),
      new Request(`${apiBaseUrl}/reports/01ABC`, { credentials: 'include' }),
      new Request(`${apiBaseUrl}/admin/reports`, { credentials: 'include' }),
      new Request(`${apiBaseUrl}/auth/session`, { credentials: 'include' }),
      new Request(`${apiBaseUrl}/auth/logout`, {
        credentials: 'include',
        method: 'POST',
      }),
    ];

    for (const request of privateRequests) {
      expect(isPublicCategoriesRequest(request, apiBaseUrl)).toBe(false);
      expect(isHashedStaticRequest(request, false)).toBe(false);
    }
  });

  it('only runtime-caches same-origin hashed Next static assets', () => {
    const asset = new Request(
      'https://pitstop.example/_next/static/chunks/app/layout-4bd1b696c8.js',
    );
    expect(isHashedStaticRequest(asset, true)).toBe(true);
    expect(isHashedStaticRequest(new Request('https://pitstop.example/logo.svg'), true)).toBe(
      false,
    );
    expect(isHashedStaticRequest(asset, false)).toBe(false);
    expect(
      isHashedStaticRequest(
        new Request(asset.url, { headers: { Authorization: 'Bearer private' } }),
        true,
      ),
    ).toBe(false);
  });

  it('rejects errors, private/no-store responses, cookies, opaque variants, and wrong API types', () => {
    expect(
      isResponseSafeToCache(
        new Response('{}', {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
        'application/json',
      ),
    ).toBe(true);
    expect(isResponseSafeToCache(new Response('error', { status: 500 }))).toBe(false);
    expect(
      isResponseSafeToCache(
        new Response('{}', { headers: { 'Cache-Control': 'private, max-age=60' } }),
      ),
    ).toBe(false);
    expect(
      isResponseSafeToCache(new Response('{}', { headers: { 'Cache-Control': 'no-store' } })),
    ).toBe(false);
    expect(
      isResponseSafeToCache(new Response('{}', { headers: { 'Cache-Control': 'no-cache' } })),
    ).toBe(false);
    expect(
      isResponseSafeToCache(
        new Response('{}', { headers: { 'Cache-Control': 'must-revalidate' } }),
      ),
    ).toBe(false);
    expect(
      isResponseSafeToCache(new Response('{}', { headers: { 'Set-Cookie': 'session=private' } })),
    ).toBe(false);
    expect(isResponseSafeToCache(new Response('{}', { headers: { Vary: '*' } }))).toBe(false);
    expect(
      isResponseSafeToCache(
        new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
        'application/json',
      ),
    ).toBe(false);
  });

  it('removes old namespaces and purges every non-precache/non-static cache on logout', () => {
    expect(shouldDeleteOutdatedPwaCache('pitstop-web-v0-pages')).toBe(true);
    expect(shouldDeleteOutdatedPwaCache('pages')).toBe(true);
    expect(shouldDeleteOutdatedPwaCache('serwist-precache-v2')).toBe(true);
    expect(shouldDeleteOutdatedPwaCache(PWA_CACHE_NAMES.publicApi)).toBe(false);
    expect(shouldDeleteOutdatedPwaCache('another-app-v1-pages')).toBe(false);

    expect(shouldPurgeCacheOnLogout(PWA_CACHE_NAMES.publicApi)).toBe(true);
    expect(shouldPurgeCacheOnLogout(`${PWA_CACHE_NAMESPACE}-private`)).toBe(true);
    expect(shouldPurgeCacheOnLogout('pitstop-web-v0-pages')).toBe(true);
    expect(shouldPurgeCacheOnLogout('pages')).toBe(true);
    expect(shouldPurgeCacheOnLogout('serwist-precache-v2')).toBe(true);
    expect(shouldPurgeCacheOnLogout(PWA_CACHE_NAMES.staticAssets)).toBe(false);
    expect(shouldPurgeCacheOnLogout(PWA_CACHE_NAMES.precache)).toBe(false);
    expect(shouldPurgeCacheOnLogout(`${PWA_CACHE_NAMESPACE}-precache-private`)).toBe(true);
    expect(shouldPurgeCacheOnLogout('another-app-v1-pages')).toBe(false);
  });
});
