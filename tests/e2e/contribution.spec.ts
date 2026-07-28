import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { expect, type APIRequestContext, type Browser, type Page, test } from '@playwright/test';
import { createPool, type Pool } from 'mysql2/promise';

const mailpitBaseUrl = 'http://127.0.0.1:8025';

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

test.describe.configure({ timeout: 120_000 });

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

async function loginFromContribution(page: Page, request: APIRequestContext, email: string) {
  await page.goto('/contribute');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcontribute$/);
  await requestLink(page, email);
  await page.goto(`/auth/verify?token=${await magicToken(request, email)}`);
  await expect(page).toHaveURL(/\/contribute\?id=[A-Z0-9]{26}&step=1$/);
  await expect(page.getByRole('heading', { name: 'Ceritakan tempatnya' })).toBeVisible();
}

async function loginStranger(
  browser: Browser,
  request: APIRequestContext,
  email: string,
): Promise<{ readonly close: () => Promise<void>; readonly page: Page }> {
  const context = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const page = await context.newPage();
  await loginFromContribution(page, request, email);
  return { close: () => context.close(), page };
}

test('@contribution-core completes, recovers, submits, and protects the contribution flow', async ({
  browser,
  page,
  request,
}) => {
  const ownerEmail = `e2e-contribution-owner-${Date.now()}@example.test`;
  await loginFromContribution(page, request, ownerEmail);
  const contributionId = new URL(page.url()).searchParams.get('id');
  expect(contributionId).toMatch(/^[A-Z0-9]{26}$/);

  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByText('Periksa kembali data berikut:')).toBeVisible();
  await expect(
    page.getByLabel('Informasi dasar').getByText('Nama tempat wajib diisi.'),
  ).toBeVisible();

  await page.getByRole('textbox', { name: /^Nama tempat/ }).fill('Warung E2E Phase 7');
  await page.getByRole('button', { name: 'Toilet' }).click();
  await page.getByRole('textbox', { name: /^Alamat atau lokasi/ }).fill('Jl. E2E No. 7, Jakarta');
  await page
    .getByRole('textbox', { name: /^Tautan Google Maps/ })
    .fill('https://www.google.com/maps?q=-6.2,106.8');

  const accessibility = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page).toHaveURL(new RegExp(`/contribute\\?id=${contributionId}&step=2$`));
  await expect(page.getByRole('heading', { name: 'Lengkapi detail' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Nama menu termurah/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kembali' }).click();
  await expect(page).toHaveURL(new RegExp(`/contribute\\?id=${contributionId}&step=1$`));
  await expect(page.getByRole('textbox', { name: /^Nama tempat/ })).toHaveValue(
    'Warung E2E Phase 7',
  );
  await page.getByRole('button', { name: 'Makan Murah' }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('textbox', { name: /^Nama menu termurah/ })).toBeVisible();

  await page.getByRole('textbox', { name: /^Nama menu termurah/ }).fill('Nasi telur');
  await page.getByRole('spinbutton', { name: /^Harga menu termurah/ }).fill('12000');
  await page.getByRole('combobox', { name: 'Parkir tersedia' }).selectOption('AVAILABLE');
  await page.getByRole('combobox', { name: 'Jadwal Senin' }).selectOption('OPEN');
  await page.getByLabel('Jam buka Senin').fill('18:00');
  await page.getByLabel('Jam tutup Senin').fill('02:00');
  await page.getByRole('textbox', { name: /^Catatan tambahan/ }).fill('Masuk dari sisi timur.');

  let failedPatch = false;
  await page.route('**/api/v1/contributions/**', async (route) => {
    if (!failedPatch && route.request().method() === 'PATCH') {
      failedPatch = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Simpan draft' }).click();
  await expect(page.getByText('Perubahan belum tersimpan')).toBeVisible();
  await page.unroute('**/api/v1/contributions/**');
  await page.getByRole('button', { name: 'Simpan draft' }).click();
  await expect(page.getByText('Draft tersimpan')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lengkapi detail' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Nama menu termurah/ })).toHaveValue(
    'Nasi telur',
  );
  await expect(page.getByRole('combobox', { name: 'Jadwal Senin' })).toHaveValue('OPEN');

  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page).toHaveURL(new RegExp(`/contribute\\?id=${contributionId}&step=3$`));
  await expect(page.getByRole('heading', { name: 'Tinjau kontribusi' })).toBeVisible();
  await expect(page.getByText('Warung E2E Phase 7')).toBeVisible();
  await expect(page.getByText(/12\.000/)).toBeVisible();
  await expect(page.getByText('18:00–02:00')).toBeVisible();

  await page.getByRole('button', { name: 'Kirim kontribusi' }).click();
  await expect(page).toHaveURL(`/contributions/${contributionId}/success`);
  await expect(page.getByRole('heading', { name: 'Kontribusi berhasil dikirim' })).toBeVisible();
  await page.getByRole('link', { name: 'Lihat detail kontribusi' }).click();
  await expect(page).toHaveURL(`/contributions/${contributionId}`);
  await expect(page.getByRole('heading', { name: 'Menunggu pemeriksaan' })).toBeVisible();
  await expect(page.getByText('Data bersifat read-only')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lanjutkan edit' })).toHaveCount(0);

  const stranger = await loginStranger(
    browser,
    request,
    `e2e-contribution-other-${Date.now()}@example.test`,
  );
  await stranger.page.goto(`/contributions/${contributionId}`);
  await expect(stranger.page.getByText('Kontribusi tidak ditemukan')).toBeVisible();
  await stranger.close();
});
