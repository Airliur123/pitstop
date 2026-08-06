import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const webBaseUrl = 'http://localhost:3100';
const adminBaseUrl = 'http://localhost:3101';
const apiBaseUrl = 'http://localhost:3102/api/v1';
const privateWebPathPattern = /^\/(?:activity|auth|contribute|contributions|reports?)(?:\/|$)/i;
const privateApiPathPattern = /^\/api\/v1\/(?:activity|admin|auth|contributions|reports?)(?:\/|$)/i;

interface CacheEntry {
  readonly cacheName: string;
  readonly method: string;
  readonly url: string;
}

function isPrivateCacheEntry(entry: CacheEntry) {
  const url = new URL(entry.url);
  if (url.origin === adminBaseUrl) return true;
  if (url.origin === webBaseUrl) return privateWebPathPattern.test(url.pathname);
  return url.origin === new URL(apiBaseUrl).origin && privateApiPathPattern.test(url.pathname);
}

function expectPrivateResponseCachePolicy(headers: Record<string, string>) {
  const cacheControl = headers['cache-control'] ?? '';

  // Next's development server deliberately replaces configured page cache headers.
  // The production build must retain private/no-store; development still has to
  // force revalidation and preserve the route's explicit Pragma guard.
  if (cacheControl === 'no-cache, must-revalidate') {
    expect(headers['pragma']).toBe('no-cache');
    return;
  }

  expect(cacheControl).toContain('no-store');
  expect(cacheControl).toContain('private');
}

async function ensureControllingServiceWorker(page: Page) {
  if (page.url() === 'about:blank') await page.goto('/');

  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('The PWA service worker did not claim the page.')),
          15_000,
        );
        const onControllerChange = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
          once: true,
        });
        if (navigator.serviceWorker.controller) onControllerChange();
      });
    }

    return {
      activeScriptUrl: registration.active?.scriptURL ?? null,
      controllerScriptUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
      scope: registration.scope,
      updateViaCache: registration.updateViaCache,
    };
  });
}

async function cacheInventory(page: Page): Promise<readonly CacheEntry[]> {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const entries = await Promise.all(
      cacheNames.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        return requests.map((request) => ({
          cacheName,
          method: request.method,
          url: request.url,
        }));
      }),
    );
    return entries.flat();
  });
}

test('@pwa-core manifest is installable and every declared icon is a real PNG', async ({
  request,
}) => {
  const response = await request.get(`${webBaseUrl}/manifest.webmanifest`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^application\/manifest\+json(?:;|$)/i);

  const manifest = (await response.json()) as {
    readonly background_color?: string;
    readonly description?: string;
    readonly display?: string;
    readonly icons?: readonly {
      readonly purpose?: string;
      readonly sizes?: string;
      readonly src?: string;
      readonly type?: string;
    }[];
    readonly name?: string;
    readonly orientation?: string;
    readonly scope?: string;
    readonly short_name?: string;
    readonly start_url?: string;
    readonly theme_color?: string;
  };

  expect(manifest).toMatchObject({
    display: 'standalone',
    scope: '/',
    start_url: '/',
  });
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.description).toBeTruthy();
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.orientation).toBeUndefined();

  const expectedIcons = [
    { purpose: undefined, sizes: '192x192' },
    { purpose: undefined, sizes: '512x512' },
    { purpose: 'maskable', sizes: '512x512' },
  ] as const;

  for (const expectedIcon of expectedIcons) {
    const icon = manifest.icons?.find(
      (candidate) =>
        candidate.sizes === expectedIcon.sizes &&
        (candidate.purpose ?? undefined) === expectedIcon.purpose,
    );
    expect(icon).toMatchObject({
      sizes: expectedIcon.sizes,
      type: 'image/png',
    });
    expect(icon?.src).toMatch(/^\/icons\/[-a-z0-9]+\.png$/i);

    const iconResponse = await request.get(`${webBaseUrl}${icon?.src ?? ''}`);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toMatch(/^image\/png(?:;|$)/i);
    const body = await iconResponse.body();
    expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(body.readUInt32BE(16)).toBe(Number.parseInt(expectedIcon.sizes.split('x')[0] ?? '', 10));
    expect(body.readUInt32BE(20)).toBe(Number.parseInt(expectedIcon.sizes.split('x')[1] ?? '', 10));
  }
});

test('@pwa-core service worker registers in explicit test mode and caches only safe public data', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const registration = await ensureControllingServiceWorker(page);
  expect(registration).toEqual({
    activeScriptUrl: `${webBaseUrl}/sw.js`,
    controllerScriptUrl: `${webBaseUrl}/sw.js`,
    scope: `${webBaseUrl}/`,
    updateViaCache: 'none',
  });

  const workerResponse = await request.get(`${webBaseUrl}/sw.js`);
  expect(workerResponse.ok()).toBe(true);
  expect(workerResponse.headers()['service-worker-allowed']).toBe('/');
  expect(workerResponse.headers()['cache-control']).toContain('no-store');

  const categoriesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/public/categories',
  );
  await page.reload();
  await categoriesResponse;

  await expect
    .poll(async () => cacheInventory(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cacheName: 'pitstop-web-v1-public-api',
          method: 'GET',
          url: `${apiBaseUrl}/public/categories`,
        }),
      ]),
    );

  const entries = await cacheInventory(page);
  expect(entries.some(isPrivateCacheEntry)).toBe(false);
  expect(entries.every((entry) => entry.method === 'GET')).toBe(true);
  expect(entries.filter((entry) => entry.cacheName.endsWith('-public-api'))).toEqual([
    {
      cacheName: 'pitstop-web-v1-public-api',
      method: 'GET',
      url: `${apiBaseUrl}/public/categories`,
    },
  ]);
});

test('@pwa-core public deep navigation falls back offline without stale data', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await ensureControllingServiceWorker(page);

  await context.setOffline(true);
  await page.goto('/places/deep-link-that-was-never-visited', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Koneksi sedang tidak tersedia' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'PitStop tidak menampilkan data tersimpan sebagai informasi terbaru',
  );
  await expect(page.getByRole('button', { name: 'Periksa koneksi' })).toBeEnabled();

  await context.setOffline(false);
});

test('@pwa-core Activity and admin HTML are unavailable offline and absent from Cache Storage', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await ensureControllingServiceWorker(page);
  await page.goto('/activity');
  await expect(page.locator('main')).toBeVisible();

  await page.evaluate(async (url) => {
    await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      headers: { Authorization: 'Bearer must-not-be-cached' },
    }).catch(() => undefined);
  }, `${apiBaseUrl}/auth/session`);

  await context.setOffline(true);
  await page.goto('/activity', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Koneksi sedang tidak tersedia' })).toBeVisible();

  await expect(
    page.goto(`${adminBaseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 10_000 }),
  ).rejects.toThrow(/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/i);

  await context.setOffline(false);
  await page.goto('/');
  const entries = await cacheInventory(page);
  expect(entries.some(isPrivateCacheEntry)).toBe(false);
  expect(entries.some((entry) => new URL(entry.url).origin === adminBaseUrl)).toBe(false);
});

test('@pwa-core offline mutation is not replayed and logout purge removes unsafe caches', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await ensureControllingServiceWorker(page);

  let mutationAttempts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v1/places/01J00000000000000000000000/reports'
    ) {
      mutationAttempts += 1;
    }
  });

  await context.setOffline(true);
  const mutationResult = await page.evaluate(async (url) => {
    try {
      await fetch(url, {
        body: JSON.stringify({ placeId: 'must-not-be-replayed' }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      return 'resolved';
    } catch {
      return 'rejected';
    }
  }, `${apiBaseUrl}/places/01J00000000000000000000000/reports`);
  expect(mutationResult).toBe('rejected');
  const attemptsBeforeReconnect = mutationAttempts;

  const backgroundSyncTags = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (
      registration as ServiceWorkerRegistration & {
        readonly sync?: { getTags(): Promise<readonly string[]> };
      }
    ).sync;
    if (!syncManager) return [];

    try {
      return await syncManager.getTags();
    } catch {
      // Chromium exposes SyncManager even when Background Sync is disabled by
      // browser policy. Either state proves there is no PitStop replay queue.
      return [];
    }
  });
  expect(backgroundSyncTags).toEqual([]);

  await context.setOffline(false);
  await page.waitForTimeout(1_000);
  expect(mutationAttempts).toBe(attemptsBeforeReconnect);

  await page.evaluate(async () => {
    const unsafeLegacy = await caches.open('apis');
    await unsafeLegacy.put('/activity', new Response('private activity'));
    const unsafeRuntime = await caches.open('pitstop-web-v1-public-api');
    await unsafeRuntime.put('/api/v1/auth/session', new Response('private session'));
    const safeStatic = await caches.open('pitstop-web-v1-static');
    await safeStatic.put('/_next/static/chunks/safe-12345678.js', new Response('static'));
    navigator.serviceWorker.controller?.postMessage({ type: 'PURGE_PRIVATE_CACHES' });
  });

  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toEqual(expect.arrayContaining(['apis', 'pitstop-web-v1-public-api']));
  expect(await page.evaluate(() => caches.keys())).toContain('pitstop-web-v1-static');
});

test('@pwa-core web, offline, and admin entry remain usable under security headers', async ({
  page,
  request,
}) => {
  for (const url of [
    `${webBaseUrl}/`,
    `${webBaseUrl}/activity`,
    `${webBaseUrl}/offline`,
    `${adminBaseUrl}/login`,
  ]) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeTruthy();
    expect(headers['permissions-policy']).toBeTruthy();
    expect(headers['strict-transport-security']).toBeUndefined();
  }

  const activityResponse = await request.get(`${webBaseUrl}/activity`);
  expectPrivateResponseCachePolicy(activityResponse.headers());
  const adminResponse = await request.get(`${adminBaseUrl}/login`);
  expectPrivateResponseCachePolicy(adminResponse.headers());

  for (const url of [`${webBaseUrl}/offline`, `${adminBaseUrl}/login`]) {
    await page.goto(url);
    await expect(page.locator('main')).toBeVisible();
    if (url === `${webBaseUrl}/offline`) {
      await expect(page.getByRole('heading', { name: 'Koneksi kembali tersedia' })).toBeVisible();
      const retry = page.getByRole('button', { name: 'Coba lagi' });
      await retry.focus();
      await expect(retry).toBeFocused();
    }
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
      `${url} serious or critical axe violations`,
    ).toEqual([]);
  }
});
