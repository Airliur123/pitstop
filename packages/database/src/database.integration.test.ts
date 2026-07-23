import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUlid, type Ulid } from './identifiers';
import { geocodingResults } from './schema';
import { seedDatabase } from './seed';
import { findPlacesWithinRadius } from './spatial';
import {
  applyReportTransaction,
  approveContributionTransaction,
  revokeRefreshTokenFamilyTransaction,
} from './transactions';

interface CountRow extends RowDataPacket {
  readonly count: number;
}

interface IdRow extends RowDataPacket {
  readonly id: string;
}

interface StringRow extends RowDataPacket {
  readonly value: string;
}

interface NumberRow extends RowDataPacket {
  readonly value: number;
}

const expectedTables = [
  'audit_logs',
  'auth_accounts',
  'categories',
  'contribution_payloads',
  'contribution_photos',
  'contributions',
  'facilities',
  'geocoding_results',
  'google_form_submissions',
  'idempotency_keys',
  'integration_sources',
  'menus',
  'moderation_reviews',
  'operating_hour_exceptions',
  'operating_hours',
  'place_categories',
  'place_change_history',
  'place_confirmations',
  'place_facilities',
  'place_photos',
  'place_reports',
  'places',
  'refresh_tokens',
  'report_evidence',
  'roles',
  'user_roles',
  'users',
] as const;

describe.sequential('MySQL 8.4 spatial database', () => {
  let container: StartedTestContainer | undefined;
  let pool: Pool | undefined;

  const getPool = (): Pool => {
    if (!pool) throw new Error('Integration test pool is not initialized');
    return pool;
  };

  beforeAll(async () => {
    container = await new GenericContainer('mysql:8.4.10')
      .withEnvironment({
        MYSQL_DATABASE: 'pitstop_test',
        MYSQL_PASSWORD: 'pitstop_test',
        MYSQL_ROOT_PASSWORD: 'pitstop_root_test',
        MYSQL_USER: 'pitstop_test',
        TZ: 'UTC',
      })
      .withCommand([
        '--character-set-server=utf8mb4',
        '--collation-server=utf8mb4_0900_ai_ci',
        '--default-time-zone=+00:00',
      ])
      .withExposedPorts(3306)
      .withWaitStrategy(Wait.forLogMessage(/port: 3306.*MySQL Community Server/i))
      .withStartupTimeout(150_000)
      .start();

    pool = createPool({
      connectionLimit: 5,
      database: 'pitstop_test',
      host: container.getHost(),
      password: 'pitstop_test',
      port: container.getMappedPort(3306),
      user: 'pitstop_test',
    });
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    await seedDatabase(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('1. migrates an empty MySQL database', async () => {
    expect(
      await countRows(getPool(), 'information_schema.tables', 'table_schema = DATABASE()'),
    ).toBe(28);
  });

  it('2. runs migration again without schema drift', async () => {
    await migrate(drizzle({ client: getPool() }), {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    const [rows] = await getPool().query<CountRow[]>(
      'SELECT COUNT(*) AS count FROM __drizzle_migrations',
    );
    expect(Number(rows[0]?.count)).toBe(5);
  });

  it('3. creates every required domain table', async () => {
    const [rows] = await getPool().query<RowDataPacket[]>('SHOW TABLES');
    const tables = rows.map((row) => String(Object.values(row)[0])).sort();
    expect(tables.filter((name) => name !== '__drizzle_migrations')).toEqual([...expectedTables]);
  });

  it('4. enforces foreign keys', async () => {
    await expect(
      getPool().execute(
        `INSERT INTO menus (id, place_id, name, price_amount, is_main_item, is_available)
         VALUES (?, ?, 'Invalid parent', 1000, true, true)`,
        [createUlid(), createUlid()],
      ),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('5. enforces normalized email uniqueness for active users', async () => {
    const firstUser = await insertUser(getPool(), 'Case@Example.test');
    await expect(insertUser(getPool(), 'case@example.test')).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
    await getPool().execute('UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [
      firstUser,
    ]);
    await expect(insertUser(getPool(), 'case@example.test')).resolves.toBeDefined();
  });

  it('6. enforces unique provider accounts', async () => {
    const userId = await insertUser(getPool(), uniqueEmail('provider'));
    await getPool().execute(
      `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id)
       VALUES (?, ?, 'GOOGLE', 'provider-account')`,
      [createUlid(), userId],
    );
    await expect(
      getPool().execute(
        `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id)
         VALUES (?, ?, 'GOOGLE', 'provider-account')`,
        [createUlid(), userId],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('7. enforces Google Form submission idempotency', async () => {
    const sourceId = await idByCode(getPool(), 'integration_sources', 'GOOGLE_FORM');
    const externalId = `submission-${createUlid()}`;
    await insertGoogleSubmission(getPool(), sourceId, externalId);
    await expect(insertGoogleSubmission(getPool(), sourceId, externalId)).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
  });

  it('8. enforces one active place confirmation per user and place', async () => {
    const userId = await insertUser(getPool(), uniqueEmail('confirmation'));
    const placeId = await seededPlaceId(getPool(), 'data-simulasi-warung-bu-ani');
    await getPool().execute(
      `INSERT INTO place_confirmations (id, place_id, user_id, confirmation_type)
       VALUES (?, ?, ?, 'STILL_VALID')`,
      [createUlid(), placeId, userId],
    );
    await expect(
      getPool().execute(
        `INSERT INTO place_confirmations (id, place_id, user_id, confirmation_type)
         VALUES (?, ?, ?, 'PRICE_ACCURATE')`,
        [createUlid(), placeId, userId],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('9. soft deletes places without removing the physical row', async () => {
    const placeId = await seededPlaceId(getPool(), 'data-simulasi-warung-bu-ani');
    await getPool().execute('UPDATE places SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [
      placeId,
    ]);
    expect(
      await scalarCount(getPool(), 'SELECT COUNT(*) AS count FROM places WHERE id = ?', [placeId]),
    ).toBe(1);
    await getPool().execute('UPDATE places SET deleted_at = NULL WHERE id = ?', [placeId]);
  });

  it('10. rejects negative menu prices', async () => {
    const placeId = await seededPlaceId(getPool(), 'data-simulasi-warung-bu-ani');
    await expect(
      getPool().execute(
        `INSERT INTO menus (id, place_id, name, price_amount, is_main_item, is_available)
         VALUES (?, ?, ?, -1, true, true)`,
        [createUlid(), placeId, `Negative ${createUlid()}`],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  it('11. stores place points with SRID 4326', async () => {
    const [rows] = await getPool().query<NumberRow[]>(
      'SELECT DISTINCT ST_SRID(location) AS value FROM places',
    );
    expect(rows.map((row) => Number(row.value))).toEqual([4326]);
  });

  it('12. creates a real spatial index', async () => {
    const [rows] = await getPool().query<StringRow[]>(
      `SELECT INDEX_TYPE AS value FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'places'
         AND index_name = 'idx_places_location'`,
    );
    expect(rows[0]?.value).toBe('SPATIAL');
  });

  it('13. preserves longitude and latitude order at the application boundary', async () => {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ST_Longitude(location) AS longitude, ST_Latitude(location) AS latitude,
         ST_AsText(location, 'axis-order=long-lat') AS wkt
       FROM places WHERE slug = ?`,
      ['data-simulasi-warung-bu-ani'],
    );
    expect(Number(rows[0]?.longitude)).toBeCloseTo(106.8061, 4);
    expect(Number(rows[0]?.latitude)).toBeCloseTo(-6.1468, 4);
    expect(rows[0]?.wkt).toBe('POINT(106.8061 -6.1468)');
  });

  it('14. calculates a plausible ST_Distance_Sphere distance', async () => {
    const [rows] = await getPool().execute<NumberRow[]>(
      `SELECT ST_Distance_Sphere(
         location, ST_SRID(POINT(?, ?), 4326)
       ) AS value FROM places WHERE slug = ?`,
      [106.8061, -6.1468, 'data-simulasi-warung-bu-ani'],
    );
    expect(Number(rows[0]?.value)).toBeLessThan(1);
  });

  it('15. returns only correct candidates within a 5 km radius', async () => {
    const results = await findPlacesWithinRadius(getPool(), {
      longitude: 106.8061,
      latitude: -6.1468,
      radiusMeters: 5_000,
    });
    expect(results.map(({ name }) => name)).toEqual(['Warung Bu Ani', 'Warkop Bang Udin']);
  });

  it('16. filters ACTIVE, ADMIN_VERIFIED, and soft-deleted rows', async () => {
    const results = await findPlacesWithinRadius(getPool(), {
      longitude: 106.8061,
      latitude: -6.1468,
      radiusMeters: 20_000,
    });
    const names = results.map(({ name }) => name);
    expect(names).not.toContain('Warteg Barokah');
    expect(names).not.toContain('Nasi Uduk Ibu Rini');
    expect(names).toContain('Warung Madura 24 Jam');
  });

  it('17. seeds five explicitly marked simulation places', async () => {
    expect(
      await scalarCount(
        getPool(),
        `SELECT COUNT(*) AS count FROM places
         WHERE slug LIKE 'data-simulasi-%' AND description LIKE 'Data Simulasi%'`,
      ),
    ).toBe(5);
  });

  it('18. reruns seed without duplication', async () => {
    await seedDatabase(getPool());
    expect(
      await scalarCount(
        getPool(),
        "SELECT COUNT(*) AS count FROM places WHERE slug LIKE 'data-simulasi-%'",
      ),
    ).toBe(5);
    expect(
      await scalarCount(
        getPool(),
        `SELECT COUNT(*) AS count FROM menus m
         JOIN places p ON p.id = m.place_id WHERE p.slug LIKE 'data-simulasi-%'`,
      ),
    ).toBe(5);
  });

  it('19. supports multiple operating intervals per day', async () => {
    expect(
      await scalarCount(
        getPool(),
        `SELECT COUNT(*) AS count FROM operating_hours h
         JOIN places p ON p.id = h.place_id
         WHERE p.slug = 'data-simulasi-warung-bu-ani' AND h.day_of_week = 0`,
      ),
    ).toBe(2);
  });

  it('20. stores overnight schedules without invalidating them', async () => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT h.opens_at, h.closes_at FROM operating_hours h
       JOIN places p ON p.id = h.place_id
       WHERE p.slug = 'data-simulasi-warkop-bang-udin' LIMIT 1`,
    );
    expect(rows[0]?.opens_at).toBe('17:00:00');
    expect(rows[0]?.closes_at).toBe('01:00:00');
  });

  it('21. approves a contribution with all atomic related changes', async () => {
    const adminId = await insertUser(getPool(), uniqueEmail('approval-admin'));
    const contributionId = await insertContribution(getPool(), adminId);
    const categoryId = (await idByCode(getPool(), 'categories', 'MAKAN_MURAH')) as Ulid;
    const facilityId = (await idByCode(getPool(), 'facilities', 'TOILET')) as Ulid;
    const placeId = createUlid();
    await approveContributionTransaction(getPool(), {
      actorUserId: adminId,
      contributionId,
      reason: 'Integration approval',
      requestId: `request-${createUlid()}`,
      place: approvalPlace(placeId, categoryId, facilityId, 'approved-transaction-place'),
    });
    expect(
      await scalarCount(getPool(), 'SELECT COUNT(*) AS count FROM places WHERE id = ?', [placeId]),
    ).toBe(1);
    expect(
      await scalarCount(getPool(), 'SELECT COUNT(*) AS count FROM menus WHERE place_id = ?', [
        placeId,
      ]),
    ).toBe(1);
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM place_facilities WHERE place_id = ?',
        [placeId],
      ),
    ).toBe(1);
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM operating_hours WHERE place_id = ?',
        [placeId],
      ),
    ).toBe(1);
    expect(await statusOf(getPool(), 'contributions', 'contribution_status', contributionId)).toBe(
      'APPROVED',
    );
    expect(
      await scalarCount(getPool(), 'SELECT COUNT(*) AS count FROM audit_logs WHERE target_id = ?', [
        placeId,
      ]),
    ).toBe(1);
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM place_change_history WHERE place_id = ?',
        [placeId],
      ),
    ).toBe(1);
  });

  it('22. rolls back every approval step when a related insert fails', async () => {
    const adminId = await insertUser(getPool(), uniqueEmail('rollback-admin'));
    const contributionId = await insertContribution(getPool(), adminId);
    const categoryId = (await idByCode(getPool(), 'categories', 'MAKAN_MURAH')) as Ulid;
    const placeId = createUlid();
    const input = approvalPlace(placeId, categoryId, createUlid(), 'rolled-back-place');
    await expect(
      approveContributionTransaction(getPool(), {
        actorUserId: adminId,
        contributionId,
        reason: 'Must roll back',
        requestId: `request-${createUlid()}`,
        place: input,
      }),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    expect(
      await scalarCount(getPool(), 'SELECT COUNT(*) AS count FROM places WHERE id = ?', [placeId]),
    ).toBe(0);
    expect(await statusOf(getPool(), 'contributions', 'contribution_status', contributionId)).toBe(
      'PENDING',
    );
  });

  it('23. rolls back place changes when applying a report fails', async () => {
    const reporterId = await insertUser(getPool(), uniqueEmail('reporter'));
    const placeId = await seededPlaceId(getPool(), 'data-simulasi-warung-bu-ani');
    const versionBefore = await placeVersion(getPool(), placeId);
    const reportId = createUlid();
    await getPool().execute(
      `INSERT INTO place_reports (
         id, place_id, reported_by, report_type, description, report_status
       ) VALUES (?, ?, ?, 'PRICE_CHANGED', 'Integration report', 'PENDING')`,
      [reportId, placeId, reporterId],
    );
    await expect(
      applyReportTransaction(getPool(), {
        expectedPlaceVersion: versionBefore,
        name: 'Name that must roll back',
        reason: 'Invalid reviewer triggers rollback',
        reportId,
        requestId: `request-${createUlid()}`,
        reviewerId: createUlid(),
      }),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    expect(await placeVersion(getPool(), placeId)).toBe(versionBefore);
    expect(await statusOf(getPool(), 'place_reports', 'report_status', reportId)).toBe('PENDING');
  });

  it('24. revokes every token in a refresh-token family atomically', async () => {
    const userId = await insertUser(getPool(), uniqueEmail('refresh'));
    const familyId = createUlid();
    for (let index = 0; index < 2; index += 1) {
      await getPool().execute(
        `INSERT INTO refresh_tokens (
           id, user_id, token_hash, token_family_id, expires_at
         ) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY))`,
        [createUlid(), userId, `${String(index).padStart(64, '0')}`, familyId],
      );
    }
    expect(
      await revokeRefreshTokenFamilyTransaction(getPool(), { tokenFamilyId: familyId, userId }),
    ).toBe(2);
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM refresh_tokens WHERE token_family_id = ? AND revoked_at IS NOT NULL',
        [familyId],
      ),
    ).toBe(2);
  });

  it('25. detects optimistic version conflicts', async () => {
    const reporterId = await insertUser(getPool(), uniqueEmail('optimistic'));
    const placeId = await seededPlaceId(getPool(), 'data-simulasi-warkop-bang-udin');
    const reportId = createUlid();
    await getPool().execute(
      `INSERT INTO place_reports (
         id, place_id, reported_by, report_type, description, report_status
       ) VALUES (?, ?, ?, 'HOURS_CHANGED', 'Optimistic conflict', 'PENDING')`,
      [reportId, placeId, reporterId],
    );
    await expect(
      applyReportTransaction(getPool(), {
        expectedPlaceVersion: 999_999,
        name: 'Must not apply',
        reason: 'Conflict test',
        reportId,
        requestId: `request-${createUlid()}`,
        reviewerId: reporterId,
      }),
    ).rejects.toThrow('Optimistic place version conflict');
    expect(await statusOf(getPool(), 'place_reports', 'report_status', reportId)).toBe('PENDING');
  });

  it('26. maps typed spatial points through Drizzle without exposing mysql2 driver values', async () => {
    const database = drizzle({ client: getPool() });
    const resultId = createUlid();
    await database.insert(geocodingResults).values({
      id: resultId,
      placeId: await seededPlaceId(getPool(), 'data-simulasi-warung-bu-ani'),
      provider: 'integration-test',
      queryText: 'Typed POINT mapping',
      resultLocation: { longitude: 106.8123, latitude: -6.1512 },
      rawResponse: { source: 'integration-test' },
    });
    const [row] = await database
      .select({ location: geocodingResults.resultLocation })
      .from(geocodingResults)
      .where(eq(geocodingResults.id, resultId));
    expect(row?.location).toEqual({ longitude: 106.8123, latitude: -6.1512 });
  });

  it('27. enforces generated primary uniqueness across soft-delete and atomic replacement', async () => {
    const email = uniqueEmail('restore-conflict');
    const deletedUserId = await insertUser(getPool(), email);
    await getPool().execute('UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [
      deletedUserId,
    ]);
    await insertUser(getPool(), email);
    await expect(
      getPool().execute('UPDATE users SET deleted_at = NULL WHERE id = ?', [deletedUserId]),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    const placeId = await insertPlace(getPool(), `constraint-${createUlid()}`);
    const makanMurahId = await idByCode(getPool(), 'categories', 'MAKAN_MURAH');
    const ngopiId = await idByCode(getPool(), 'categories', 'NGOPI');
    const toiletId = await idByCode(getPool(), 'categories', 'TOILET');
    await getPool().execute(
      'INSERT INTO place_categories (place_id, category_id, is_primary) VALUES (?, ?, true), (?, ?, false)',
      [placeId, makanMurahId, placeId, ngopiId],
    );
    await expect(
      getPool().execute(
        'UPDATE place_categories SET is_primary = true WHERE place_id = ? AND category_id = ?',
        [placeId, ngopiId],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'UPDATE place_categories SET is_primary = false WHERE place_id = ?',
        [placeId],
      );
      await connection.execute(
        'UPDATE place_categories SET is_primary = true WHERE place_id = ? AND category_id = ?',
        [placeId, ngopiId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    await getPool().execute(
      'INSERT INTO place_categories (place_id, category_id, is_primary) VALUES (?, ?, false)',
      [placeId, toiletId],
    );
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM place_categories WHERE place_id = ? AND is_primary = true',
        [placeId],
      ),
    ).toBe(1);

    await insertPlacePhoto(getPool(), placeId, true);
    await expect(insertPlacePhoto(getPool(), placeId, true)).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
    await insertPlacePhoto(getPool(), placeId, false);
    await insertPlacePhoto(getPool(), placeId, false);
    expect(
      await scalarCount(
        getPool(),
        'SELECT COUNT(*) AS count FROM place_photos WHERE place_id = ? AND is_primary = true',
        [placeId],
      ),
    ).toBe(1);
  });

  it('28. enforces idempotency keys per scope without cross-scope collisions', async () => {
    const idempotencyKey = `key-${createUlid()}`;
    await insertIdempotencyKey(getPool(), 'place-write', idempotencyKey);
    await expect(
      insertIdempotencyKey(getPool(), 'place-write', idempotencyKey),
    ).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
    await expect(
      insertIdempotencyKey(getPool(), 'report-write', idempotencyKey),
    ).resolves.toBeUndefined();
  });
});

async function insertUser(pool: Pool, email: string): Promise<Ulid> {
  const id = createUlid();
  await pool.execute(
    `INSERT INTO users (id, email, normalized_email, display_name)
     VALUES (?, ?, ?, 'Integration User')`,
    [id, email, email.trim().toLowerCase()],
  );
  return id;
}

async function insertPlace(pool: Pool, slug: string): Promise<Ulid> {
  const id = createUlid();
  await pool.execute(
    `INSERT INTO places (
       id, name, slug, address, district, city, province, location,
       place_status, verification_status, data_freshness_at
     ) VALUES (?, 'Constraint Place', ?, 'Data Simulasi audit address', 'Tambora', 'Jakarta Barat',
       'DKI Jakarta', ST_SRID(POINT(?, ?), 4326), 'ACTIVE', 'ADMIN_VERIFIED', CURRENT_TIMESTAMP(3))`,
    [id, slug, 106.81, -6.15],
  );
  return id;
}

async function insertPlacePhoto(pool: Pool, placeId: Ulid, isPrimary: boolean): Promise<void> {
  await pool.execute(
    `INSERT INTO place_photos (
       id, place_id, object_key, mime_type, file_size, width, height, is_primary
     ) VALUES (?, ?, ?, 'image/jpeg', 1, 1, 1, ?)`,
    [createUlid(), placeId, `audit-photo-${createUlid()}.jpg`, isPrimary],
  );
}

async function insertIdempotencyKey(pool: Pool, scope: string, key: string): Promise<void> {
  await pool.execute(
    `INSERT INTO idempotency_keys (
       id, scope, idempotency_key, request_hash, expires_at
     ) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY))`,
    [createUlid(), scope, key, 'a'.repeat(64)],
  );
}

async function insertContribution(pool: Pool, userId: Ulid): Promise<Ulid> {
  const id = createUlid();
  await pool.execute(
    `INSERT INTO contributions (
       id, submitted_by, source, contribution_status, submitted_at
     ) VALUES (?, ?, 'ADMIN', 'PENDING', CURRENT_TIMESTAMP(3))`,
    [id, userId],
  );
  return id;
}

async function insertGoogleSubmission(pool: Pool, sourceId: string, externalId: string) {
  return pool.execute(
    `INSERT INTO google_form_submissions (
       id, integration_source_id, external_submission_id, payload,
       signature_version, received_at, processing_status
     ) VALUES (?, ?, ?, JSON_OBJECT('simulation', true), 1, CURRENT_TIMESTAMP(3), 'RECEIVED')`,
    [createUlid(), sourceId, externalId],
  );
}

async function idByCode(
  pool: Pool,
  table: 'categories' | 'facilities' | 'integration_sources',
  code: string,
): Promise<string> {
  const query =
    table === 'categories'
      ? 'SELECT id FROM categories WHERE code = ?'
      : table === 'facilities'
        ? 'SELECT id FROM facilities WHERE code = ?'
        : 'SELECT id FROM integration_sources WHERE code = ?';
  const [rows] = await pool.execute<IdRow[]>(query, [code]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Missing seeded code: ${code}`);
  return id;
}

async function seededPlaceId(pool: Pool, slug: string): Promise<Ulid> {
  const [rows] = await pool.execute<IdRow[]>('SELECT id FROM places WHERE slug = ?', [slug]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Missing seeded place: ${slug}`);
  return id as Ulid;
}

async function scalarCount(
  pool: Pool,
  query: string,
  values: readonly string[] = [],
): Promise<number> {
  const [rows] = await pool.execute<CountRow[]>(query, [...values]);
  return Number(rows[0]?.count ?? 0);
}

async function countRows(pool: Pool, table: string, condition: string): Promise<number> {
  if (table !== 'information_schema.tables' || condition !== 'table_schema = DATABASE()') {
    throw new Error('Unsupported countRows query');
  }
  return scalarCount(
    pool,
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
}

async function statusOf(
  pool: Pool,
  table: 'contributions' | 'place_reports',
  column: 'contribution_status' | 'report_status',
  id: Ulid,
): Promise<string> {
  const query =
    table === 'contributions' && column === 'contribution_status'
      ? 'SELECT contribution_status AS value FROM contributions WHERE id = ?'
      : 'SELECT report_status AS value FROM place_reports WHERE id = ?';
  const [rows] = await pool.execute<StringRow[]>(query, [id]);
  return String(rows[0]?.value);
}

async function placeVersion(pool: Pool, placeId: Ulid): Promise<number> {
  const [rows] = await pool.execute<NumberRow[]>(
    'SELECT version AS value FROM places WHERE id = ?',
    [placeId],
  );
  return Number(rows[0]?.value);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${createUlid().toLowerCase()}@example.test`;
}

function approvalPlace(placeId: Ulid, categoryId: Ulid, facilityId: Ulid, slug: string) {
  return {
    address: 'Alamat Data Simulasi',
    categoryId,
    city: 'Jakarta Barat',
    description: 'Data Simulasi - transaction integration test',
    district: 'Tambora',
    facilities: [{ facilityId, status: 'AVAILABLE' as const }],
    id: placeId,
    latitude: -6.146,
    longitude: 106.805,
    menu: {
      id: createUlid(),
      isAvailable: true,
      isMainItem: true,
      name: 'Menu utama transaksi',
      priceAmount: 10_000,
    },
    name: 'Data Simulasi Transaction Place',
    operatingHours: [
      {
        closesAt: '22:00:00',
        dayOfWeek: 1,
        id: createUlid(),
        is24Hours: false,
        opensAt: '08:00:00',
        sequence: 0,
      },
    ],
    placeStatus: 'ACTIVE' as const,
    postalCode: '00000',
    province: 'DKI Jakarta',
    slug,
    verificationStatus: 'ADMIN_VERIFIED' as const,
  };
}
