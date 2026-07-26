import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('@guest-core guest completes the category-to-detail vertical slice against the real API', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Data Simulasi — koordinat preview development')).toBeVisible();
  await page.getByRole('button', { name: 'Istirahat' }).click();
  await expect(page.getByRole('heading', { name: 'Istirahat' })).toBeVisible();

  await page.getByRole('button', { name: 'Cari Sekarang' }).click();
  await expect(page).toHaveURL(/\/places\?category=ISTIRAHAT/);
  await expect(page.getByRole('heading', { name: 'Rekomendasi terbaik' })).toBeVisible();

  const nearestFallback = page.getByRole('link', { name: 'Lihat tempat terdekat' });
  const directDetail = page.getByRole('link', { name: 'Detail' }).first();
  await expect(nearestFallback.or(directDetail)).toBeVisible();
  if (await nearestFallback.isVisible()) await nearestFallback.click();
  else await directDetail.click();

  await expect(page).toHaveURL(/\/places\/data-simulasi-/);
  await expect(page.getByRole('heading', { name: /Warung/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Menu dan harga' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arahkan Sekarang' })).toBeDisabled();

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
  await page.getByRole('button', { name: '≤ Rp20.000' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '≤ Rp20.000' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.route('**/api/v1/public/categories', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Koneksi sedang bermasalah' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
});

test('@guest-core a missing public slug renders the safe not-found state', async ({ page }) => {
  await page.goto('/places/tempat-yang-tidak-ada');
  await expect(page.getByRole('heading', { name: 'Tempat tidak ditemukan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke rekomendasi' })).toBeEnabled();
});
