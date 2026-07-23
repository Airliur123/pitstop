import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  'http://127.0.0.1:3000/',
  'http://127.0.0.1:3000/dev/ui',
  'http://127.0.0.1:3001/',
  'http://127.0.0.1:3001/dev/ui',
] as const;

test('web and admin shells render without horizontal overflow', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} overflow`).toBeLessThanOrEqual(0);
  }
});

test('focus indicators and primary navigation are keyboard-visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Lewati ke konten utama' })).toBeFocused();

  const activity = page.getByRole('link', { name: 'Aktivitas' });
  await activity.focus();
  await expect(activity).toBeFocused();
  const activityFocus = await activity.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(activityFocus).not.toBe('none');

  await page.goto('http://127.0.0.1:3001/');
  const dashboard = page.getByRole('link', { name: 'Dashboard' });
  await dashboard.focus();
  await expect(dashboard).toBeFocused();
  const dashboardFocus = await dashboard.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(dashboardFocus).not.toBe('none');
});

test('catalog dialog opens, closes with Escape, and restores focus', async ({ page }) => {
  await page.goto('/dev/ui');
  const trigger = page.getByRole('button', { name: 'Buka dialog' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Dialog preview' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Dialog preview' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('catalog has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/dev/ui');
  const results = await new AxeBuilder({ page }).include('main').analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(blocking).toEqual([]);
});

test('shells and catalogs produce no console errors or hydration warnings', async ({ page }) => {
  const errors: string[] = [];
  const hydrationWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (/hydration|did not match|server rendered/i.test(message.text())) {
      hydrationWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
  }

  expect(errors).toEqual([]);
  expect(hydrationWarnings).toEqual([]);
});
