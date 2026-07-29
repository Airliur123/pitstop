import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminContributionDetail,
  AdminContributionQueue,
  AdminDashboard,
  AdminReviewer,
  ContributionDraftPayload,
  ContributionStatus,
  MergeContributionResult,
  ModerationAction,
  ModerationHistoryEvent,
  ModerationMutationResult,
} from '@pitstop/contracts';
import {
  createUlid,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '@pitstop/database';
import {
  type AdminContributionQueueInput,
  type ApproveContributionInput,
  contributionSubmissionSchema,
  type ModerationDecisionInput,
} from '@pitstop/validation';

import { DATABASE_POOL } from '../../common/database/database.module';
import { maskEmail } from '../auth/auth-security';
import type { AdminQueueCursor } from './admin-moderation.cursor';

const reviewLeaseMinutes = 30;

type RepositoryErrorCode =
  | 'CLAIM_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_STATE'
  | 'NOT_FOUND'
  | 'NOT_REVIEWER'
  | 'PUBLICATION_TARGET_INVALID'
  | 'VERSION_CONFLICT';

export class AdminModerationRepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode) {
    super(code);
    this.name = 'AdminModerationRepositoryError';
  }
}

interface DashboardCountRow extends RowDataPacket {
  readonly approved_awaiting_merge: number;
  readonly in_review: number;
  readonly needs_revision: number;
  readonly pending: number;
}

interface QueueRow extends RowDataPacket {
  readonly category_code: AdminContributionDetail['payload']['category'];
  readonly contribution_status: AdminContributionDetail['status'];
  readonly id: string;
  readonly place_name: string;
  readonly review_claimed_at: Date | string | null;
  readonly reviewer_email: string | null;
  readonly reviewer_id: string | null;
  readonly source: AdminContributionDetail['source'];
  readonly submitted_at: Date | string;
  readonly version: number;
}

interface DetailRow extends QueueRow {
  readonly approved_at: Date | string | null;
  readonly contributor_email: string | null;
  readonly contributor_id: string | null;
  readonly created_at: Date | string;
  readonly decision_reason: string | null;
  readonly latitude: number | string | null;
  readonly longitude: number | string | null;
  readonly merged_at: Date | string | null;
  readonly merged_place_id: string | null;
  readonly payload: unknown;
  readonly target_place_id: string | null;
  readonly updated_at: Date | string;
  readonly verified_city: string | null;
  readonly verified_district: string | null;
  readonly verified_postal_code: string | null;
  readonly verified_province: string | null;
}

interface EventRow extends RowDataPacket {
  readonly action: ModerationAction;
  readonly actor_email: string;
  readonly actor_id: string;
  readonly contribution_version: number;
  readonly created_at: Date | string;
  readonly id: string;
  readonly merged_place_id: string | null;
  readonly next_status: ContributionStatus;
  readonly previous_status: ContributionStatus;
  readonly reason: string | null;
}

interface LockRow extends RowDataPacket {
  readonly approved_at: Date | string | null;
  readonly contribution_status: ContributionStatus;
  readonly merged_place_id: string | null;
  readonly payload: unknown;
  readonly review_claim_expired: number;
  readonly reviewed_by: string | null;
  readonly target_place_id: string | null;
  readonly verified_city: string | null;
  readonly verified_district: string | null;
  readonly verified_postal_code: string | null;
  readonly verified_province: string | null;
  readonly latitude: number | string | null;
  readonly longitude: number | string | null;
  readonly version: number;
}

interface IdempotencyRow extends RowDataPacket {
  readonly request_hash: string;
  readonly response_body: unknown;
}

interface CategoryRow extends RowDataPacket {
  readonly id: string;
}

interface FacilityRow extends RowDataPacket {
  readonly code: string;
  readonly id: string;
}

interface PlaceRow extends RowDataPacket {
  readonly deleted_at: Date | string | null;
  readonly id: string;
  readonly place_status: string;
  readonly slug: string;
}

interface MutationReplay {
  readonly contributionId: string | null;
  readonly placeId: string | null;
  readonly placeSlug: string | null;
}

interface PublicationPayload {
  readonly address: string;
  readonly category: NonNullable<ContributionDraftPayload['category']>;
  readonly facilities: NonNullable<ContributionDraftPayload['facilities']>;
  readonly landmark: string | null;
  readonly mainMenu: ContributionDraftPayload['mainMenu'];
  readonly operatingHours: NonNullable<ContributionDraftPayload['operatingHours']>;
  readonly placeName: string;
}

@Injectable()
export class AdminModerationRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async dashboard(): Promise<AdminDashboard> {
    const [counts] = await this.pool.execute<DashboardCountRow[]>(
      `SELECT
         SUM(contribution_status = 'PENDING') AS pending,
         SUM(contribution_status = 'IN_REVIEW') AS in_review,
         SUM(contribution_status = 'NEEDS_REVISION') AS needs_revision,
         SUM(contribution_status = 'APPROVED') AS approved_awaiting_merge
       FROM contributions`,
    );
    const recentActivity = await this.findRecentEvents(this.pool);
    const row = counts[0];
    return {
      recentActivity,
      totals: {
        approvedAwaitingMerge: Number(row?.approved_awaiting_merge ?? 0),
        inReview: Number(row?.in_review ?? 0),
        needsRevision: Number(row?.needs_revision ?? 0),
        pending: Number(row?.pending ?? 0),
      },
    };
  }

  async list(
    input: AdminContributionQueueInput,
    cursor: AdminQueueCursor | undefined,
  ): Promise<AdminContributionQueue> {
    const clauses = [`c.contribution_status <> 'DRAFT'`, 'c.submitted_at IS NOT NULL'];
    const parameters: (number | string)[] = [];
    if (input.status) {
      clauses.push('c.contribution_status = ?');
      parameters.push(input.status);
    }
    if (input.category) {
      clauses.push('cp.category_code = ?');
      parameters.push(input.category);
    }
    if (input.source) {
      clauses.push('c.source = ?');
      parameters.push(input.source);
    }
    if (input.contributorId) {
      clauses.push('c.submitted_by = ?');
      parameters.push(input.contributorId);
    }
    if (input.from) {
      clauses.push('c.submitted_at >= ?');
      parameters.push(`${input.from} 00:00:00.000`);
    }
    if (input.to) {
      clauses.push('c.submitted_at < DATE_ADD(?, INTERVAL 1 DAY)');
      parameters.push(`${input.to} 00:00:00.000`);
    }
    if (input.search) {
      clauses.push(
        "(cp.place_name_normalized LIKE CONCAT('%', ?, '%') ESCAPE '!' OR cp.address_normalized LIKE CONCAT('%', ?, '%') ESCAPE '!')",
      );
      const searchPattern = escapeLikePattern(input.search);
      parameters.push(searchPattern, searchPattern);
    }
    if (cursor) {
      clauses.push(
        input.sort === 'SUBMITTED_ASC'
          ? '(c.submitted_at > ? OR (c.submitted_at = ? AND c.id > ?))'
          : '(c.submitted_at < ? OR (c.submitted_at = ? AND c.id < ?))',
      );
      parameters.push(cursor.submittedAt, cursor.submittedAt, cursor.id);
    }
    const orderClause =
      input.sort === 'SUBMITTED_ASC'
        ? ' ORDER BY c.submitted_at ASC, c.id ASC'
        : ' ORDER BY c.submitted_at DESC, c.id DESC';
    const query =
      `SELECT c.id, c.source, c.contribution_status, c.submitted_at, c.version,
         cp.category_code, JSON_UNQUOTE(JSON_EXTRACT(cp.payload, '$.placeName')) AS place_name,
         c.reviewed_by AS reviewer_id, c.review_claimed_at,
         reviewer.email AS reviewer_email
       FROM contributions c
       JOIN contribution_payloads cp ON cp.contribution_id = c.id
       LEFT JOIN users reviewer ON reviewer.id = c.reviewed_by
       WHERE ` +
      clauses.join(' AND ') +
      orderClause +
      ' LIMIT ?';
    parameters.push(input.limit + 1);
    const [rows] = await this.pool.query<QueueRow[]>(query, parameters);
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit).map(mapQueueRow),
      pagination: { hasMore, nextCursor: null },
    };
  }

  async detail(contributionId: string): Promise<AdminContributionDetail | null> {
    return this.findDetailWithExecutor(this.pool, contributionId);
  }

  async claim(input: {
    readonly adminId: string;
    readonly contributionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<ModerationMutationResult> {
    return this.withTransaction(async (connection) => {
      const scope = moderationScope('claim', input.adminId, input.contributionId);
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.contributionId) {
        return this.replayedMutation(connection, replay.contributionId);
      }
      const current = await this.lockContribution(connection, input.contributionId);
      if (!current) throw new AdminModerationRepositoryError('NOT_FOUND');
      if (current.version !== input.expectedVersion) {
        throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      }

      let action: ModerationAction;
      let previousStatus: ContributionStatus;
      if (current.contribution_status === 'PENDING') {
        action = 'CLAIM';
        previousStatus = 'PENDING';
      } else if (
        current.contribution_status === 'IN_REVIEW' &&
        current.review_claim_expired === 1
      ) {
        action = 'RECLAIM';
        previousStatus = 'IN_REVIEW';
      } else if (
        current.contribution_status === 'IN_REVIEW' &&
        current.reviewed_by === input.adminId
      ) {
        const contribution = await this.requiredDetail(connection, input.contributionId);
        await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
          contributionId: contribution.id,
        });
        return { contribution, replayed: true };
      } else {
        throw new AdminModerationRepositoryError('CLAIM_CONFLICT');
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET contribution_status = 'IN_REVIEW', reviewed_by = ?,
           review_claimed_at = CURRENT_TIMESTAMP(3), reviewed_at = NULL,
           decision_reason = NULL, version = version + 1
         WHERE id = ? AND version = ?`,
        [input.adminId, input.contributionId, input.expectedVersion],
      );
      if (result.affectedRows !== 1) throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      await this.insertEvent(connection, {
        action,
        actorAdminId: input.adminId,
        contributionId: input.contributionId,
        contributionVersion: input.expectedVersion + 1,
        mergedPlaceId: null,
        nextStatus: 'IN_REVIEW',
        previousStatus,
        reason: null,
      });
      const contribution = await this.requiredDetail(connection, input.contributionId);
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
        contributionId: contribution.id,
      });
      return { contribution, replayed: false };
    });
  }

  async decide(
    action: 'NEEDS_REVISION' | 'REJECT',
    input: {
      readonly adminId: string;
      readonly contributionId: string;
      readonly decision: ModerationDecisionInput;
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<ModerationMutationResult> {
    return this.withTransaction(async (connection) => {
      const scope = moderationScope(action.toLowerCase(), input.adminId, input.contributionId);
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.contributionId) {
        return this.replayedMutation(connection, replay.contributionId);
      }
      const current = await this.lockContribution(connection, input.contributionId);
      this.assertDecisionAllowed(current, input.adminId, input.decision.expectedVersion);
      const nextStatus = action === 'REJECT' ? 'REJECTED' : 'NEEDS_REVISION';
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET contribution_status = ?, decision_reason = ?, reviewed_at = CURRENT_TIMESTAMP(3),
           version = version + 1
         WHERE id = ? AND contribution_status = 'IN_REVIEW' AND reviewed_by = ? AND version = ?`,
        [
          nextStatus,
          input.decision.reason,
          input.contributionId,
          input.adminId,
          input.decision.expectedVersion,
        ],
      );
      if (result.affectedRows !== 1) throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      await this.insertEvent(connection, {
        action,
        actorAdminId: input.adminId,
        contributionId: input.contributionId,
        contributionVersion: input.decision.expectedVersion + 1,
        mergedPlaceId: null,
        nextStatus,
        previousStatus: 'IN_REVIEW',
        reason: input.decision.reason,
      });
      const contribution = await this.requiredDetail(connection, input.contributionId);
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
        contributionId: contribution.id,
      });
      return { contribution, replayed: false };
    });
  }

  async approve(input: {
    readonly adminId: string;
    readonly approval: ApproveContributionInput;
    readonly contributionId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<ModerationMutationResult> {
    return this.withTransaction(async (connection) => {
      const scope = moderationScope('approve', input.adminId, input.contributionId);
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.contributionId) {
        return this.replayedMutation(connection, replay.contributionId);
      }
      const current = await this.lockContribution(connection, input.contributionId);
      this.assertDecisionAllowed(current, input.adminId, input.approval.expectedVersion);
      publicationPayload(current?.payload);
      const targetPlaceId =
        input.approval.publicationTarget.mode === 'MERGE_EXISTING'
          ? input.approval.publicationTarget.targetPlaceId
          : null;
      if (targetPlaceId) await this.assertPublicationTarget(connection, targetPlaceId);

      const location = input.approval.location;
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET contribution_status = 'APPROVED', target_place_id = ?,
           verified_location = ST_GeomFromText(?, 4326, 'axis-order=long-lat'),
           verified_district = ?, verified_city = ?, verified_province = ?,
           verified_postal_code = ?, approved_at = CURRENT_TIMESTAMP(3),
           reviewed_at = CURRENT_TIMESTAMP(3), decision_reason = NULL, version = version + 1
         WHERE id = ? AND contribution_status = 'IN_REVIEW' AND reviewed_by = ? AND version = ?`,
        [
          targetPlaceId,
          pointWkt(location.longitude, location.latitude),
          location.district,
          location.city,
          location.province,
          location.postalCode,
          input.contributionId,
          input.adminId,
          input.approval.expectedVersion,
        ],
      );
      if (result.affectedRows !== 1) throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      await this.insertEvent(connection, {
        action: 'APPROVE',
        actorAdminId: input.adminId,
        contributionId: input.contributionId,
        contributionVersion: input.approval.expectedVersion + 1,
        mergedPlaceId: null,
        nextStatus: 'APPROVED',
        previousStatus: 'IN_REVIEW',
        reason: null,
      });
      const contribution = await this.requiredDetail(connection, input.contributionId);
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
        contributionId: contribution.id,
      });
      return { contribution, replayed: false };
    });
  }

  async merge(input: {
    readonly adminId: string;
    readonly contributionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly requestId: string;
  }): Promise<MergeContributionResult> {
    return this.withTransaction(async (connection) => {
      const scope = moderationScope('merge', input.adminId, input.contributionId);
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.placeId && replay.placeSlug && replay.contributionId) {
        const contribution = await this.requiredDetail(connection, replay.contributionId);
        return {
          contribution,
          placeId: replay.placeId,
          placeSlug: replay.placeSlug,
          replayed: true,
        };
      }
      const current = await this.lockContribution(connection, input.contributionId);
      if (!current) throw new AdminModerationRepositoryError('NOT_FOUND');
      if (current.contribution_status === 'MERGED' && current.merged_place_id) {
        const place = await this.requiredPlace(connection, current.merged_place_id);
        const contribution = await this.requiredDetail(connection, input.contributionId);
        await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
          contributionId: contribution.id,
          placeId: place.id,
          placeSlug: place.slug,
        });
        return {
          contribution,
          placeId: place.id,
          placeSlug: place.slug,
          replayed: true,
        };
      }
      if (current.contribution_status !== 'APPROVED') {
        throw new AdminModerationRepositoryError('INVALID_STATE');
      }
      if (current.reviewed_by !== input.adminId) {
        throw new AdminModerationRepositoryError('NOT_REVIEWER');
      }
      if (current.version !== input.expectedVersion) {
        throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      }
      const payload = publicationPayload(current.payload);
      const location = publicationLocation(current);
      const existingPlace = current.target_place_id
        ? await this.assertPublicationTarget(connection, current.target_place_id)
        : null;
      const placeId = existingPlace?.id ?? createUlid();
      const placeSlug =
        existingPlace?.slug ?? publicationSlug(payload.placeName, input.contributionId);

      if (existingPlace) {
        await connection.execute(
          `UPDATE places
           SET name = ?, address = ?, landmark = ?, district = ?, city = ?, province = ?,
             postal_code = ?,
             location = ST_GeomFromText(?, 4326, 'axis-order=long-lat'),
             place_status = 'ACTIVE', verification_status = 'ADMIN_VERIFIED',
             verified_at = CURRENT_TIMESTAMP(3), verified_by = ?,
             data_freshness_at = CURRENT_TIMESTAMP(3), version = version + 1
           WHERE id = ? AND deleted_at IS NULL AND place_status = 'ACTIVE'`,
          [
            payload.placeName,
            payload.address,
            payload.landmark,
            location.district,
            location.city,
            location.province,
            location.postalCode,
            pointWkt(location.longitude, location.latitude),
            input.adminId,
            placeId,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO places (
             id, name, slug, description, address, landmark, district, city, province, postal_code,
             location, place_status, verification_status, verified_at, verified_by, data_freshness_at
           ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?,
             ST_GeomFromText(?, 4326, 'axis-order=long-lat'),
             'ACTIVE', 'ADMIN_VERIFIED', CURRENT_TIMESTAMP(3), ?, CURRENT_TIMESTAMP(3))`,
          [
            placeId,
            payload.placeName,
            placeSlug,
            payload.address,
            payload.landmark,
            location.district,
            location.city,
            location.province,
            location.postalCode,
            pointWkt(location.longitude, location.latitude),
            input.adminId,
          ],
        );
      }
      await this.publishRelatedData(connection, placeId, payload);
      await this.insertPlaceGovernance(connection, {
        actorAdminId: input.adminId,
        contributionId: input.contributionId,
        placeId,
        requestId: input.requestId,
        type: existingPlace ? 'CONTRIBUTION_MERGED_INTO_PLACE' : 'CONTRIBUTION_CREATED_PLACE',
      });
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET contribution_status = 'MERGED', merged_place_id = ?, merged_at = CURRENT_TIMESTAMP(3),
           version = version + 1
         WHERE id = ? AND contribution_status = 'APPROVED' AND reviewed_by = ? AND version = ?`,
        [placeId, input.contributionId, input.adminId, input.expectedVersion],
      );
      if (result.affectedRows !== 1) throw new AdminModerationRepositoryError('VERSION_CONFLICT');
      await this.insertEvent(connection, {
        action: 'MERGE',
        actorAdminId: input.adminId,
        contributionId: input.contributionId,
        contributionVersion: input.expectedVersion + 1,
        mergedPlaceId: placeId,
        nextStatus: 'MERGED',
        previousStatus: 'APPROVED',
        reason: null,
      });
      const contribution = await this.requiredDetail(connection, input.contributionId);
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, {
        contributionId: contribution.id,
        placeId,
        placeSlug,
      });
      return { contribution, placeId, placeSlug, replayed: false };
    });
  }

  private async publishRelatedData(
    connection: PoolConnection,
    placeId: string,
    payload: PublicationPayload,
  ): Promise<void> {
    const [categories] = await connection.execute<CategoryRow[]>(
      'SELECT id FROM categories WHERE code = ? LIMIT 1',
      [payload.category],
    );
    const categoryId = categories[0]?.id;
    if (!categoryId) throw new Error('Canonical category master data is unavailable');
    await connection.execute('UPDATE place_categories SET is_primary = false WHERE place_id = ?', [
      placeId,
    ]);
    await connection.execute(
      `INSERT INTO place_categories (place_id, category_id, is_primary)
       VALUES (?, ?, true)
       ON DUPLICATE KEY UPDATE is_primary = true`,
      [placeId, categoryId],
    );

    await connection.execute(
      'UPDATE menus SET is_main_item = false WHERE place_id = ? AND deleted_at IS NULL',
      [placeId],
    );
    if (payload.mainMenu?.name && payload.mainMenu.priceAmount !== undefined) {
      await connection.execute(
        `INSERT INTO menus (
           id, place_id, name, description, price_amount, is_main_item, is_available, sort_order
         ) VALUES (?, ?, ?, NULL, ?, true, true, 0)
         ON DUPLICATE KEY UPDATE price_amount = VALUES(price_amount), is_main_item = true,
           is_available = true, deleted_at = NULL, version = version + 1`,
        [createUlid(), placeId, payload.mainMenu.name, payload.mainMenu.priceAmount],
      );
    }

    const [facilities] = await connection.execute<FacilityRow[]>('SELECT id, code FROM facilities');
    const facilityIds = new Map(facilities.map((facility) => [facility.code, facility.id]));
    for (const facility of payload.facilities) {
      const facilityId = facilityIds.get(facility.code);
      if (!facilityId) throw new Error('Canonical facility master data is unavailable');
      await connection.execute(
        `INSERT INTO place_facilities (place_id, facility_id, facility_status, confirmed_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE facility_status = VALUES(facility_status),
           confirmed_at = CURRENT_TIMESTAMP(3)`,
        [placeId, facilityId, facility.status],
      );
    }

    await connection.execute('DELETE FROM operating_hours WHERE place_id = ?', [placeId]);
    for (const hours of payload.operatingHours) {
      if (hours.isClosed) continue;
      await connection.execute(
        `INSERT INTO operating_hours (
           id, place_id, day_of_week, sequence, opens_at, closes_at, is_24_hours
         ) VALUES (?, ?, ?, 0, ?, ?, ?)`,
        [
          createUlid(),
          placeId,
          hours.dayOfWeek,
          hours.opensAt ? `${hours.opensAt}:00` : null,
          hours.closesAt ? `${hours.closesAt}:00` : null,
          hours.is24Hours,
        ],
      );
    }
  }

  private async insertPlaceGovernance(
    connection: PoolConnection,
    input: {
      readonly actorAdminId: string;
      readonly contributionId: string;
      readonly placeId: string;
      readonly requestId: string;
      readonly type: string;
    },
  ): Promise<void> {
    const newValue = JSON.stringify({
      placeStatus: 'ACTIVE',
      verificationStatus: 'ADMIN_VERIFIED',
    });
    await connection.execute(
      `INSERT INTO place_change_history (
         id, place_id, changed_by, source_type, source_id, change_type, new_value
       ) VALUES (?, ?, ?, 'CONTRIBUTION', ?, ?, ?)`,
      [createUlid(), input.placeId, input.actorAdminId, input.contributionId, input.type, newValue],
    );
    await connection.execute(
      `INSERT INTO audit_logs (
         id, actor_user_id, actor_role, action, target_type, target_id, request_id, new_value
       ) VALUES (?, ?, 'ADMIN', ?, 'PLACE', ?, ?, ?)`,
      [createUlid(), input.actorAdminId, input.type, input.placeId, input.requestId, newValue],
    );
  }

  private assertDecisionAllowed(
    current: LockRow | null,
    adminId: string,
    expectedVersion: number,
  ): asserts current is LockRow {
    if (!current) throw new AdminModerationRepositoryError('NOT_FOUND');
    if (current.contribution_status !== 'IN_REVIEW') {
      throw new AdminModerationRepositoryError('INVALID_STATE');
    }
    if (current.reviewed_by !== adminId) throw new AdminModerationRepositoryError('NOT_REVIEWER');
    if (current.review_claim_expired === 1) {
      throw new AdminModerationRepositoryError('NOT_REVIEWER');
    }
    if (current.version !== expectedVersion) {
      throw new AdminModerationRepositoryError('VERSION_CONFLICT');
    }
  }

  private async assertPublicationTarget(
    connection: PoolConnection,
    placeId: string,
  ): Promise<PlaceRow> {
    const [rows] = await connection.execute<PlaceRow[]>(
      `SELECT id, slug, place_status, deleted_at
       FROM places WHERE id = ? FOR UPDATE`,
      [placeId],
    );
    const place = rows[0];
    if (!place || place.deleted_at !== null || place.place_status !== 'ACTIVE') {
      throw new AdminModerationRepositoryError('PUBLICATION_TARGET_INVALID');
    }
    return place;
  }

  private async requiredPlace(connection: PoolConnection, placeId: string): Promise<PlaceRow> {
    const [rows] = await connection.execute<PlaceRow[]>(
      'SELECT id, slug, place_status, deleted_at FROM places WHERE id = ? LIMIT 1',
      [placeId],
    );
    const place = rows[0];
    if (!place) throw new Error('Merged place could not be reloaded');
    return place;
  }

  private async lockContribution(
    connection: PoolConnection,
    contributionId: string,
  ): Promise<LockRow | null> {
    const [rows] = await connection.execute<LockRow[]>(
      `SELECT c.contribution_status, c.version, c.reviewed_by, c.target_place_id,
         c.approved_at, c.merged_place_id, cp.payload,
         c.verified_district, c.verified_city, c.verified_province, c.verified_postal_code,
         ST_Longitude(c.verified_location) AS longitude,
         ST_Latitude(c.verified_location) AS latitude,
         (c.review_claimed_at IS NOT NULL AND
           c.review_claimed_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE))
           AS review_claim_expired
       FROM contributions c
       JOIN contribution_payloads cp ON cp.contribution_id = c.id
       WHERE c.id = ? FOR UPDATE`,
      [contributionId],
    );
    return rows[0] ?? null;
  }

  private async findDetailWithExecutor(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    contributionId: string,
  ): Promise<AdminContributionDetail | null> {
    const [rows] = await executor.execute<DetailRow[]>(
      `SELECT c.id, c.source, c.contribution_status, c.submitted_at, c.version,
         c.created_at, c.updated_at, c.decision_reason, c.approved_at, c.merged_at,
         c.merged_place_id, c.target_place_id, c.review_claimed_at,
         c.verified_district, c.verified_city, c.verified_province, c.verified_postal_code,
         ST_Longitude(c.verified_location) AS longitude,
         ST_Latitude(c.verified_location) AS latitude,
         cp.category_code, cp.payload,
         JSON_UNQUOTE(JSON_EXTRACT(cp.payload, '$.placeName')) AS place_name,
         contributor.id AS contributor_id, contributor.email AS contributor_email,
         reviewer.id AS reviewer_id, reviewer.email AS reviewer_email
       FROM contributions c
       JOIN contribution_payloads cp ON cp.contribution_id = c.id
       LEFT JOIN users contributor ON contributor.id = c.submitted_by
       LEFT JOIN users reviewer ON reviewer.id = c.reviewed_by
       WHERE c.id = ? AND c.contribution_status <> 'DRAFT' AND c.submitted_at IS NOT NULL
       LIMIT 1`,
      [contributionId],
    );
    const row = rows[0];
    if (!row) return null;
    const history = await this.findEvents(executor, contributionId);
    return mapDetailRow(row, history);
  }

  private async requiredDetail(
    connection: PoolConnection,
    contributionId: string,
  ): Promise<AdminContributionDetail> {
    const contribution = await this.findDetailWithExecutor(connection, contributionId);
    if (!contribution) throw new Error('Moderated contribution could not be reloaded');
    return contribution;
  }

  private async findEvents(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    contributionId: string,
  ): Promise<readonly ModerationHistoryEvent[]> {
    const [rows] = await executor.execute<EventRow[]>(
      `SELECT e.id, e.previous_status, e.next_status, e.action, e.reason,
         e.contribution_version, e.merged_place_id, e.created_at,
         u.id AS actor_id, u.email AS actor_email
       FROM moderation_events e
       JOIN users u ON u.id = e.actor_admin_id
       WHERE e.contribution_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
      [contributionId],
    );
    return rows.map(mapEventRow);
  }

  private async findRecentEvents(
    executor: Pick<Pool, 'execute'>,
  ): Promise<readonly ModerationHistoryEvent[]> {
    const [rows] = await executor.execute<EventRow[]>(
      `SELECT e.id, e.previous_status, e.next_status, e.action, e.reason,
         e.contribution_version, e.merged_place_id, e.created_at,
         u.id AS actor_id, u.email AS actor_email
       FROM moderation_events e
       JOIN users u ON u.id = e.actor_admin_id
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 8`,
    );
    return rows.map(mapEventRow);
  }

  private async insertEvent(
    connection: PoolConnection,
    input: {
      readonly action: ModerationAction;
      readonly actorAdminId: string;
      readonly contributionId: string;
      readonly contributionVersion: number;
      readonly mergedPlaceId: string | null;
      readonly nextStatus: ContributionStatus;
      readonly previousStatus: ContributionStatus;
      readonly reason: string | null;
    },
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO moderation_events (
         id, contribution_id, actor_admin_id, previous_status, next_status,
         action, reason, contribution_version, merged_place_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createUlid(),
        input.contributionId,
        input.actorAdminId,
        input.previousStatus,
        input.nextStatus,
        input.action,
        input.reason,
        input.contributionVersion,
        input.mergedPlaceId,
      ],
    );
  }

  private async replayedMutation(
    connection: PoolConnection,
    contributionId: string,
  ): Promise<ModerationMutationResult> {
    return {
      contribution: await this.requiredDetail(connection, contributionId),
      replayed: true,
    };
  }

  private async claimIdempotencyKey(
    connection: PoolConnection,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<MutationReplay> {
    await connection.execute(
      `INSERT INTO idempotency_keys (
         id, scope, idempotency_key, request_hash, locked_until, expires_at
       ) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 30 SECOND),
         DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 24 HOUR))
       ON DUPLICATE KEY UPDATE id = id`,
      [createUlid(), scope, idempotencyKey, requestHash],
    );
    const [rows] = await connection.execute<IdempotencyRow[]>(
      `SELECT request_hash, response_body FROM idempotency_keys
       WHERE scope = ? AND idempotency_key = ? FOR UPDATE`,
      [scope, idempotencyKey],
    );
    const row = rows[0];
    if (!row) throw new Error('Admin idempotency key could not be claimed');
    if (row.request_hash !== requestHash) {
      throw new AdminModerationRepositoryError('IDEMPOTENCY_KEY_REUSED');
    }
    return parseReplay(row.response_body);
  }

  private async completeIdempotencyKey(
    connection: PoolConnection,
    scope: string,
    idempotencyKey: string,
    response: {
      readonly contributionId: string;
      readonly placeId?: string;
      readonly placeSlug?: string;
    },
  ): Promise<void> {
    await connection.execute(
      `UPDATE idempotency_keys
       SET response_status = 200, response_body = ?, locked_until = NULL
       WHERE scope = ? AND idempotency_key = ?`,
      [JSON.stringify(response), scope, idempotencyKey],
    );
  }

  private async withTransaction<T>(
    operation: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function mapQueueRow(row: QueueRow): AdminContributionQueue['items'][number] {
  return {
    category: requiredCategory(row.category_code),
    currentReviewer: mapReviewer(row),
    id: row.id,
    placeName: row.place_name,
    source: row.source,
    status: row.contribution_status,
    submittedAt: isoDate(row.submitted_at),
    version: Number(row.version),
  };
}

function mapReviewer(row: QueueRow): AdminReviewer | null {
  if (!row.reviewer_id || !row.reviewer_email || !row.review_claimed_at) return null;
  const claimedAt = new Date(row.review_claimed_at);
  const expiresAt = new Date(claimedAt.getTime() + reviewLeaseMinutes * 60_000);
  return {
    claimExpired: expiresAt.getTime() <= Date.now(),
    claimExpiresAt: expiresAt.toISOString(),
    claimedAt: claimedAt.toISOString(),
    email: maskEmail(row.reviewer_email),
    id: row.reviewer_id,
  };
}

function mapDetailRow(
  row: DetailRow,
  history: readonly ModerationHistoryEvent[],
): AdminContributionDetail {
  const payload = contributionSubmissionSchema.parse(parseJson(row.payload));
  const target =
    row.longitude === null || row.latitude === null
      ? null
      : row.target_place_id
        ? { mode: 'MERGE_EXISTING' as const, targetPlaceId: row.target_place_id }
        : { mode: 'CREATE_NEW' as const, targetPlaceId: null };
  const verifiedLocation =
    row.longitude === null ||
    row.latitude === null ||
    row.verified_district === null ||
    row.verified_city === null ||
    row.verified_province === null
      ? null
      : {
          city: row.verified_city,
          district: row.verified_district,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          postalCode: row.verified_postal_code,
          province: row.verified_province,
        };
  return {
    approvedAt: nullableIsoDate(row.approved_at),
    createdAt: isoDate(row.created_at),
    currentReviewer: mapReviewer(row),
    contributor:
      row.contributor_id && row.contributor_email
        ? { email: maskEmail(row.contributor_email), id: row.contributor_id }
        : null,
    decisionReason: row.decision_reason,
    history,
    id: row.id,
    mergedAt: nullableIsoDate(row.merged_at),
    mergedPlaceId: row.merged_place_id,
    payload,
    publicationTarget: target,
    source: row.source,
    status: row.contribution_status,
    submittedAt: isoDate(row.submitted_at),
    updatedAt: isoDate(row.updated_at),
    verifiedLocation,
    version: Number(row.version),
  };
}

function mapEventRow(row: EventRow): ModerationHistoryEvent {
  return {
    action: row.action,
    actor: { email: maskEmail(row.actor_email), id: row.actor_id },
    contributionVersion: Number(row.contribution_version),
    createdAt: isoDate(row.created_at),
    id: row.id,
    mergedPlaceId: row.merged_place_id,
    nextStatus: row.next_status,
    previousStatus: row.previous_status,
    reason: row.reason,
  };
}

function publicationPayload(value: unknown): PublicationPayload {
  const parsed = contributionSubmissionSchema.parse(parseJson(value));
  if (!parsed.placeName || !parsed.address || !parsed.category) {
    throw new Error('Submitted contribution payload is incomplete');
  }
  return {
    address: parsed.address,
    category: parsed.category,
    facilities: parsed.facilities ?? [],
    landmark: parsed.landmark ?? null,
    mainMenu: parsed.mainMenu,
    operatingHours: parsed.operatingHours ?? [],
    placeName: parsed.placeName,
  };
}

function publicationLocation(row: LockRow) {
  if (
    row.longitude === null ||
    row.latitude === null ||
    row.verified_district === null ||
    row.verified_city === null ||
    row.verified_province === null
  ) {
    throw new Error('Approved contribution is missing verified publication location');
  }
  return {
    city: row.verified_city,
    district: row.verified_district,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    postalCode: row.verified_postal_code,
    province: row.verified_province,
  };
}

function publicationSlug(placeName: string, contributionId: string): string {
  const normalized = placeName
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 180);
  return `${normalized || 'tempat'}-${contributionId.slice(-8).toLowerCase()}`;
}

function requiredCategory(
  value: AdminContributionDetail['payload']['category'],
): NonNullable<AdminContributionDetail['payload']['category']> {
  if (!value) throw new TypeError('Submitted contribution category is missing');
  return value;
}

function parseReplay(value: unknown): MutationReplay {
  const parsed = parseJson(value);
  if (typeof parsed !== 'object' || parsed === null) {
    return { contributionId: null, placeId: null, placeSlug: null };
  }
  const contributionId = Reflect.get(parsed, 'contributionId');
  const placeId = Reflect.get(parsed, 'placeId');
  const placeSlug = Reflect.get(parsed, 'placeSlug');
  return {
    contributionId: typeof contributionId === 'string' ? contributionId : null,
    placeId: typeof placeId === 'string' ? placeId : null,
    placeSlug: typeof placeSlug === 'string' ? placeSlug : null,
  };
}

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}

function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Database timestamp is invalid');
  return date.toISOString();
}

function nullableIsoDate(value: Date | string | null): string | null {
  return value === null ? null : isoDate(value);
}

function moderationScope(action: string, adminId: string, contributionId: string): string {
  return `admin:moderation:${action}:${adminId}:${contributionId}`;
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_');
}

function pointWkt(longitude: number, latitude: number): string {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('Verified longitude is outside the supported range');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('Verified latitude is outside the supported range');
  }
  return `POINT(${longitude} ${latitude})`;
}
