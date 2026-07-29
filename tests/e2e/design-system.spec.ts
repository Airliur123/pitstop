import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  'http://localhost:3100/',
  'http://localhost:3100/dev/ui',
  'http://localhost:3101/login',
] as const;

test('web surfaces and the admin entry surface render without horizontal overflow', async ({
  page,
}) => {
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

  await page.goto('http://localhost:3101/login');
  const adminLogin = page.getByRole('button', { name: 'Kirim tautan masuk' });
  await adminLogin.focus();
  await expect(adminLogin).toBeFocused();
  const adminLoginFocus = await adminLogin.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );
  expect(adminLoginFocus).not.toBe('none');
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

test('shells and catalogs have no serious or critical axe violations', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).include('main').analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking, `${route} axe violations`).toEqual([]);
  }
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
