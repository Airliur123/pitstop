/// <reference lib="webworker" />

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  type PrecacheEntry,
  Serwist,
  type SerwistPlugin,
} from 'serwist';

import {
  isHashedStaticRequest,
  isPublicCategoriesRequest,
  isResponseSafeToCache,
  PWA_CACHE_NAMES,
  PWA_CACHE_NAMESPACE,
  shouldDeleteOutdatedPwaCache,
  shouldPurgeCacheOnLogout,
} from '../lib/pwa/cache-policy';

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: PrecacheEntry[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const safeDevelopmentPrecacheEntries: PrecacheEntry[] = [
  { revision: 'phase-11-v1', url: '/icons/pitstop-192.png' },
  { revision: 'phase-11-v1', url: '/icons/pitstop-512.png' },
  { revision: 'phase-11-v1', url: '/icons/pitstop-maskable-512.png' },
  { revision: 'phase-11-v1', url: '/offline' },
];

function safeResponsePlugin(expectedContentType?: string): SerwistPlugin {
  return {
    cacheWillUpdate: ({ response }) =>
      isResponseSafeToCache(response, expectedContentType) ? response : null,
  };
}

async function offlineFallback(): Promise<Response> {
  const precached: Response | undefined = await serwist.matchPrecache('/offline');
  if (precached) return precached;

  return new Response(
    '<!doctype html><html lang="id"><meta charset="utf-8"><title>Offline - PitStop</title><main><h1>Koneksi tidak tersedia</h1><p>PitStop memerlukan koneksi untuk memuat halaman ini. Data lama tidak ditampilkan sebagai data terbaru.</p><p><a href="/">Coba buka beranda</a></p></main></html>',
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 503,
    },
  );
}

async function purgeCaches(predicate: (cacheName: string) => boolean) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter(predicate).map(async (cacheName) => {
      await caches.delete(cacheName);
    }),
  );
}

const serwist: Serwist = new Serwist({
  cacheId: PWA_CACHE_NAMESPACE,
  clientsClaim: true,
  disableDevLogs: true,
  // The Serwist loader injects the build manifest in production. In the explicit
  // development test profile it leaves the placeholder undefined, so retain only
  // the same explicitly allowlisted public fallback assets in that environment.
  precacheEntries: self.__SW_MANIFEST ?? safeDevelopmentPrecacheEntries,
  precacheOptions: {
    cacheName: PWA_CACHE_NAMES.precache,
    cleanupOutdatedCaches: true,
  },
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) => isHashedStaticRequest(request, sameOrigin),
      handler: new CacheFirst({
        cacheName: PWA_CACHE_NAMES.staticAssets,
        plugins: [
          safeResponsePlugin(),
          new ExpirationPlugin({
            maxAgeFrom: 'last-used',
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxEntries: 96,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => isPublicCategoriesRequest(request, apiBaseUrl),
      handler: new NetworkFirst({
        cacheName: PWA_CACHE_NAMES.publicApi,
        networkTimeoutSeconds: 4,
        plugins: [
          safeResponsePlugin('application/json'),
          new ExpirationPlugin({
            maxAgeFrom: 'last-used',
            maxAgeSeconds: 5 * 60,
            maxEntries: 2,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
      handler: async ({ request }): Promise<Response> => {
        try {
          return await fetch(request);
        } catch {
          return offlineFallback();
        }
      },
    },
  ],
  skipWaiting: false,
});

self.addEventListener('activate', (event) => {
  event.waitUntil(purgeCaches(shouldDeleteOutdatedPwaCache));
});

self.addEventListener('message', (event) => {
  const message = event.data as { readonly type?: unknown } | null;
  if (message?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (message?.type === 'PURGE_PRIVATE_CACHES') {
    event.waitUntil(purgeCaches(shouldPurgeCacheOnLogout));
  }
});

serwist.addEventListeners();
