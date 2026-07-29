import { randomBytes } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { expect, type APIRequestContext, test } from '@playwright/test';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

const adminBaseUrl = 'http://localhost:3101';
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

interface UserRow extends RowDataPacket {
  readonly id: string;
}

let databasePool: Pool | undefined;
let fixtureContributionId: string | undefined;
let fixtureEmail: string | undefined;
let fixturePlaceId: string | undefined;

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

test.describe.configure({ timeout: 90_000 });

test.beforeAll(() => {
  loadWorkspaceEnvironment(process.cwd());
  databasePool = createPool(process.env.DATABASE_URL ?? '');
});

test.afterAll(async () => {
  if (databasePool && fixtureContributionId) {
    const [rows] = await databasePool.execute<
      (RowDataPacket & { readonly merged_place_id: string | null })[]
    >('SELECT merged_place_id FROM contributions WHERE id = ?', [fixtureContributionId]);
    fixturePlaceId = rows[0]?.merged_place_id ?? fixturePlaceId;
    await databasePool.execute(
      "DELETE FROM idempotency_keys WHERE scope LIKE CONCAT('%', ?, '%')",
      [fixtureContributionId],
    );
    await databasePool.execute('DELETE FROM moderation_events WHERE contribution_id = ?', [
      fixtureContributionId,
    ]);
    await databasePool.execute('DELETE FROM contributions WHERE id = ?', [fixtureContributionId]);
  }
  if (databasePool && fixturePlaceId) {
    await databasePool.execute('DELETE FROM audit_logs WHERE target_id = ?', [fixturePlaceId]);
    await databasePool.execute('DELETE FROM place_change_history WHERE place_id = ?', [
      fixturePlaceId,
    ]);
    await databasePool.execute('DELETE FROM operating_hours WHERE place_id = ?', [fixturePlaceId]);
    await databasePool.execute('DELETE FROM place_facilities WHERE place_id = ?', [fixturePlaceId]);
    await databasePool.execute('DELETE FROM place_categories WHERE place_id = ?', [fixturePlaceId]);
    await databasePool.execute('DELETE FROM menus WHERE place_id = ?', [fixturePlaceId]);
    await databasePool.execute('DELETE FROM places WHERE id = ?', [fixturePlaceId]);
  }
  if (databasePool && fixtureEmail) {
    await databasePool.execute('DELETE FROM users WHERE normalized_email = ?', [
      fixtureEmail.toLowerCase(),
    ]);
  }
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
  throw new Error('No admin magic-link message was delivered.');
}

test('@admin-core administrator reviews and publishes a contribution with accessible dialogs', async ({
  context,
  page,
  request,
}) => {
  if (!databasePool) throw new Error('E2E database is not initialized');
  fixtureEmail = `e2e-admin-${Date.now()}@example.test`;
  await page.goto(`${adminBaseUrl}/login`);
  await page.getByRole('textbox', { name: /^Email administrator/ }).fill(fixtureEmail);
  await page.getByRole('button', { name: 'Kirim tautan masuk' }).click();
  await expect(page.getByText(/Jika alamat tersebut terdaftar/)).toBeVisible();
  await databasePool.execute(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT u.id, r.id
     FROM users u
     JOIN roles r ON r.code = 'ADMIN'
     WHERE u.normalized_email = ?
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [fixtureEmail.toLowerCase()],
  );
  await page.goto(`${adminBaseUrl}/auth/verify?token=${await magicToken(request, fixtureEmail)}`);
  await expect(page).toHaveURL(`${adminBaseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Dashboard moderasi' })).toBeVisible();
  const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
  await dashboardLink.focus();
  await expect(dashboardLink).toBeFocused();
  expect(await dashboardLink.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
    'none',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  const [users] = await databasePool.execute<UserRow[]>(
    'SELECT id FROM users WHERE normalized_email = ? LIMIT 1',
    [fixtureEmail.toLowerCase()],
  );
  const adminId = users[0]?.id;
  if (!adminId) throw new Error('E2E admin user was not persisted');
  fixtureContributionId = createFixtureUlid();
  const payload = {
    address: 'Jl. Browser E2E No. 8',
    category: 'MAKAN_MURAH',
    facilities: [{ code: 'PARKING', status: 'AVAILABLE' }],
    mainMenu: { name: 'Nasi telur E2E', priceAmount: 14_000 },
    operatingHours: [],
    placeName: `Warung Browser ${fixtureContributionId.slice(-6)}`,
  };
  await databasePool.execute(
    `INSERT INTO contributions (
       id, submitted_by, source, contribution_status, submitted_at, version
     ) VALUES (?, ?, 'APPLICATION', 'PENDING', CURRENT_TIMESTAMP(3), 1)`,
    [fixtureContributionId, adminId],
  );
  await databasePool.execute(
    `INSERT INTO contribution_payloads (contribution_id, schema_version, payload)
     VALUES (?, 1, ?)`,
    [fixtureContributionId, JSON.stringify(payload)],
  );

  await page.reload();
  await page.getByRole('link', { name: 'Buka antrean' }).click();
  await page.getByRole('link', { name: 'Tinjau' }).first().click();
  await expect(page.getByRole('heading', { name: payload.placeName })).toBeVisible();

  await page.getByRole('button', { name: 'Ambil review' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ambil review' })).toBeFocused();
  await page.getByRole('button', { name: 'Ambil review' }).click();
  await page.getByRole('button', { name: 'Konfirmasi klaim' }).click();
  await expect(page.getByRole('button', { name: 'Setujui' })).toBeVisible();

  await page.getByRole('button', { name: 'Setujui' }).click();
  await page.getByRole('spinbutton', { name: 'Latitude' }).fill('-6.1468');
  await page.getByRole('spinbutton', { name: 'Longitude' }).fill('106.8061');
  await page.getByRole('textbox', { name: 'Kecamatan' }).fill('Tambora');
  await page.getByRole('textbox', { name: 'Kota/kabupaten' }).fill('Jakarta Barat');
  await page.getByRole('textbox', { name: 'Provinsi' }).fill('DKI Jakarta');
  await page.getByRole('textbox', { name: 'Kode pos' }).fill('11220');
  await page.getByRole('button', { name: 'Verifikasi dan setujui' }).click();
  await expect(page.getByRole('button', { name: 'Publikasikan' })).toBeVisible();

  await page.getByRole('button', { name: 'Publikasikan' }).click();
  await expect(page.getByText('Tindakan berdampak publik')).toBeVisible();
  await page.getByRole('button', { name: 'Ya, publikasikan' }).click();
  await expect(page.getByText('Dipublikasikan')).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(`${adminBaseUrl}/login`);
  await expect
    .poll(async () =>
      (await context.cookies(adminBaseUrl)).some((cookie) => cookie.name === 'pitstop_session'),
    )
    .toBe(false);
  await page.goto(`${adminBaseUrl}/`);
  await expect(page).toHaveURL(`${adminBaseUrl}/login`);
});
