import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { expect, test } from '@playwright/test';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

const paginationFixturePrefix = 'e2e-pagination-';
const paginationFixtureIds = Array.from(
  { length: 21 },
  (_, index) => `01J${String(index).padStart(23, '0')}`,
);

interface CategoryRow extends RowDataPacket {
  readonly id: string;
}

let paginationPool: Pool | undefined;
const budgetPresets = [
  { amount: '10000', label: '≤ Rp10.000' },
  { amount: '15000', label: '≤ Rp15.000' },
  { amount: '20000', label: '≤ Rp20.000' },
  { amount: '25000', label: '≤ Rp25.000' },
] as const;

async function activateKalideres(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Pilih area manual' }).click();
  await page.getByRole('button', { name: /Kalideres.*Jakarta Barat/ }).click();
  await page.getByRole('button', { name: 'Gunakan area ini' }).click();
  await expect(page.getByText('Area manual')).toBeVisible();
  await expect(page.getByText('Kalideres, Jakarta Barat')).toBeVisible();
}

test.beforeAll(async () => {
  loadWorkspaceEnvironment(process.cwd());
  paginationPool = createPool(process.env.DATABASE_URL ?? '');
  const [categories] = await paginationPool.execute<CategoryRow[]>(
    'SELECT id FROM categories WHERE code = ?',
    ['ISTIRAHAT'],
  );
  const categoryId = categories[0]?.id;
  if (!categoryId) throw new Error('ISTIRAHAT category fixture is unavailable.');

  for (const [index, id] of paginationFixtureIds.entries()) {
    const suffix = String(index + 1).padStart(2, '0');
    await paginationPool.execute(
      `INSERT INTO places (
         id, name, slug, description, address, district, city, province, postal_code,
         location, place_status, verification_status, verified_at, data_freshness_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SRID(POINT(?, ?), 4326), ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        id,
        `Tempat Pagination ${suffix}`,
        `${paginationFixturePrefix}${suffix}`,
        'Fixture sementara untuk pagination E2E.',
        'Alamat fixture E2E',
        'Kalideres',
        'Jakarta Barat',
        'DKI Jakarta',
        '00000',
        106.703 + index * 0.00001,
        -6.138,
        'ACTIVE',
        'ADMIN_VERIFIED',
      ],
    );
    await paginationPool.execute(
      'INSERT INTO place_categories (place_id, category_id, is_primary) VALUES (?, ?, true)',
      [id, categoryId],
    );
  }
});

test.afterAll(async () => {
  if (!paginationPool) return;
  try {
    for (const id of paginationFixtureIds) {
      await paginationPool.execute('DELETE FROM place_categories WHERE place_id = ?', [id]);
      await paginationPool.execute('DELETE FROM places WHERE id = ?', [id]);
    }
  } finally {
    await paginationPool.end();
  }
});

test('@guest-core guest completes the category-to-detail vertical slice against the real API', async ({
  page,
}) => {
  await page.goto('/');
  await activateKalideres(page);
  await page.getByRole('button', { name: 'Istirahat' }).click();
  await expect(page.getByRole('heading', { name: 'Istirahat' })).toBeVisible();

  await page.getByRole('button', { name: 'Cari Sekarang' }).click();
  await expect(page).toHaveURL(/\/places\?category=ISTIRAHAT/);
  await expect(page.getByRole('heading', { name: 'Rekomendasi terbaik' })).toBeVisible();

  const nearestFallback = page.getByRole('link', { name: 'Lihat kandidat di luar radius' });
  const directDetail = page.getByRole('link', { name: 'Detail' }).first();
  await expect(nearestFallback.or(directDetail)).toBeVisible();
  if (await nearestFallback.isVisible()) await nearestFallback.click();
  else await directDetail.click();

  await expect(page).toHaveURL(/\/places\/data-simulasi-/);
  await expect(page.getByRole('heading', { name: /Warung/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Menu dan harga' })).toBeVisible();
  const directions = page.getByRole('link', { name: /Arahkan ke .*Google Maps/ });
  await expect(directions).toHaveAttribute('target', '_blank');
  await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=/);

  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('@guest-core guest budget survives reload and a network failure remains recoverable', async ({
  page,
}) => {
  await page.goto('/');
  await activateKalideres(page);
  await page.getByRole('button', { name: /Ubah budget/ }).click();
  await page.getByRole('button', { name: '≤ Rp20.000' }).click();
  await page.getByRole('button', { name: 'Tutup lembar' }).click();
  await page.reload();
  await activateKalideres(page);
  await page.getByRole('button', { name: /Ubah budget/ }).click();
  await expect(page.getByRole('button', { name: '≤ Rp20.000' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Tutup lembar' }).click();

  await page.route('**/api/v1/public/categories', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await activateKalideres(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Koneksi sedang bermasalah' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
});

for (const preset of budgetPresets) {
  test(`@guest-core guest applies ${preset.label} from Home through Recommendations`, async ({
    page,
  }) => {
    await page.goto('/');
    await activateKalideres(page);
    await page.getByRole('button', { name: /Ubah budget/ }).click();

    const presetButton = page.getByRole('button', { name: preset.label });
    await presetButton.click();
    await expect(presetButton).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tutup lembar' }).click();

    await expect(page.getByRole('button', { name: `Ubah budget ${preset.label}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Makan Murah ${preset.label}` })).toBeVisible();

    const recommendationRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === '/api/v1/public/recommendations' &&
        url.searchParams.get('budgetAmount') === preset.amount &&
        url.searchParams.get('limit') === '4'
      );
    });
    await page.getByRole('button', { name: 'Cari Sekarang' }).click();
    await recommendationRequest;

    await expect(page).toHaveURL(
      `/places?category=MAKAN_MURAH&sort=NEAREST&budget=${preset.amount}`,
    );
    await expect(page.getByText(new RegExp(`${preset.label} · Radius 5 km`))).toBeVisible();
  });
}

test('@guest-core a missing public slug renders the safe not-found state', async ({ page }) => {
  await page.goto('/places/tempat-yang-tidak-ada');
  await expect(page.getByRole('heading', { name: 'Tempat tidak ditemukan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke rekomendasi' })).toBeEnabled();
});

test('@guest-core loads a second opaque cursor page without duplicate places', async ({ page }) => {
  await page.goto('/');
  await activateKalideres(page);
  await page.getByRole('button', { name: 'Istirahat' }).click();
  await page.getByRole('button', { name: 'Cari Sekarang' }).click();
  await expect(page).toHaveURL(/\/places\?category=ISTIRAHAT/);
  await expect(page.getByRole('button', { name: 'Lihat semua' })).toBeVisible();

  const firstPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/public/places' && !url.searchParams.has('cursor');
  });
  await page.getByRole('button', { name: 'Lihat semua' }).click();
  await firstPage;
  const allResults = page.getByLabel('Semua hasil terverifikasi');
  await expect(allResults.getByRole('heading', { name: 'Tempat Pagination 01' })).toBeVisible();

  const secondPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/public/places' && Boolean(url.searchParams.get('cursor'));
  });
  await page.getByRole('button', { name: 'Muat lebih banyak' }).click();
  await secondPage;
  await expect(allResults.getByRole('heading', { name: 'Tempat Pagination 21' })).toBeVisible();

  const names = await allResults
    .getByRole('heading', { name: /Tempat Pagination/ })
    .allTextContents();
  expect(names).toHaveLength(21);
  expect(new Set(names).size).toBe(21);
  await expect(page.getByText('Semua hasil sudah ditampilkan.')).toBeVisible();
});
