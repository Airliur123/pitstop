import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:3000';

async function openManualLocation(page: Page) {
  await page.getByRole('button', { name: 'Pilih area manual' }).click();
  await expect(page.getByRole('heading', { name: 'Pilih area manual' })).toBeVisible();
}

async function activateManualLocation(page: Page, area: string) {
  await openManualLocation(page);
  const option = page.getByRole('button', {
    name: new RegExp(`${area}.*Jakarta Barat`, 'i'),
  });
  await option.focus();
  await page.keyboard.press('Enter');
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Gunakan area ini' }).click();
  await expect(page.getByText('Area manual')).toBeVisible();
  await expect(page.getByText(new RegExp(`${area}, Jakarta Barat`))).toBeVisible();
}

async function mockOpenMakanRecommendations(page: Page) {
  await page.route('**/api/v1/public/recommendations?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const category = {
      code: 'MAKAN_MURAH',
      id: 'category-makan',
      isPrimary: true,
      name: 'Makan Murah',
    } as const;
    const primary = {
      address: 'Jl. Tambora',
      budgetMatch: true,
      categories: [category],
      cheapestAvailableMainItem: { name: 'Nasi uji', priceAmount: 12_000 },
      cheapestQualifyingItem: { name: 'Nasi uji', priceAmount: 12_000 },
      dataFreshnessAt: '2026-07-26T00:00:00.000Z',
      distanceMeters: 0,
      facilitySummary: [],
      id: 'map-place-primary',
      landmark: null,
      latitude: -6.1468,
      longitude: 106.8061,
      name: 'Warung Map Utama',
      openStatus: 'OPEN',
      placeStatus: 'ACTIVE',
      primaryCategory: category,
      rankingReason: 'NEAREST_WITHIN_BUDGET',
      score: { budgetFit: 1, community: 0, distance: 1, freshness: 1, open: 1, total: 4 },
      shortDescription: null,
      slug: 'data-simulasi-warung-bu-ani',
      verificationStatus: 'ADMIN_VERIFIED',
    } as const;
    await route.fulfill({
      json: {
        data: {
          alternatives: [
            {
              ...primary,
              distanceMeters: 450,
              id: 'map-place-alternative',
              latitude: -6.1491,
              longitude: 106.8039,
              name: 'Warung Map Alternatif',
              slug: 'data-simulasi-warkop-bang-udin',
            },
          ],
          primary,
        },
        meta: {
          cache: 'BYPASS',
          fallback: null,
          generatedAt: '2026-07-26T00:00:00.000Z',
          query: {
            budgetAmount: Number(requestUrl.searchParams.get('budgetAmount')),
            budgetApplied: true,
            category: 'MAKAN_MURAH',
            latitude: Number(requestUrl.searchParams.get('latitude')),
            limit: Number(requestUrl.searchParams.get('limit')),
            longitude: Number(requestUrl.searchParams.get('longitude')),
            radiusMeters: 5_000,
          },
          requestId: 'e2e-map-request',
        },
        requestId: 'e2e-map-request',
        success: true,
      },
    });
  });
}

test('@guest-core permission granted activates current location and a 5 km request', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation'], { origin: appOrigin });
  await context.setGeolocation({ latitude: -6.1468, longitude: 106.8061 });
  await page.goto('/');

  const recommendationRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/public/recommendations' &&
      url.searchParams.get('radiusMeters') === '5000' &&
      url.searchParams.get('latitude') === '-6.1468' &&
      url.searchParams.get('longitude') === '106.8061'
    );
  });
  await page.getByRole('button', { name: 'Gunakan lokasi saya' }).click();
  await recommendationRequest;

  await expect(page.getByText('Lokasi saat ini').first()).toBeVisible();
  await expect(page.getByText('Radius utama rekomendasi 5 km')).toBeVisible();
  await expect(page).not.toHaveURL(/latitude|longitude|-6\.1468|106\.8061/);

  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});

test('@guest-core permission denied stops loading and offers manual location', async ({
  context,
  page,
}) => {
  await context.clearPermissions();
  await page.goto('/');
  await page.getByRole('button', { name: 'Gunakan lokasi saya' }).click();

  await expect(page.getByRole('heading', { name: 'Lokasi belum aktif' })).toBeVisible();
  await expect(page.getByText(/Izin lokasi ditolak oleh browser/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Pilih area manual' })).toBeEnabled();
  await expect(page.getByText('Menunggu hasil lokasi…')).toHaveCount(0);
});

test('@guest-core retry succeeds and a stale geolocation callback is ignored', async ({ page }) => {
  await page.addInitScript(() => {
    let attempt = 0;
    let staleSuccess: PositionCallback | undefined;
    const position = (latitude: number, longitude: number, timestamp: number) =>
      ({
        coords: {
          accuracy: 15,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude,
          longitude,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp,
        toJSON: () => ({}),
      }) as GeolocationPosition;

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        clearWatch: () => undefined,
        getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
          attempt += 1;
          if (attempt === 1) {
            staleSuccess = success;
            queueMicrotask(() =>
              error?.({
                code: 2,
                message: 'Mock position unavailable',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
            );
            return;
          }
          queueMicrotask(() => success(position(-6.138, 106.703, 200)));
          setTimeout(() => staleSuccess?.(position(-7, 107, 100)), 25);
        },
        watchPosition: () => 1,
      },
    });
  });
  const recommendationCoordinates: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/public/recommendations') {
      recommendationCoordinates.push(
        `${url.searchParams.get('latitude')},${url.searchParams.get('longitude')}`,
      );
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Gunakan lokasi saya' }).click();
  await expect(page.getByRole('heading', { name: 'Lokasi tidak tersedia' })).toBeVisible();
  await page.getByRole('button', { name: 'Coba lagi' }).click();

  await expect(page.getByText('Lokasi saat ini').first()).toBeVisible();
  await expect.poll(() => recommendationCoordinates).toContain('-6.138,106.703');
  await page.waitForTimeout(100);
  expect(recommendationCoordinates).not.toContain('-7,107');
});

test('@guest-core a valid manual area activates a labeled context and its coordinates', async ({
  page,
}) => {
  await page.goto('/');
  await openManualLocation(page);
  await page.getByRole('button', { name: /Kalideres.*Jakarta Barat/ }).click();
  const recommendationRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/public/recommendations' &&
      url.searchParams.get('latitude') === '-6.138' &&
      url.searchParams.get('longitude') === '106.703' &&
      url.searchParams.get('radiusMeters') === '5000'
    );
  });
  await page.getByRole('button', { name: 'Gunakan area ini' }).click();
  await recommendationRequest;

  await expect(page.getByText('Area manual')).toBeVisible();
  await expect(page.getByText('Kalideres, Jakarta Barat')).toBeVisible();
  await expect(page).not.toHaveURL(/latitude|longitude|-6\.138|106\.703/);
});

test('@guest-core invalid manual location stays inactive and both actions return to manual input', async ({
  page,
}) => {
  let recommendationRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/public/recommendations') {
      recommendationRequests += 1;
    }
  });
  await page.goto('/');
  await openManualLocation(page);

  const submitInvalidLocation = async () => {
    await page.getByRole('searchbox', { name: 'Cari area atau kecamatan' }).fill('Jakarta');
    await page.getByRole('button', { name: 'Cari area' }).click();
    await expect(page.getByRole('heading', { name: 'Lokasi tidak ditemukan.' })).toBeFocused();
  };

  await submitInvalidLocation();
  expect(recommendationRequests).toBe(0);
  await page.getByRole('button', { name: 'Ubah lokasi' }).click();
  await expect(page.getByRole('heading', { name: 'Pilih area manual' })).toBeVisible();

  await submitInvalidLocation();
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('heading', { name: 'Pilih area manual' })).toBeVisible();
  expect(recommendationRequests).toBe(0);
});

test('@guest-core list and map share filters, results, radius, and accessible alternatives', async ({
  page,
}) => {
  await mockOpenMakanRecommendations(page);
  await page.goto('/');
  await activateManualLocation(page, 'Tambora');
  await page.getByRole('button', { name: 'Cari Sekarang' }).click();
  await expect(page.getByRole('heading', { name: 'Rekomendasi terbaik' })).toBeVisible();

  await page.getByRole('link', { name: 'Peta' }).click();
  await expect(page).toHaveURL('/places?category=MAKAN_MURAH&sort=NEAREST&budget=15000&view=map');
  await expect(page.locator('.pitstop-result-map-frame')).toBeVisible();
  await expect(
    page.getByText('Peta dasar dinonaktifkan. Pin hasil dan radius tetap tersedia.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Daftar hasil yang ditampilkan di peta' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Warung Map Utama' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Warung Map Alternatif' })).toBeVisible();
  await expect(page).not.toHaveURL(/latitude|longitude|-6\.1468|106\.8061/);

  const selectPrimary = page.getByRole('button', {
    name: 'Tampilkan Warung Map Utama di peta',
  });
  await selectPrimary.click();
  await expect(selectPrimary).toHaveAttribute('aria-pressed', 'true');
  const primaryPopup = page.locator('.leaflet-popup').filter({ hasText: 'Warung Map Utama' });
  await expect(primaryPopup).toBeVisible();
  await expect(primaryPopup.getByRole('link', { name: 'Buka detail' })).toHaveAttribute(
    'href',
    '/places/data-simulasi-warung-bu-ani',
  );

  await page.locator('.pitstop-result-map').click({ position: { x: 12, y: 300 } });
  await expect(primaryPopup).toBeHidden();
  await selectPrimary.click();
  await expect(primaryPopup).toBeVisible();

  const mapResults = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    mapResults.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);

  await page.getByRole('link', { name: 'Daftar' }).click();
  await expect(page).toHaveURL('/places?category=MAKAN_MURAH&sort=NEAREST&budget=15000');
  await expect(page.getByRole('heading', { name: 'Warung Map Utama' })).toBeVisible();

  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});

test('@guest-core outside-radius candidate remains separate until an explicit action', async ({
  page,
}) => {
  await page.goto('/');
  await activateManualLocation(page, 'Cengkareng');
  await page.getByRole('button', { name: 'Cari Sekarang' }).click();

  await expect(
    page.getByRole('heading', { name: 'Belum ada tempat sesuai dalam radius 5 km' }),
  ).toBeVisible();
  await expect(page.getByText(/km.*di luar radius normal 5 km/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lihat kandidat di luar radius' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Peta' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Warung Bu Ani' })).toHaveCount(0);
});

test('@guest-core directions uses verified destination and omits user origin', async ({ page }) => {
  await page.goto('/places/data-simulasi-warung-bu-ani');

  const directions = page
    .getByRole('link', { name: /Arahkan ke Warung Bu Ani di Google Maps/ })
    .first();
  await expect(directions).toBeVisible();
  const href = await directions.getAttribute('href');
  if (href === null) throw new Error('Directions href is unavailable.');
  const url = new URL(href);
  expect(url.origin).toBe('https://www.google.com');
  expect(url.pathname).toBe('/maps/dir/');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('destination')).toBe('-6.1468,106.8061');
  expect(url.searchParams.has('origin')).toBe(false);
  await expect(directions).toHaveAttribute('target', '_blank');
  await expect(directions).toHaveAttribute('rel', 'noopener noreferrer');
});
