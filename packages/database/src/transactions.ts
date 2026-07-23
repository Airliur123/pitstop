import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { createUlid, type Ulid } from './identifiers';
import type { FacilityStatus, PlaceStatus, VerificationStatus } from './schema/enums';

interface ContributionLockRow extends RowDataPacket {
  readonly contribution_status: string;
  readonly target_place_id: string | null;
}

interface PlaceLockRow extends RowDataPacket {
  readonly id: string;
  readonly name: string;
  readonly place_status: PlaceStatus;
  readonly verification_status: VerificationStatus;
  readonly version: number;
}

interface ReportLockRow extends RowDataPacket {
  readonly place_id: string;
  readonly report_status: string;
}

interface CountRow extends RowDataPacket {
  readonly count: number;
}

export interface ApprovalMenuInput {
  readonly id: Ulid;
  readonly name: string;
  readonly description?: string;
  readonly priceAmount: number;
  readonly isMainItem: boolean;
  readonly isAvailable: boolean;
  readonly sortOrder?: number;
}

export interface ApprovalFacilityInput {
  readonly facilityId: Ulid;
  readonly status: FacilityStatus;
}

export interface ApprovalOperatingHourInput {
  readonly id: Ulid;
  readonly dayOfWeek: number;
  readonly sequence: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly is24Hours: boolean;
}

export interface ApprovalPlaceInput {
  readonly id: Ulid;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly address: string;
  readonly landmark?: string;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode?: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly placeStatus: PlaceStatus;
  readonly verificationStatus: VerificationStatus;
  readonly categoryId: Ulid;
  readonly menu: ApprovalMenuInput;
  readonly facilities: readonly ApprovalFacilityInput[];
  readonly operatingHours: readonly ApprovalOperatingHourInput[];
}

export interface ApproveContributionInput {
  readonly contributionId: Ulid;
  readonly actorUserId: Ulid;
  readonly requestId: string;
  readonly reason: string;
  readonly place: ApprovalPlaceInput;
}

export interface ApplyReportInput {
  readonly reportId: Ulid;
  readonly reviewerId: Ulid;
  readonly requestId: string;
  readonly reason: string;
  readonly expectedPlaceVersion: number;
  readonly name?: string;
  readonly placeStatus?: PlaceStatus;
  readonly verificationStatus?: VerificationStatus;
}

export interface RevokeRefreshTokenFamilyInput {
  readonly userId: Ulid;
  readonly tokenFamilyId: Ulid;
  readonly revokedAt?: Date;
}

export async function approveContributionTransaction(
  pool: Pool,
  input: ApproveContributionInput,
): Promise<Ulid> {
  return withTransaction(pool, async (connection) => {
    const [contributionRows] = await connection.execute<ContributionLockRow[]>(
      `SELECT contribution_status, target_place_id
       FROM contributions WHERE id = ? FOR UPDATE`,
      [input.contributionId],
    );
    const contribution = contributionRows[0];
    if (!contribution) throw new Error('Contribution not found');
    if (!['PENDING', 'IN_REVIEW'].includes(contribution.contribution_status)) {
      throw new Error(
        `Contribution status cannot be approved: ${contribution.contribution_status}`,
      );
    }

    const placeId = (contribution.target_place_id ?? input.place.id) as Ulid;
    const previousPlace = contribution.target_place_id
      ? await lockPlace(connection, contribution.target_place_id)
      : undefined;

    if (previousPlace) {
      await connection.execute(
        `UPDATE places SET name = ?, slug = ?, description = ?, address = ?, landmark = ?,
           district = ?, city = ?, province = ?, postal_code = ?,
           location = ST_SRID(POINT(?, ?), 4326), place_status = ?, verification_status = ?,
           verified_at = CURRENT_TIMESTAMP(3), verified_by = ?, data_freshness_at = CURRENT_TIMESTAMP(3),
           version = version + 1
         WHERE id = ?`,
        placeParameters(input.place, input.actorUserId, placeId, false),
      );
    } else {
      await connection.execute(
        `INSERT INTO places (
           id, name, slug, description, address, landmark, district, city, province, postal_code,
           location, place_status, verification_status, verified_at, verified_by, data_freshness_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SRID(POINT(?, ?), 4326), ?, ?,
           CURRENT_TIMESTAMP(3), ?, CURRENT_TIMESTAMP(3))`,
        placeParameters(input.place, input.actorUserId, placeId, true),
      );
    }

    await connection.execute('UPDATE place_categories SET is_primary = false WHERE place_id = ?', [
      placeId,
    ]);
    await connection.execute(
      `INSERT INTO place_categories (place_id, category_id, is_primary)
       VALUES (?, ?, true)
       ON DUPLICATE KEY UPDATE is_primary = true`,
      [placeId, input.place.categoryId],
    );
    await upsertApprovalMenu(connection, placeId, input.place.menu);
    for (const facility of input.place.facilities) {
      await connection.execute(
        `INSERT INTO place_facilities (place_id, facility_id, facility_status, confirmed_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE facility_status = VALUES(facility_status),
           confirmed_at = CURRENT_TIMESTAMP(3)`,
        [placeId, facility.facilityId, facility.status],
      );
    }
    for (const hours of input.place.operatingHours) {
      await connection.execute(
        `INSERT INTO operating_hours (
           id, place_id, day_of_week, sequence, opens_at, closes_at, is_24_hours
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE opens_at = VALUES(opens_at), closes_at = VALUES(closes_at),
           is_24_hours = VALUES(is_24_hours)`,
        [
          hours.id,
          placeId,
          hours.dayOfWeek,
          hours.sequence,
          hours.opensAt,
          hours.closesAt,
          hours.is24Hours,
        ],
      );
    }
    await assertMainItemRule(connection, placeId, input.place.categoryId);

    const nextValue = JSON.stringify({
      name: input.place.name,
      placeStatus: input.place.placeStatus,
      verificationStatus: input.place.verificationStatus,
    });
    await insertHistoryAndAudit(connection, {
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      reason: input.reason,
      placeId,
      sourceType: 'CONTRIBUTION',
      sourceId: input.contributionId,
      changeType: previousPlace ? 'PLACE_UPDATED' : 'PLACE_CREATED',
      previousValue: previousPlace ? JSON.stringify(previousPlace) : null,
      newValue: nextValue,
    });
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE contributions SET contribution_status = 'APPROVED', target_place_id = ?,
         reviewed_at = CURRENT_TIMESTAMP(3), version = version + 1
       WHERE id = ? AND contribution_status IN ('PENDING', 'IN_REVIEW')`,
      [placeId, input.contributionId],
    );
    if (result.affectedRows !== 1) throw new Error('Contribution approval conflict');
    return placeId;
  });
}

export async function applyReportTransaction(pool: Pool, input: ApplyReportInput): Promise<void> {
  await withTransaction(pool, async (connection) => {
    const [reportRows] = await connection.execute<ReportLockRow[]>(
      'SELECT place_id, report_status FROM place_reports WHERE id = ? FOR UPDATE',
      [input.reportId],
    );
    const report = reportRows[0];
    if (!report) throw new Error('Report not found');
    if (!['PENDING', 'IN_REVIEW'].includes(report.report_status)) {
      throw new Error(`Report status cannot be applied: ${report.report_status}`);
    }
    const previousPlace = await lockPlace(connection, report.place_id);
    if (!previousPlace) throw new Error('Report place not found');
    if (previousPlace.version !== input.expectedPlaceVersion) {
      throw new Error('Optimistic place version conflict');
    }

    const [updateResult] = await connection.execute<ResultSetHeader>(
      `UPDATE places SET name = COALESCE(?, name), place_status = COALESCE(?, place_status),
         verification_status = COALESCE(?, verification_status), data_freshness_at = CURRENT_TIMESTAMP(3),
         version = version + 1
       WHERE id = ? AND version = ?`,
      [
        input.name ?? null,
        input.placeStatus ?? null,
        input.verificationStatus ?? null,
        report.place_id,
        input.expectedPlaceVersion,
      ],
    );
    if (updateResult.affectedRows !== 1) throw new Error('Optimistic place version conflict');

    await insertHistoryAndAudit(connection, {
      actorUserId: input.reviewerId,
      requestId: input.requestId,
      reason: input.reason,
      placeId: report.place_id as Ulid,
      sourceType: 'REPORT',
      sourceId: input.reportId,
      changeType: 'REPORT_APPLIED',
      previousValue: JSON.stringify(previousPlace),
      newValue: JSON.stringify({
        name: input.name ?? previousPlace.name,
        placeStatus: input.placeStatus ?? previousPlace.place_status,
        verificationStatus: input.verificationStatus ?? previousPlace.verification_status,
      }),
    });
    const [reportResult] = await connection.execute<ResultSetHeader>(
      `UPDATE place_reports SET report_status = 'APPLIED', reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP(3), version = version + 1
       WHERE id = ? AND report_status IN ('PENDING', 'IN_REVIEW')`,
      [input.reviewerId, input.reportId],
    );
    if (reportResult.affectedRows !== 1) throw new Error('Report application conflict');
  });
}

export async function revokeRefreshTokenFamilyTransaction(
  pool: Pool,
  input: RevokeRefreshTokenFamilyInput,
): Promise<number> {
  return withTransaction(pool, async (connection) => {
    await connection.execute(
      `SELECT id FROM refresh_tokens
       WHERE user_id = ? AND token_family_id = ? FOR UPDATE`,
      [input.userId, input.tokenFamilyId],
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?)
       WHERE user_id = ? AND token_family_id = ? AND revoked_at IS NULL`,
      [input.revokedAt ?? new Date(), input.userId, input.tokenFamilyId],
    );
    return result.affectedRows;
  });
}

async function withTransaction<T>(pool: Pool, work: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function placeParameters(
  place: ApprovalPlaceInput,
  actorUserId: Ulid,
  placeId: Ulid,
  includeId: boolean,
): (string | number | null)[] {
  const values: (string | number | null)[] = [
    place.name,
    place.slug,
    place.description ?? null,
    place.address,
    place.landmark ?? null,
    place.district,
    place.city,
    place.province,
    place.postalCode ?? null,
    place.longitude,
    place.latitude,
    place.placeStatus,
    place.verificationStatus,
    actorUserId,
  ];
  return includeId ? [placeId, ...values] : [...values, placeId];
}

async function lockPlace(
  connection: PoolConnection,
  placeId: string,
): Promise<PlaceLockRow | undefined> {
  const [rows] = await connection.execute<PlaceLockRow[]>(
    `SELECT id, name, place_status, verification_status, version
     FROM places WHERE id = ? FOR UPDATE`,
    [placeId],
  );
  return rows[0];
}

async function upsertApprovalMenu(
  connection: PoolConnection,
  placeId: Ulid,
  menu: ApprovalMenuInput,
): Promise<void> {
  if (menu.priceAmount < 0) throw new RangeError('Menu priceAmount must be nonnegative');
  await connection.execute(
    `INSERT INTO menus (
       id, place_id, name, description, price_amount, is_main_item, is_available, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE description = VALUES(description), price_amount = VALUES(price_amount),
       is_main_item = VALUES(is_main_item), is_available = VALUES(is_available),
       sort_order = VALUES(sort_order), deleted_at = NULL, version = version + 1`,
    [
      menu.id,
      placeId,
      menu.name,
      menu.description ?? null,
      menu.priceAmount,
      menu.isMainItem,
      menu.isAvailable,
      menu.sortOrder ?? 0,
    ],
  );
}

async function assertMainItemRule(
  connection: PoolConnection,
  placeId: Ulid,
  categoryId: Ulid,
): Promise<void> {
  const [rows] = await connection.execute<CountRow[]>(
    `SELECT COUNT(*) AS count
     FROM categories c
     LEFT JOIN menus m ON m.place_id = ? AND m.is_main_item = true
       AND m.is_available = true AND m.deleted_at IS NULL AND m.price_amount >= 0
     WHERE c.id = ? AND (c.code <> 'MAKAN_MURAH' OR m.id IS NOT NULL)`,
    [placeId, categoryId],
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    throw new Error('Makan Murah requires at least one valid main item');
  }
}

interface HistoryAuditInput {
  readonly actorUserId: Ulid;
  readonly requestId: string;
  readonly reason: string;
  readonly placeId: Ulid;
  readonly sourceType: 'CONTRIBUTION' | 'REPORT';
  readonly sourceId: Ulid;
  readonly changeType: string;
  readonly previousValue: string | null;
  readonly newValue: string;
}

async function insertHistoryAndAudit(
  connection: PoolConnection,
  input: HistoryAuditInput,
): Promise<void> {
  await connection.execute(
    `INSERT INTO place_change_history (
       id, place_id, changed_by, source_type, source_id, change_type,
       previous_value, new_value, reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createUlid(),
      input.placeId,
      input.actorUserId,
      input.sourceType,
      input.sourceId,
      input.changeType,
      input.previousValue,
      input.newValue,
      input.reason,
    ],
  );
  await connection.execute(
    `INSERT INTO audit_logs (
       id, actor_user_id, actor_role, action, target_type, target_id, request_id,
       previous_value, new_value, reason
     ) VALUES (?, ?, 'ADMIN', ?, 'PLACE', ?, ?, ?, ?, ?)`,
    [
      createUlid(),
      input.actorUserId,
      input.changeType,
      input.placeId,
      input.requestId,
      input.previousValue,
      input.newValue,
      input.reason,
    ],
  );
}
