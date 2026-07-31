import { randomBytes } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

const adminBaseUrl = 'http://localhost:3101';
const mailpitBaseUrl = 'http://127.0.0.1:8025';

interface CategoryRow extends RowDataPacket {
  readonly id: string;
}

interface CountRow extends RowDataPacket {
  readonly count: number;
}

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
let fixturePlaceId = '';
let fixtureSlug = '';
let initialPlaceName = '';
let appliedPlaceName = '';

function createFixtureUlid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timestamp = Date.now();
  let timePart = '';
  for (let index = 0; index < 10; index += 1) {
    timePart = alphabet[timestamp % 32] + timePart;
    timestamp = Math.floor(timestamp / 32);
  }
  const randomPart = [...randomBytes(16)].map((value) => alphabet[value % 32]).join('');
  return `${timePart}${randomPart}`;
}

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  loadWorkspaceEnvironment(process.cwd());
  databasePool = createPool(process.env.DATABASE_URL ?? '');
  fixturePlaceId = createFixtureUlid();
  fixtureSlug = `e2e-governance-${fixturePlaceId.toLowerCase()}`;
  initialPlaceName = `Tempat Governance ${fixturePlaceId.slice(-6)}`;
  appliedPlaceName = `${initialPlaceName} Diperbarui`;
  const [categories] = await databasePool.execute<CategoryRow[]>(
    'SELECT id FROM categories WHERE code = ? LIMIT 1',
    ['ISTIRAHAT'],
  );
  const categoryId = categories[0]?.id;
  if (!categoryId) throw new Error('ISTIRAHAT category fixture is unavailable.');
  await databasePool.execute(
    `INSERT INTO places (
       id, name, slug, description, address, district, city, province, postal_code,
       location, place_status, verification_status, verified_at, data_freshness_at, version
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?,
       ST_SRID(POINT(?, ?), 4326), 'ACTIVE', 'ADMIN_VERIFIED',
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), 1
     )`,
    [
      fixturePlaceId,
      initialPlaceName,
      fixtureSlug,
      'Fixture terisolasi untuk alur governance browser.',
      'Jl. Governance Browser No. 10',
      'Kalideres',
      'Jakarta Barat',
      'DKI Jakarta',
      '11840',
      106.703,
      -6.138,
    ],
  );
  await databasePool.execute(
    'INSERT INTO place_categories (place_id, category_id, is_primary) VALUES (?, ?, true)',
    [fixturePlaceId, categoryId],
  );
});

test.afterAll(async () => {
  // The report, user, Place, history, and audit fixture deliberately remain in the disposable
  // Playwright database: governance references are restrictive and both event stores are
  // append-only by design.
  await databasePool?.end();
});

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

async function requestMagicLink(page: Page, email: string, admin = false) {
  await page.getByRole('textbox', { name: admin ? /^Email administrator/ : /^Email/ }).fill(email);
  await page.getByRole('button', { name: 'Kirim tautan masuk' }).click();
  await expect(
    page.getByText(/Jika (email dapat digunakan|alamat tersebut terdaftar)/),
  ).toBeVisible();
}

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
}

test('@admin-core user report is claimed and applied transactionally, then confirmed', async ({
  browser,
  page,
  request,
}) => {
  if (!databasePool) throw new Error('E2E database is not initialized.');
  const userEmail = `e2e-report-user-${Date.now()}@example.test`;
  const adminEmail = `e2e-report-admin-${Date.now()}@example.test`;

  await page.goto(`/login?returnTo=${encodeURIComponent(`/places/${fixtureSlug}`)}`);
  await requestMagicLink(page, userEmail);
  await page.goto(`/auth/verify?token=${await magicToken(request, userEmail)}`);
  await expect(page).toHaveURL(`/places/${fixtureSlug}`);
  await expect(page.getByRole('heading', { name: initialPlaceName })).toBeVisible();

  await page.getByRole('link', { name: 'Laporkan perubahan' }).click();
  await expect(page.getByRole('heading', { name: 'Laporkan perubahan' })).toBeVisible();
  await page.getByLabel('Jenis perubahan').selectOption('OTHER');
  await page.getByLabel('Nama yang benar (opsional)').fill(appliedPlaceName);
  await page
    .getByLabel('Penjelasan')
    .fill('Nama pada papan lokasi telah berubah dan perlu diselaraskan dengan data Place.');
  await expectNoSeriousAxeViolations(page);
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page.getByText('Laporan berhasil dikirim')).toBeVisible();
  const reportId = new URL(page.url()).pathname.match(/^\/reports\/([^/]+)\/success$/)?.[1];
  if (!reportId) throw new Error('Report success URL did not contain an ID.');

  await page.getByRole('link', { name: 'Lihat detail laporan' }).click();
  await expect(page.getByRole('heading', { name: 'Menunggu pemeriksaan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: initialPlaceName })).toBeVisible();

  await page.goto(`/places/${fixtureSlug}`);
  await page.getByRole('link', { name: 'Laporkan perubahan' }).click();
  await page.getByLabel('Jenis perubahan').selectOption('OTHER');
  await page
    .getByLabel('Deskripsi yang benar (opsional)')
    .fill('Deskripsi kedua yang sengaja ditolak setelah review.');
  await page
    .getByLabel('Penjelasan')
    .fill('Laporan kedua memastikan alasan penolakan aman terlihat oleh pemilik laporan.');
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page.getByText('Laporan berhasil dikirim')).toBeVisible();
  const rejectedReportId = new URL(page.url()).pathname.match(/^\/reports\/([^/]+)\/success$/)?.[1];
  if (!rejectedReportId) throw new Error('Rejected report success URL did not contain an ID.');

  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Aktivitas' })).toBeVisible();
  await expect(page.getByText('Laporan perubahan')).toHaveCount(2);
  await expect(page.getByText(initialPlaceName)).toHaveCount(2);
  await page.goto(`/places/${fixtureSlug}`);
  await expect(page.getByRole('heading', { name: initialPlaceName })).toBeVisible();
  await expect(page.getByRole('heading', { name: appliedPlaceName })).toHaveCount(0);

  await page.goto(`${adminBaseUrl}/reports`);
  await expect(page.getByRole('heading', { name: 'Akses admin diperlukan' })).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  try {
    await adminPage.goto(`${adminBaseUrl}/login`);
    await requestMagicLink(adminPage, adminEmail, true);
    await databasePool.execute(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id
       FROM users u
       JOIN roles r ON r.code = 'ADMIN'
       WHERE u.normalized_email = ?
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [adminEmail.toLowerCase()],
    );
    await adminPage.goto(
      `${adminBaseUrl}/auth/verify?token=${await magicToken(request, adminEmail)}`,
    );
    await expect(adminPage).toHaveURL(`${adminBaseUrl}/`);

    await adminPage.goto(`${adminBaseUrl}/reports?search=${encodeURIComponent(initialPlaceName)}`);
    await expect(adminPage.getByRole('heading', { name: 'Place reports' })).toBeVisible();
    await expect(adminPage.getByText(initialPlaceName)).toHaveCount(2);
    await adminPage.goto(`${adminBaseUrl}/reports/${reportId}`);
    await expect(adminPage.getByRole('heading', { name: initialPlaceName })).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: 'Current Place' })).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: 'Proposed change' })).toBeVisible();
    await expect(adminPage.getByText(appliedPlaceName)).toBeVisible();

    await adminPage.getByRole('button', { name: 'Ambil review' }).click();
    await expect(adminPage.getByRole('dialog')).toBeVisible();
    await adminPage.getByRole('button', { name: 'Konfirmasi klaim' }).click();
    await expect(adminPage.getByRole('button', { name: 'Apply' })).toBeVisible();

    await adminPage.getByRole('button', { name: 'Apply' }).click();
    await adminPage
      .getByRole('textbox', { name: 'Resolusi' })
      .fill('Perubahan nama sesuai bukti faktual dan diterapkan setelah review.');
    await expectNoSeriousAxeViolations(adminPage);
    await adminPage.getByRole('button', { name: 'Konfirmasi apply' }).click();
    await expect(adminPage.getByText('Review selesai')).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: 'Place change history' })).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: 'Audit summary' })).toBeVisible();

    const [historyRows] = await databasePool.execute<CountRow[]>(
      `SELECT COUNT(*) AS count FROM place_change_history
       WHERE source_type = 'REPORT' AND source_id = ?`,
      [reportId],
    );
    expect(Number(historyRows[0]?.count ?? 0)).toBe(1);
    const [auditRows] = await databasePool.execute<CountRow[]>(
      `SELECT COUNT(*) AS count FROM audit_logs
       WHERE target_type = 'REPORT' AND target_id = ?`,
      [reportId],
    );
    expect(Number(auditRows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);

    await adminPage.goto(`${adminBaseUrl}/reports/${rejectedReportId}`);
    await adminPage.getByRole('button', { name: 'Ambil review' }).click();
    await adminPage.getByRole('button', { name: 'Konfirmasi klaim' }).click();
    await expect(adminPage.getByRole('button', { name: 'Reject' })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Reject' }).click();
    await adminPage
      .getByRole('textbox', { name: 'Resolusi' })
      .fill('Bukti belum cukup untuk mengubah deskripsi publik.');
    await adminPage.getByRole('button', { name: 'Konfirmasi reject' }).click();
    await expect(adminPage.getByText('Review selesai')).toBeVisible();
  } finally {
    await adminContext.close();
  }

  await page.goto(`/reports/${rejectedReportId}`);
  await expect(page.getByRole('heading', { name: 'Tidak diterapkan' })).toBeVisible();
  await expect(page.getByText('Bukti belum cukup untuk mengubah deskripsi publik.')).toBeVisible();

  await page.goto(`/places/${fixtureSlug}`);
  await expect(page.getByRole('heading', { name: appliedPlaceName })).toBeVisible();
  await page.getByRole('button', { name: 'Informasi masih akurat' }).click();
  await page.getByRole('button', { name: 'Simpan konfirmasi' }).click();
  await expect(page.getByText('Konfirmasi tersimpan')).toBeVisible();
  const [confirmationRows] = await databasePool.execute<CountRow[]>(
    'SELECT COUNT(*) AS count FROM place_confirmations WHERE place_id = ?',
    [fixturePlaceId],
  );
  expect(Number(confirmationRows[0]?.count ?? 0)).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Informasi masih akurat' }).click();
  await page.getByRole('button', { name: 'Simpan konfirmasi' }).click();
  await expect(page.getByText('Konfirmasi belum tersimpan')).toBeVisible();
  const [confirmationRowsAfterRetry] = await databasePool.execute<CountRow[]>(
    'SELECT COUNT(*) AS count FROM place_confirmations WHERE place_id = ?',
    [fixturePlaceId],
  );
  expect(Number(confirmationRowsAfterRetry[0]?.count ?? 0)).toBe(1);

  await page.goto('/activity');
  await page.getByLabel('Jenis').selectOption('CONFIRMATION');
  await expect(page.getByText('Konfirmasi komunitas')).toBeVisible();
  await expect(page.getByText(appliedPlaceName)).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});
