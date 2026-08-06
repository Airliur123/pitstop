import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { createPool, type Pool } from 'mysql2/promise';

const mailpitBaseUrl = 'http://127.0.0.1:8025';
const e2eApiBaseUrl = 'http://localhost:3102/api/v1';

interface MailpitMessage {
  readonly ID: string;
  readonly To: readonly { readonly Address: string }[];
}

interface MailpitList {
  readonly messages: readonly MailpitMessage[];
}

interface MailpitDetail {
  readonly HTML?: string;
  readonly Text?: string;
}

let databasePool: Pool | undefined;
const createdEmails = new Set<string>();

test.describe.configure({ timeout: 90_000 });

test.beforeAll(() => {
  loadWorkspaceEnvironment(process.cwd());
  databasePool = createPool(process.env.DATABASE_URL ?? '');
});

test.afterAll(async () => {
  if (databasePool) {
    for (const email of createdEmails) {
      await databasePool.execute(
        `DELETE FROM idempotency_keys
         WHERE scope LIKE CONCAT('%', (
           SELECT id FROM users WHERE normalized_email = ? LIMIT 1
         ), '%')`,
        [email.toLowerCase()],
      );
      await databasePool.execute(
        `DELETE FROM contributions
         WHERE submitted_by = (
           SELECT id FROM users WHERE normalized_email = ? LIMIT 1
         )`,
        [email.toLowerCase()],
      );
      await databasePool.execute('DELETE FROM users WHERE normalized_email = ?', [
        email.toLowerCase(),
      ]);
    }
  }
  await databasePool?.end();
});

async function requestLink(page: Page, email: string) {
  createdEmails.add(email);
  await page.getByRole('textbox', { name: /^Email/ }).fill(email);
  await page.getByRole('button', { name: 'Kirim tautan masuk' }).click();
  await expect(
    page.getByText('Jika email dapat digunakan, tautan masuk telah dikirim.'),
  ).toBeVisible();
}

async function magicToken(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const list = (await (
      await request.get(`${mailpitBaseUrl}/api/v1/messages`)
    ).json()) as MailpitList;
    const message = list.messages.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const detail = (await (
        await request.get(`${mailpitBaseUrl}/api/v1/message/${encodeURIComponent(message.ID)}`)
      ).json()) as MailpitDetail;
      const match = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`.match(
        /\/auth\/verify\?token=([A-Za-z0-9_-]{43})/,
      );
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No Mailpit message for ${email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);
}

test('@auth-core guest signs in from a protected route, keeps an HttpOnly session, and logs out', async ({
  page,
  request,
}) => {
  const email = `e2e-auth-${Date.now()}@example.test`;
  await page.goto('/activity');
  await expect(page).toHaveURL('/activity');
  await expect(page.getByText('Aktivitas tersimpan di akun')).toBeVisible();
  await page.getByRole('link', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Factivity$/);
  await requestLink(page, email);

  const token = await magicToken(request, email);
  const activityRequest = page.waitForRequest(
    (candidate) => candidate.url() === `${e2eApiBaseUrl}/activity?limit=20`,
  );
  const activityResponse = page.waitForResponse(
    (candidate) => candidate.url() === `${e2eApiBaseUrl}/activity?limit=20`,
  );
  await page.goto(`/auth/verify?token=${token}`);
  await expect(page).toHaveURL('/activity');
  await expect(page.getByRole('heading', { name: 'Aktivitas', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  const requestHeaders = await (await activityRequest).allHeaders();
  const response = await activityResponse;
  const responseBody = await response.json();
  expect(requestHeaders.cookie).toContain('pitstop_session=');
  expect(response.status()).toBe(200);
  expect(response.headers()).toMatchObject({
    'access-control-allow-credentials': 'true',
    'access-control-allow-origin': 'http://localhost:3100',
    'cache-control': 'no-store, private',
    pragma: 'no-cache',
  });
  expect(responseBody).toMatchObject({
    data: { items: [], pagination: { hasMore: false, nextCursor: null } },
    success: true,
  });
  await expect(page.getByRole('heading', { name: 'Aktivitas masih kosong' })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain('pitstop_session');
  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'pitstop_session',
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aktivitas', exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);

  await page.evaluate(async () => {
    const unexpectedPrivateCache = await caches.open('pitstop-web-v1-public-api');
    await unexpectedPrivateCache.put(
      '/api/v1/auth/session',
      new Response('unexpected private session'),
    );
    const legacyPrivateCache = await caches.open('apis');
    await legacyPrivateCache.put('/activity', new Response('unexpected private activity'));
    const safeStaticCache = await caches.open('pitstop-web-v1-static');
    await safeStaticCache.put(
      '/_next/static/chunks/logout-regression-12345678.js',
      new Response('safe static'),
    );
  });
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL('/activity');
  await expect(page.getByText('Aktivitas tersimpan di akun')).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'pitstop_session')).toBe(
    false,
  );
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toEqual(expect.arrayContaining(['apis', 'pitstop-web-v1-public-api']));
  expect(await page.evaluate(() => caches.keys())).toContain('pitstop-web-v1-static');

  await page.goto(`/auth/verify?token=${token}`);
  await expect(page).toHaveURL('/login?state=invalid');
  await expect(page.getByText(/tidak valid atau sudah pernah digunakan/i)).toBeVisible();
});

test('@auth-core expired links and external return destinations fail safely', async ({
  page,
  request,
}) => {
  const contributeEmail = `e2e-contribute-${Date.now()}@example.test`;
  await page.goto('/contribute');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcontribute$/);
  await requestLink(page, contributeEmail);
  await page.goto(`/auth/verify?token=${await magicToken(request, contributeEmail)}`);
  await expect(page).toHaveURL(/\/contribute\?id=[A-Z0-9]{26}&step=1$/);
  await expect(page.getByRole('heading', { name: 'Ceritakan tempatnya' })).toBeVisible();
  await page.goto('/activity');
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL('/activity');
  await expect(page.getByText('Aktivitas tersimpan di akun')).toBeVisible();

  const expiredEmail = `e2e-expired-${Date.now()}@example.test`;
  await page.goto('/login?returnTo=/contribute');
  await requestLink(page, expiredEmail);
  const expiredToken = await magicToken(request, expiredEmail);
  await databasePool?.execute(
    `UPDATE auth_login_tokens
     SET created_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE),
         expires_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 MINUTE)
     WHERE user_id = (SELECT id FROM users WHERE normalized_email = ? LIMIT 1)
       AND consumed_at IS NULL`,
    [expiredEmail.toLowerCase()],
  );
  await page.goto(`/auth/verify?token=${expiredToken}`);
  await expect(page).toHaveURL('/login?state=expired');
  await expect(page.getByText(/sudah kedaluwarsa/i)).toBeVisible();

  const redirectEmail = `e2e-return-${Date.now()}@example.test`;
  await page.goto('/login?returnTo=https://attacker.example');
  await requestLink(page, redirectEmail);
  await page.goto(`/auth/verify?token=${await magicToken(request, redirectEmail)}`);
  await expect(page).toHaveURL('/');
  await expect(page).not.toHaveURL(/attacker|token=/);
});

test('@auth-core login remains keyboard-usable and has no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Lewati ke konten utama' })).toBeFocused();
  await page.getByRole('textbox', { name: /^Email/ }).focus();
  await expect(page.getByRole('textbox', { name: /^Email/ })).toBeFocused();
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});
