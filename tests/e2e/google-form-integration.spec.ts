import { createHmac } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import { canonicalIntegrationSignatureMessage } from '@pitstop/validation';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

const adminBaseUrl = 'http://localhost:3101';
const apiBaseUrl = 'http://localhost:3102/api/v1';
const mailpitBaseUrl = 'http://127.0.0.1:8025';
const sourceId = 'google-form-main';
const keyId = 'e2e-v1';
const signingSecret = 'e2e-google-form-secret-material-0123456789';

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

interface InboxRow extends RowDataPacket {
  readonly contribution_id: string | null;
  readonly duplicate_detection_status: string;
  readonly geocoding_status: string;
  readonly id: string;
  readonly processing_status: string;
}

let databasePool: Pool | undefined;
const externalIds: string[] = [];
const fixtureEmails: string[] = [];

test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  loadWorkspaceEnvironment(process.cwd());
  databasePool = createPool(process.env.DATABASE_URL ?? '');
});

test.afterAll(async () => {
  if (!databasePool) return;
  const [inboxes] = await databasePool.query<
    (RowDataPacket & { readonly contribution_id: string | null; readonly id: string })[]
  >(
    `SELECT id, contribution_id
     FROM google_form_submissions
     WHERE external_submission_id IN (?)`,
    [externalIds.length > 0 ? externalIds : ['no-phase9-fixtures']],
  );
  const contributionIds = inboxes.flatMap((row) =>
    row.contribution_id ? [row.contribution_id] : [],
  );
  for (const row of inboxes) {
    await databasePool.execute(
      'DELETE FROM duplicate_place_hints WHERE google_form_submission_id = ?',
      [row.id],
    );
  }
  for (const contributionId of contributionIds) {
    await databasePool.execute('DELETE FROM geocoding_results WHERE contribution_id = ?', [
      contributionId,
    ]);
  }
  if (externalIds.length > 0) {
    await databasePool.query(
      'DELETE FROM google_form_submissions WHERE external_submission_id IN (?)',
      [externalIds],
    );
  }
  for (const contributionId of contributionIds) {
    await databasePool.execute('DELETE FROM moderation_events WHERE contribution_id = ?', [
      contributionId,
    ]);
    await databasePool.execute('DELETE FROM contribution_payloads WHERE contribution_id = ?', [
      contributionId,
    ]);
    await databasePool.execute('DELETE FROM contributions WHERE id = ?', [contributionId]);
  }
  for (const email of fixtureEmails) {
    await databasePool.execute('DELETE FROM users WHERE normalized_email = ?', [
      email.toLowerCase(),
    ]);
  }
  await databasePool.end();
});

test('@admin-core signed Form ingestion reaches moderation idempotently and accessibly', async ({
  page,
  request,
}) => {
  const pool = getPool();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const mainExternalId = `e2e-form-${suffix}`;
  const lowExternalId = `e2e-low-${suffix}`;
  const invalidExternalId = `e2e-invalid-${suffix}`;
  externalIds.push(mainExternalId, lowExternalId, invalidExternalId);

  const mainBody = formBody({
    address: 'Jl. Krendang Raya No. 8',
    mapUrl: 'https://www.google.com/maps/place/X/@-6.1468,106.8061,17z',
    placeName: 'Warung Bu Ani',
    submitterEmail: 'phase9.driver@example.test',
  });
  const accepted = await signedSubmission(request, mainExternalId, mainBody);
  expect(accepted.status()).toBe(202);
  const acceptedPayload = (await accepted.json()) as {
    readonly data: { readonly duplicate: boolean; readonly inboxId: string };
  };
  expect(acceptedPayload.data.duplicate).toBe(false);

  const duplicate = await signedSubmission(request, mainExternalId, mainBody);
  expect(duplicate.status()).toBe(202);
  expect(
    ((await duplicate.json()) as { readonly data: { readonly duplicate: boolean } }).data.duplicate,
  ).toBe(true);

  const invalid = await signedSubmission(request, invalidExternalId, formBody(), '0'.repeat(64));
  expect(invalid.status()).toBe(401);
  expect(
    await scalarCount(
      'SELECT COUNT(*) AS count FROM google_form_submissions WHERE external_submission_id = ?',
      [invalidExternalId],
    ),
  ).toBe(0);

  const lowBody = formBody({
    address: 'Jl. Pin Tidak Pasti [low-confidence]',
    category: 'TOILET',
    cheapestMenuName: undefined,
    cheapestMenuPrice: undefined,
    maximumUsefulBudget: undefined,
    placeName: 'Toilet Confidence Rendah',
  });
  expect((await signedSubmission(request, lowExternalId, lowBody)).status()).toBe(202);

  await expect
    .poll(() => inboxByExternalId(mainExternalId), { timeout: 45_000 })
    .toMatchObject({
      duplicate_detection_status: 'SUCCEEDED',
      geocoding_status: 'SUCCEEDED',
      processing_status: 'COMPLETED',
    });
  await expect
    .poll(() => inboxByExternalId(lowExternalId), { timeout: 45_000 })
    .toMatchObject({
      duplicate_detection_status: 'SKIPPED',
      geocoding_status: 'LOW_CONFIDENCE',
      processing_status: 'COMPLETED',
    });

  const mainInbox = await inboxByExternalId(mainExternalId);
  const lowInbox = await inboxByExternalId(lowExternalId);
  expect(mainInbox?.contribution_id).toEqual(expect.any(String));
  expect(lowInbox?.contribution_id).toEqual(expect.any(String));
  expect(
    await scalarCount(
      `SELECT COUNT(*) AS count
       FROM contributions c
       JOIN google_form_submissions g ON g.contribution_id = c.id
       WHERE g.external_submission_id = ?
         AND c.source = 'GOOGLE_FORM'
         AND c.contribution_status = 'PENDING'
         AND c.submitted_by IS NULL`,
      [mainExternalId],
    ),
  ).toBe(1);
  expect(
    await scalarCount(
      `SELECT COUNT(*) AS count
       FROM places p
       JOIN contributions c ON c.merged_place_id = p.id
       WHERE c.id = ?`,
      [lowInbox?.contribution_id ?? ''],
    ),
  ).toBe(0);

  const adminEmail = `phase9-admin-${suffix}@example.test`;
  fixtureEmails.push(adminEmail);
  await signIn(page, request, adminEmail, true);
  await page.goto(`${adminBaseUrl}/integrations/google-form`);
  await expect(page.getByRole('heading', { name: 'Sinkronisasi Google Form' })).toBeVisible();
  await expect(page.getByText(mainExternalId)).toBeVisible();
  await expect(page.getByText('COMPLETED').first()).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);

  await page.goto(`${adminBaseUrl}/contributions`);
  await expect(page.getByText('Warung Bu Ani').first()).toBeVisible();
  await page.goto(`${adminBaseUrl}/contributions/${mainInbox?.contribution_id ?? ''}`);
  await expect(page.getByRole('heading', { name: 'Warung Bu Ani' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kandidat duplikat' })).toBeVisible();

  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(`${adminBaseUrl}/login`);
  await expect
    .poll(async () =>
      (await page.context().cookies(adminBaseUrl)).some(
        (cookie) => cookie.name === 'pitstop_session',
      ),
    )
    .toBe(false);
  const userEmail = `phase9-user-${suffix}@example.test`;
  fixtureEmails.push(userEmail);
  await signIn(page, request, userEmail, false);
  await page.goto(`${adminBaseUrl}/integrations/google-form`);
  await expect(page.getByRole('heading', { name: 'Akses admin diperlukan' })).toBeVisible();

  expect(
    await scalarCount(
      `SELECT COUNT(*) AS count
       FROM contributions c
       JOIN google_form_submissions g ON g.contribution_id = c.id
       WHERE g.external_submission_id = ?`,
      [mainExternalId],
    ),
  ).toBe(1);

  async function scalarCount(queryText: string, values: readonly string[]): Promise<number> {
    const [rows] = await pool.execute<(RowDataPacket & { readonly count: number })[]>(queryText, [
      ...values,
    ]);
    return Number(rows[0]?.count ?? 0);
  }
});

function formBody(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const payload = {
    address: 'Jl. Phase 9 E2E',
    area: 'Tambora',
    category: 'MAKAN_MURAH',
    cheapestMenuName: 'Nasi telur',
    cheapestMenuPrice: 12_000,
    maximumUsefulBudget: 15_000,
    placeName: 'Warung Phase 9 E2E',
    ...overrides,
  };
  return {
    payload: Object.fromEntries(Object.entries(payload).filter((entry) => entry[1] !== undefined)),
    schemaVersion: 1,
    submittedAt: new Date().toISOString(),
  };
}

async function signedSubmission(
  request: APIRequestContext,
  externalSubmissionId: string,
  body: unknown,
  forcedSignature?: string,
) {
  const timestamp = new Date().toISOString();
  const signature =
    forcedSignature ??
    createHmac('sha256', signingSecret)
      .update(
        canonicalIntegrationSignatureMessage({
          body,
          externalSubmissionId,
          sourceId,
          timestamp,
        }),
      )
      .digest('hex');
  return request.post(`${apiBaseUrl}/integrations/google-form/submissions`, {
    data: body,
    headers: {
      'X-PitStop-Key-Id': keyId,
      'X-PitStop-Signature': signature,
      'X-PitStop-Source': sourceId,
      'X-PitStop-Submission-Id': externalSubmissionId,
      'X-PitStop-Timestamp': timestamp,
    },
  });
}

async function inboxByExternalId(externalSubmissionId: string): Promise<InboxRow | undefined> {
  const [rows] = await getPool().execute<InboxRow[]>(
    `SELECT id, contribution_id, processing_status, geocoding_status,
       duplicate_detection_status
     FROM google_form_submissions
     WHERE external_submission_id = ?
     LIMIT 1`,
    [externalSubmissionId],
  );
  return rows[0];
}

async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  makeAdmin: boolean,
): Promise<void> {
  await page.goto(`${adminBaseUrl}/login`);
  await page.getByRole('textbox', { name: /^Email administrator/ }).fill(email);
  await page.getByRole('button', { name: 'Kirim tautan masuk' }).click();
  await expect(page.getByText(/Jika alamat tersebut terdaftar/)).toBeVisible();
  if (makeAdmin) {
    await getPool().execute(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id
       FROM users u
       JOIN roles r ON r.code = 'ADMIN'
       WHERE u.normalized_email = ?
       ON DUPLICATE KEY UPDATE assigned_at = assigned_at`,
      [email.toLowerCase()],
    );
  }
  await page.goto(`${adminBaseUrl}/auth/verify?token=${await magicToken(request, email)}`);
  await expect(page).toHaveURL(makeAdmin ? `${adminBaseUrl}/` : `${adminBaseUrl}/`);
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
  throw new Error('No Phase 9 magic-link message was delivered.');
}

function getPool(): Pool {
  if (!databasePool) throw new Error('Phase 9 E2E database is not initialized.');
  return databasePool;
}
