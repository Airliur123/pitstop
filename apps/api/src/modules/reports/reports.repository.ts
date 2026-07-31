import { Inject, Injectable } from '@nestjs/common';
import type {
  ActivityItem,
  AdminReportDetail,
  AdminReportQueue,
  AdminReportReviewer,
  ApprovedPlacePatch,
  AuditLogPage,
  ConfirmationType,
  ContributionStatus,
  GovernanceAuditEntry,
  PlaceConfirmationDetail,
  PlaceHistoryEntry,
  PlaceReportDetail,
  ReportStatus,
  ReportType,
  UserActivity,
  VerificationStatus,
} from '@pitstop/contracts';
import {
  createUlid,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '@pitstop/database';
import {
  type ActivityQueryInput,
  type AdminReportQueueInput,
  type ApplyReportInput,
  approvedPlacePatchSchema,
  type AuditLogQueryInput,
  type ConfirmationInput,
  type CreateReportInput,
} from '@pitstop/validation';

import { DATABASE_POOL } from '../../common/database/database.module';
import { maskEmail } from '../auth/auth-security';
import type { ReportsCursor } from './reports.cursor';
import {
  calculateVerificationStatus,
  confirmationCanRefresh,
  confirmationExpiresAt,
  seriousReportTypes,
} from './reports-policy';
import { buildSafePlaceSnapshot, sanitizeAuditMetadata } from './reports-security';

const reviewLeaseMinutes = 30;
const seriousReportTypeList = [
  'LOCATION_INCORRECT',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'DUPLICATE_PLACE',
] as const;

type RepositoryErrorCode =
  | 'CLAIM_CONFLICT'
  | 'CONFIRMATION_WINDOW_ACTIVE'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_PATCH'
  | 'INVALID_STATE'
  | 'NOT_FOUND'
  | 'NOT_REVIEWER'
  | 'PLACE_UNAVAILABLE'
  | 'VERSION_CONFLICT';

export class ReportsRepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode) {
    super(code);
    this.name = 'ReportsRepositoryError';
  }
}

interface ReportRow extends RowDataPacket {
  readonly applied_change_summary: unknown;
  readonly created_at: Date | string;
  readonly description: string;
  readonly evidence_reference: string | null;
  readonly evidence_url: string | null;
  readonly id: string;
  readonly proposed_value: unknown;
  readonly report_status: ReportStatus;
  readonly report_type: ReportType;
  readonly reported_by: string;
  readonly resolution: string | null;
  readonly review_claimed_at: Date | string | null;
  readonly reviewed_at: Date | string | null;
  readonly reviewed_by: string | null;
  readonly updated_at: Date | string;
  readonly version: number;
}

interface ReportDetailRow extends ReportRow {
  readonly place_address: string;
  readonly place_id: string;
  readonly place_name: string;
  readonly place_slug: string;
  readonly place_version: number;
  readonly verification_status: VerificationStatus;
}

interface ReportLockRow extends ReportRow {
  readonly place_id: string;
  readonly review_claim_expired: number;
  readonly submitted_place_version: number;
}

interface PlaceLockRow extends RowDataPacket {
  readonly address: string;
  readonly city: string;
  readonly community_confirmation_count: number;
  readonly community_confirmed_at: Date | string | null;
  readonly description: string | null;
  readonly district: string;
  readonly id: string;
  readonly landmark: string | null;
  readonly latitude: number | string;
  readonly longitude: number | string;
  readonly name: string;
  readonly place_status: string;
  readonly postal_code: string | null;
  readonly province: string;
  readonly slug: string;
  readonly verification_status: VerificationStatus;
  readonly verified_at: Date | string | null;
  readonly version: number;
}

interface IdempotencyRow extends RowDataPacket {
  readonly request_hash: string;
  readonly response_body: unknown;
}

interface ConfirmationRow extends RowDataPacket {
  readonly confirmation_type: ConfirmationType;
  readonly created_at: Date | string;
  readonly expires_at: Date | string;
  readonly id: string;
  readonly note: string | null;
  readonly observed_at: Date | string;
  readonly place_id: string;
  readonly updated_at: Date | string;
}

interface VerificationCountRow extends RowDataPacket {
  readonly active_count: number;
  readonly latest_observed_at: Date | string | null;
}

interface CountRow extends RowDataPacket {
  readonly count: number;
}

interface QueueRow extends RowDataPacket {
  readonly category_code: AdminReportQueue['items'][number]['category'];
  readonly created_at: Date | string;
  readonly id: string;
  readonly place_id: string;
  readonly place_name: string;
  readonly place_version: number;
  readonly report_status: ReportStatus;
  readonly report_type: ReportType;
  readonly reporter_email: string;
  readonly reporter_id: string;
  readonly review_claimed_at: Date | string | null;
  readonly reviewer_email: string | null;
  readonly reviewer_id: string | null;
  readonly version: number;
}

interface ActivityRow extends RowDataPacket {
  readonly activity_status: string;
  readonly activity_type: ActivityItem['type'];
  readonly confirmation_type: ConfirmationType | null;
  readonly created_at: Date | string;
  readonly id: string;
  readonly place_id: string | null;
  readonly place_name: string;
  readonly report_type: ReportType | null;
  readonly updated_at: Date | string;
}

interface CategoryCodeRow extends RowDataPacket {
  readonly code: AdminReportQueue['items'][number]['category'];
}

interface FacilityRow extends RowDataPacket {
  readonly code: AdminReportDetail['currentPlace']['facilities'][number]['code'];
  readonly facility_status: AdminReportDetail['currentPlace']['facilities'][number]['status'];
}

interface OperatingHourRow extends RowDataPacket {
  readonly closes_at: string | null;
  readonly day_of_week: number;
  readonly is_24_hours: number | boolean;
  readonly opens_at: string | null;
}

interface AdminMenuRow extends RowDataPacket {
  readonly id: string;
  readonly is_available: number | boolean;
  readonly name: string;
  readonly price_amount: number;
}

interface AuditRow extends RowDataPacket {
  readonly action: string;
  readonly actor_type: GovernanceAuditEntry['actorType'];
  readonly actor_user_id: string | null;
  readonly created_at: Date | string;
  readonly id: string;
  readonly metadata: unknown;
  readonly next_status: string | null;
  readonly previous_status: string | null;
  readonly request_id: string;
  readonly target_id: string;
  readonly target_type: string;
}

interface HistoryRow extends RowDataPacket {
  readonly changed_by: string | null;
  readonly changed_fields: unknown;
  readonly created_at: Date | string;
  readonly id: string;
  readonly new_value: unknown;
  readonly next_version: number;
  readonly previous_value: unknown;
  readonly previous_version: number | null;
  readonly reason: string | null;
  readonly source_id: string | null;
  readonly source_type: string;
}

interface RelatedReportRow extends RowDataPacket {
  readonly created_at: Date | string;
  readonly id: string;
  readonly report_type: ReportType;
}

interface MutationReplay {
  readonly confirmationId?: string;
  readonly reportId?: string;
}

@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async createReport(input: {
    readonly idempotencyKey: string;
    readonly placeId: string;
    readonly report: CreateReportInput;
    readonly requestHash: string;
    readonly requestId: string;
    readonly userId: string;
  }): Promise<PlaceReportDetail> {
    const reportId = await this.withTransaction(async (connection) => {
      const scope = `report:create:${input.userId}:${input.placeId}`;
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.reportId) return replay.reportId;

      const place = await this.lockAvailablePlace(connection, input.placeId);
      if (place.version !== input.report.expectedPlaceVersion) {
        throw new ReportsRepositoryError('VERSION_CONFLICT');
      }
      const id = createUlid();
      await connection.execute(
        `INSERT INTO place_reports (
           id, place_id, reported_by, report_type, description, proposed_value,
           evidence_url, evidence_reference, report_status, submitted_place_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [
          id,
          input.placeId,
          input.userId,
          input.report.reportType,
          input.report.explanation,
          JSON.stringify(input.report.proposedChange),
          input.report.evidenceUrl ?? null,
          input.report.evidenceReference ?? null,
          place.version,
        ],
      );
      await this.insertAudit(connection, {
        action: 'REPORT_SUBMITTED',
        actorId: input.userId,
        actorType: 'USER',
        metadata: {
          placeId: input.placeId,
          reportType: input.report.reportType,
          submittedPlaceVersion: place.version,
        },
        nextStatus: 'PENDING',
        previousStatus: null,
        requestId: input.requestId,
        resourceId: id,
        resourceType: 'REPORT',
      });
      if (seriousReportTypes.has(input.report.reportType)) {
        await this.recalculateVerification(connection, {
          actorId: input.userId,
          actorType: 'USER',
          place,
          requestId: input.requestId,
          sourceId: id,
          sourceType: 'REPORT',
        });
      }
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 201, {
        reportId: id,
      });
      return id;
    });
    const report = await this.findOwnedReport(reportId, input.userId);
    if (!report) throw new Error('Created report could not be reloaded');
    return report;
  }

  async findOwnedReport(reportId: string, userId: string): Promise<PlaceReportDetail | null> {
    const [rows] = await this.pool.execute<ReportDetailRow[]>(
      `${reportDetailColumns}
       FROM place_reports r
       JOIN places p ON p.id = r.place_id
       WHERE r.id = ? AND r.reported_by = ?
       LIMIT 1`,
      [reportId, userId],
    );
    return rows[0] ? mapReportDetail(rows[0]) : null;
  }

  async confirmPlace(input: {
    readonly confirmation: ConfirmationInput;
    readonly idempotencyKey: string;
    readonly placeId: string;
    readonly requestHash: string;
    readonly requestId: string;
    readonly userId: string;
  }): Promise<PlaceConfirmationDetail> {
    const result = await this.withTransaction(async (connection) => {
      const scope = `confirmation:${input.userId}:${input.placeId}`;
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.confirmationId) {
        return { confirmationId: replay.confirmationId, replayed: true };
      }
      const place = await this.lockAvailablePlace(connection, input.placeId);
      if (place.version !== input.confirmation.expectedPlaceVersion) {
        throw new ReportsRepositoryError('VERSION_CONFLICT');
      }
      const [existingRows] = await connection.execute<ConfirmationRow[]>(
        `SELECT id, place_id, confirmation_type, note, observed_at, expires_at, created_at, updated_at
         FROM place_confirmations
         WHERE user_id = ? AND place_id = ? FOR UPDATE`,
        [input.userId, input.placeId],
      );
      const existing = existingRows[0];
      const now = new Date();
      if (existing && !confirmationCanRefresh(new Date(existing.updated_at), now)) {
        throw new ReportsRepositoryError('CONFIRMATION_WINDOW_ACTIVE');
      }

      const confirmationId = existing?.id ?? createUlid();
      const observedAt = new Date(input.confirmation.confirmedAt);
      const expiresAt = confirmationExpiresAt(observedAt);
      if (existing) {
        await connection.execute(
          `UPDATE place_confirmations
           SET confirmation_type = ?, observed_at = ?, expires_at = ?, note = ?, place_version = ?
           WHERE id = ?`,
          [
            input.confirmation.confirmationType,
            observedAt,
            expiresAt,
            input.confirmation.note ?? null,
            place.version,
            confirmationId,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO place_confirmations (
             id, place_id, user_id, confirmation_type, observed_at, expires_at, note, place_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            confirmationId,
            input.placeId,
            input.userId,
            input.confirmation.confirmationType,
            observedAt,
            expiresAt,
            input.confirmation.note ?? null,
            place.version,
          ],
        );
      }
      await this.insertAudit(connection, {
        action: existing ? 'PLACE_CONFIRMATION_REFRESHED' : 'PLACE_CONFIRMED',
        actorId: input.userId,
        actorType: 'USER',
        metadata: {
          confirmationType: input.confirmation.confirmationType,
          placeId: input.placeId,
        },
        nextStatus: 'ACTIVE',
        previousStatus: existing ? 'ACTIVE' : null,
        requestId: input.requestId,
        resourceId: confirmationId,
        resourceType: 'CONFIRMATION',
      });
      await this.recalculateVerification(connection, {
        actorId: input.userId,
        actorType: 'USER',
        place,
        requestId: input.requestId,
        sourceId: confirmationId,
        sourceType: 'CONFIRMATION',
      });
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, {
        confirmationId,
      });
      return { confirmationId, replayed: false };
    });
    const confirmation = await this.findConfirmation(result.confirmationId, input.userId);
    if (!confirmation) throw new Error('Confirmation could not be reloaded');
    return { ...confirmation, replayed: result.replayed };
  }

  async activity(
    userId: string,
    input: ActivityQueryInput,
    cursor: ReportsCursor | undefined,
  ): Promise<UserActivity> {
    const clauses: string[] = [];
    const parameters: (number | string)[] = [userId, userId, userId];
    if (input.type) {
      clauses.push('activity_type = ?');
      parameters.push(input.type);
    }
    if (input.status) {
      clauses.push('activity_status = ?');
      parameters.push(input.status);
    }
    if (cursor) {
      clauses.push(
        `(updated_at < ? OR (updated_at = ? AND id < ?) OR
          (updated_at = ? AND id = ? AND activity_type < ?))`,
      );
      parameters.push(
        cursor.timestamp,
        cursor.timestamp,
        cursor.id,
        cursor.timestamp,
        cursor.id,
        cursor.type ?? '',
      );
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await this.pool.query<ActivityRow[]>(
      `SELECT * FROM (
         SELECT c.id, 'CONTRIBUTION' AS activity_type,
           c.contribution_status AS activity_status, c.created_at, c.updated_at,
           COALESCE(c.merged_place_id, c.target_place_id) AS place_id,
           COALESCE(p.name, JSON_UNQUOTE(JSON_EXTRACT(cp.payload, '$.placeName'))) AS place_name,
           NULL AS report_type, NULL AS confirmation_type
         FROM contributions c
         JOIN contribution_payloads cp ON cp.contribution_id = c.id
         LEFT JOIN places p ON p.id = COALESCE(c.merged_place_id, c.target_place_id)
         WHERE c.submitted_by = ?
         UNION ALL
         SELECT r.id, 'REPORT', r.report_status, r.created_at, r.updated_at,
           r.place_id, p.name, r.report_type, NULL
         FROM place_reports r
         JOIN places p ON p.id = r.place_id
         WHERE r.reported_by = ?
         UNION ALL
         SELECT pc.id, 'CONFIRMATION',
           IF(pc.expires_at > CURRENT_TIMESTAMP(3), 'ACTIVE', 'EXPIRED'),
           pc.created_at, pc.updated_at, pc.place_id, p.name, NULL, pc.confirmation_type
         FROM place_confirmations pc
         JOIN places p ON p.id = pc.place_id
         WHERE pc.user_id = ?
       ) activity
       ${where}
       ORDER BY updated_at DESC, id DESC, activity_type DESC
       LIMIT ?`,
      [...parameters, input.limit + 1],
    );
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit).map(mapActivityRow),
      pagination: { hasMore, nextCursor: null },
    };
  }

  async listAdminReports(
    input: AdminReportQueueInput,
    cursor: ReportsCursor | undefined,
  ): Promise<AdminReportQueue> {
    const clauses = ['p.deleted_at IS NULL'];
    const parameters: (number | string)[] = [];
    if (input.status) {
      clauses.push('r.report_status = ?');
      parameters.push(input.status);
    }
    if (input.reportType) {
      clauses.push('r.report_type = ?');
      parameters.push(input.reportType);
    }
    if (input.category) {
      clauses.push('category.code = ?');
      parameters.push(input.category);
    }
    if (input.from) {
      clauses.push('r.created_at >= ?');
      parameters.push(`${input.from} 00:00:00.000`);
    }
    if (input.to) {
      clauses.push('r.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      parameters.push(`${input.to} 00:00:00.000`);
    }
    if (input.search) {
      clauses.push(
        `(LOWER(p.name) LIKE CONCAT('%', ?, '%') ESCAPE '!' OR
          LOWER(p.address) LIKE CONCAT('%', ?, '%') ESCAPE '!')`,
      );
      const search = escapeLikePattern(input.search.toLocaleLowerCase('id-ID'));
      parameters.push(search, search);
    }
    if (input.reviewer === 'CLAIMED') clauses.push('r.reviewed_by IS NOT NULL');
    if (input.reviewer === 'UNCLAIMED') clauses.push('r.reviewed_by IS NULL');
    if (input.reviewer === 'EXPIRED') {
      clauses.push('r.review_claimed_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE)');
    }
    if (cursor) {
      clauses.push(
        input.sort === 'SUBMITTED_ASC'
          ? '(r.created_at > ? OR (r.created_at = ? AND r.id > ?))'
          : '(r.created_at < ? OR (r.created_at = ? AND r.id < ?))',
      );
      parameters.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    const order =
      input.sort === 'SUBMITTED_ASC'
        ? 'ORDER BY r.created_at ASC, r.id ASC'
        : 'ORDER BY r.created_at DESC, r.id DESC';
    const [rows] = await this.pool.query<QueueRow[]>(
      `SELECT r.id, r.report_type, r.report_status, r.created_at, r.version,
         r.reviewed_by AS reviewer_id, r.review_claimed_at,
         reviewer.email AS reviewer_email, reporter.id AS reporter_id,
         reporter.email AS reporter_email, p.id AS place_id, p.name AS place_name,
         p.version AS place_version, category.code AS category_code
       FROM place_reports r
       JOIN places p ON p.id = r.place_id
       JOIN users reporter ON reporter.id = r.reported_by
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       JOIN place_categories pc ON pc.place_id = p.id AND pc.is_primary = true
       JOIN categories category ON category.id = pc.category_id
       WHERE ${clauses.join(' AND ')}
       ${order}
       LIMIT ?`,
      [...parameters, input.limit + 1],
    );
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit).map(mapQueueRow),
      pagination: { hasMore, nextCursor: null },
    };
  }

  async findAdminReport(reportId: string): Promise<AdminReportDetail | null> {
    return this.findAdminReportWithExecutor(this.pool, reportId);
  }

  async claimReport(input: {
    readonly adminId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reportId: string;
    readonly requestHash: string;
    readonly requestId: string;
  }): Promise<{ readonly reportId: string; readonly replayed: boolean }> {
    return this.withTransaction(async (connection) => {
      const scope = `report:claim:${input.adminId}:${input.reportId}`;
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.reportId) return { reportId: replay.reportId, replayed: true };

      const report = await this.lockReport(connection, input.reportId);
      if (!report) throw new ReportsRepositoryError('NOT_FOUND');
      if (report.version !== input.expectedVersion) {
        throw new ReportsRepositoryError('VERSION_CONFLICT');
      }
      let previousStatus: ReportStatus;
      let action: string;
      if (report.report_status === 'PENDING') {
        previousStatus = 'PENDING';
        action = 'REPORT_CLAIMED';
      } else if (report.report_status === 'IN_REVIEW' && report.review_claim_expired === 1) {
        previousStatus = 'IN_REVIEW';
        action = 'REPORT_RECLAIMED';
      } else if (report.report_status === 'IN_REVIEW' && report.reviewed_by === input.adminId) {
        await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, {
          reportId: report.id,
        });
        return { reportId: report.id, replayed: true };
      } else {
        throw new ReportsRepositoryError('CLAIM_CONFLICT');
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE place_reports
         SET report_status = 'IN_REVIEW', reviewed_by = ?,
           review_claimed_at = CURRENT_TIMESTAMP(3), reviewed_at = NULL,
           resolution = NULL, version = version + 1
         WHERE id = ? AND version = ?`,
        [input.adminId, input.reportId, input.expectedVersion],
      );
      if (updated.affectedRows !== 1) throw new ReportsRepositoryError('VERSION_CONFLICT');
      await this.insertAudit(connection, {
        action,
        actorId: input.adminId,
        actorType: 'ADMIN',
        metadata: {
          placeId: report.place_id,
          reportType: report.report_type,
          reportVersion: input.expectedVersion + 1,
        },
        nextStatus: 'IN_REVIEW',
        previousStatus,
        requestId: input.requestId,
        resourceId: input.reportId,
        resourceType: 'REPORT',
      });
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, {
        reportId: input.reportId,
      });
      return { reportId: input.reportId, replayed: false };
    });
  }

  async applyReport(input: {
    readonly adminId: string;
    readonly application: ApplyReportInput;
    readonly idempotencyKey: string;
    readonly reportId: string;
    readonly requestHash: string;
    readonly requestId: string;
  }): Promise<{
    readonly placeSlug: string;
    readonly reportId: string;
    readonly replayed: boolean;
  }> {
    return this.withTransaction(async (connection) => {
      const scope = `report:apply:${input.adminId}:${input.reportId}`;
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.reportId) {
        const existing = await this.lockReport(connection, replay.reportId);
        if (!existing) throw new Error('Applied report replay points to missing data');
        const place = await this.lockPlace(connection, existing.place_id);
        return { placeSlug: place.slug, reportId: replay.reportId, replayed: true };
      }

      const report = await this.lockReport(connection, input.reportId);
      this.assertDecisionAllowed(report, input.adminId, input.application.expectedReportVersion);
      const place = await this.lockPlace(connection, report.place_id);
      if (place.version !== input.application.expectedPlaceVersion) {
        throw new ReportsRepositoryError('VERSION_CONFLICT');
      }
      if (input.application.approvedPatch.kind !== report.report_type) {
        throw new ReportsRepositoryError('INVALID_PATCH');
      }
      const changedFields = await this.applyApprovedPatch(
        connection,
        place,
        input.application.approvedPatch,
      );
      const [pendingSeriousRows] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS count
         FROM place_reports
         WHERE place_id = ? AND id <> ?
           AND report_status IN ('PENDING', 'IN_REVIEW')
           AND report_type IN (?, ?, ?, ?)`,
        [place.id, input.reportId, ...seriousReportTypeList],
      );
      const nextVerificationStatus =
        Number(pendingSeriousRows[0]?.count ?? 0) > 0 ? 'STALE' : 'ADMIN_VERIFIED';
      const [placeUpdate] = await connection.execute<ResultSetHeader>(
        `UPDATE places
         SET verification_status = ?,
           verified_at = CURRENT_TIMESTAMP(3), verified_by = ?,
           community_confirmed_at = NULL, community_confirmation_count = 0,
           data_freshness_at = CURRENT_TIMESTAMP(3), version = version + 1
         WHERE id = ? AND version = ?`,
        [nextVerificationStatus, input.adminId, place.id, input.application.expectedPlaceVersion],
      );
      if (placeUpdate.affectedRows !== 1) throw new ReportsRepositoryError('VERSION_CONFLICT');
      const nextPlace = await this.lockPlace(connection, place.id);
      const allChangedFields = [
        ...new Set([
          ...changedFields,
          'dataFreshnessAt',
          ...(place.verification_status === nextPlace.verification_status
            ? []
            : ['verificationStatus']),
          ...(Number(place.community_confirmation_count) === 0
            ? []
            : ['communityConfirmationCount']),
        ]),
      ];
      const before = buildSafePlaceSnapshot(place);
      const after = buildSafePlaceSnapshot(nextPlace);
      await this.insertPlaceHistory(connection, {
        actorId: input.adminId,
        after,
        before,
        changedFields: allChangedFields,
        nextVersion: nextPlace.version,
        placeId: place.id,
        previousVersion: place.version,
        reason: input.application.resolution,
        sourceId: input.reportId,
        sourceType: 'REPORT',
      });
      const summary = {
        changedFields: allChangedFields,
        nextPlaceVersion: nextPlace.version,
        previousPlaceVersion: place.version,
      };
      const [reportUpdate] = await connection.execute<ResultSetHeader>(
        `UPDATE place_reports
         SET report_status = 'APPLIED', reviewed_at = CURRENT_TIMESTAMP(3),
           resolution = ?, applied_change_summary = ?, version = version + 1
         WHERE id = ? AND report_status = 'IN_REVIEW' AND reviewed_by = ? AND version = ?`,
        [
          input.application.resolution,
          JSON.stringify(summary),
          input.reportId,
          input.adminId,
          input.application.expectedReportVersion,
        ],
      );
      if (reportUpdate.affectedRows !== 1) throw new ReportsRepositoryError('VERSION_CONFLICT');
      await this.insertAudit(connection, {
        action: 'REPORT_APPLIED',
        actorId: input.adminId,
        actorType: 'ADMIN',
        metadata: {
          changedFields: allChangedFields,
          placeId: place.id,
          reportType: report.report_type,
          reportVersion: input.application.expectedReportVersion + 1,
        },
        nextStatus: 'APPLIED',
        previousStatus: 'IN_REVIEW',
        reason: input.application.resolution,
        requestId: input.requestId,
        resourceId: input.reportId,
        resourceType: 'REPORT',
      });
      await this.insertAudit(connection, {
        action: 'PLACE_UPDATED_FROM_REPORT',
        actorId: input.adminId,
        actorType: 'ADMIN',
        metadata: {
          changedFields: allChangedFields,
          reportType: report.report_type,
          sourceReportId: input.reportId,
        },
        nextStatus: nextPlace.verification_status,
        previousStatus: place.verification_status,
        reason: input.application.resolution,
        requestId: input.requestId,
        resourceId: place.id,
        resourceType: 'PLACE',
      });
      if (place.verification_status !== nextPlace.verification_status) {
        await this.insertAudit(connection, {
          action: 'PLACE_VERIFICATION_CHANGED',
          actorId: input.adminId,
          actorType: 'ADMIN',
          metadata: { placeId: place.id, sourceReportId: input.reportId },
          nextStatus: nextPlace.verification_status,
          previousStatus: place.verification_status,
          requestId: input.requestId,
          resourceId: place.id,
          resourceType: 'PLACE',
        });
      }
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, {
        reportId: input.reportId,
      });
      return { placeSlug: place.slug, reportId: input.reportId, replayed: false };
    });
  }

  async rejectReport(input: {
    readonly adminId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly reportId: string;
    readonly requestHash: string;
    readonly requestId: string;
    readonly resolution: string;
  }): Promise<{ readonly reportId: string; readonly replayed: boolean }> {
    return this.withTransaction(async (connection) => {
      const scope = `report:reject:${input.adminId}:${input.reportId}`;
      const replay = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (replay.reportId) return { reportId: replay.reportId, replayed: true };

      const report = await this.lockReport(connection, input.reportId);
      this.assertDecisionAllowed(report, input.adminId, input.expectedVersion);
      const place = await this.lockPlace(connection, report.place_id);
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE place_reports
         SET report_status = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP(3),
           resolution = ?, applied_change_summary = NULL, version = version + 1
         WHERE id = ? AND report_status = 'IN_REVIEW' AND reviewed_by = ? AND version = ?`,
        [input.resolution, input.reportId, input.adminId, input.expectedVersion],
      );
      if (updated.affectedRows !== 1) throw new ReportsRepositoryError('VERSION_CONFLICT');
      await this.insertAudit(connection, {
        action: 'REPORT_REJECTED',
        actorId: input.adminId,
        actorType: 'ADMIN',
        metadata: {
          placeId: report.place_id,
          reportType: report.report_type,
          reportVersion: input.expectedVersion + 1,
        },
        nextStatus: 'REJECTED',
        previousStatus: 'IN_REVIEW',
        reason: input.resolution,
        requestId: input.requestId,
        resourceId: input.reportId,
        resourceType: 'REPORT',
      });
      await this.recalculateVerification(connection, {
        actorId: input.adminId,
        actorType: 'ADMIN',
        place,
        requestId: input.requestId,
        sourceId: input.reportId,
        sourceType: 'REPORT',
      });
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, {
        reportId: input.reportId,
      });
      return { reportId: input.reportId, replayed: false };
    });
  }

  async listAuditLogs(
    input: AuditLogQueryInput,
    cursor: ReportsCursor | undefined,
  ): Promise<AuditLogPage> {
    const clauses: string[] = [];
    const parameters: (number | string)[] = [];
    if (input.action) {
      clauses.push('action = ?');
      parameters.push(input.action);
    }
    if (input.resourceType) {
      clauses.push('target_type = ?');
      parameters.push(input.resourceType);
    }
    if (input.resourceId) {
      clauses.push('target_id = ?');
      parameters.push(input.resourceId);
    }
    if (cursor) {
      clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      parameters.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await this.pool.query<AuditRow[]>(
      `SELECT id, actor_type, actor_user_id, action, target_type, target_id,
         request_id, previous_status, next_status, metadata, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...parameters, input.limit + 1],
    );
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit).map(mapAuditRow),
      pagination: { hasMore, nextCursor: null },
    };
  }

  private async findConfirmation(
    confirmationId: string,
    userId: string,
  ): Promise<Omit<PlaceConfirmationDetail, 'replayed'> | null> {
    const [rows] = await this.pool.execute<
      (ConfirmationRow &
        ReportPlaceColumns & { readonly verification_status: VerificationStatus })[]
    >(
      `SELECT pc.id, pc.place_id, pc.confirmation_type, pc.note, pc.observed_at,
         pc.expires_at, pc.created_at, pc.updated_at,
         p.name AS place_name, p.slug AS place_slug, p.address AS place_address,
         p.version AS place_version, p.verification_status
       FROM place_confirmations pc
       JOIN places p ON p.id = pc.place_id
       WHERE pc.id = ? AND pc.user_id = ?
       LIMIT 1`,
      [confirmationId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      confirmedAt: isoDate(row.observed_at),
      confirmationType: row.confirmation_type,
      expiresAt: isoDate(row.expires_at),
      id: row.id,
      note: row.note,
      place: mapReportPlace(row),
      verificationStatus: row.verification_status,
    };
  }

  private async findAdminReportWithExecutor(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    reportId: string,
  ): Promise<AdminReportDetail | null> {
    const [rows] = await executor.execute<
      (ReportDetailRow & {
        readonly reporter_email: string;
        readonly reporter_id: string;
        readonly reviewer_email: string | null;
        readonly reviewer_id: string | null;
      })[]
    >(
      `${reportDetailColumns},
         reporter.id AS reporter_id, reporter.email AS reporter_email,
         reviewer.id AS reviewer_id, reviewer.email AS reviewer_email
       FROM place_reports r
       JOIN places p ON p.id = r.place_id
       JOIN users reporter ON reporter.id = r.reported_by
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       WHERE r.id = ?
       LIMIT 1`,
      [reportId],
    );
    const row = rows[0];
    if (!row) return null;
    const [place, audit, history, related] = await Promise.all([
      this.loadCurrentPlace(executor, row.place_id),
      this.loadReportAudit(executor, reportId, row.place_id),
      this.loadPlaceHistory(executor, row.place_id, reportId),
      this.loadRelatedReports(executor, row.place_id, reportId),
    ]);
    if (!place) return null;
    const report = mapReportDetail(row);
    const reportHistory = audit.filter(
      (entry) => entry.resourceType === 'REPORT' && entry.resourceId === reportId,
    );
    return {
      ...report,
      audit,
      currentPlace: place,
      currentReviewer: mapReviewer({
        claimedAt: row.review_claimed_at,
        email: row.reviewer_email,
        id: row.reviewer_id,
      }),
      history: reportHistory,
      placeHistory: history,
      relatedPendingReports: related,
      reporter: { id: row.reporter_id, maskedEmail: maskEmail(row.reporter_email) },
    };
  }

  private async loadCurrentPlace(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    placeId: string,
  ): Promise<AdminReportDetail['currentPlace'] | null> {
    const [placeRows] = await executor.execute<PlaceLockRow[]>(
      `${placeSelect}
       WHERE p.id = ?
       LIMIT 1`,
      [placeId],
    );
    const place = placeRows[0];
    if (!place) return null;
    const [categoryRows, facilityRows, menuRows, operatingHourRows] = await Promise.all([
      executor.execute<CategoryCodeRow[]>(
        `SELECT c.code
         FROM place_categories pc
         JOIN categories c ON c.id = pc.category_id
         WHERE pc.place_id = ?
         ORDER BY pc.is_primary DESC, c.code ASC`,
        [placeId],
      ),
      executor.execute<FacilityRow[]>(
        `SELECT f.code, pf.facility_status
         FROM place_facilities pf
         JOIN facilities f ON f.id = pf.facility_id
         WHERE pf.place_id = ?
         ORDER BY f.code ASC`,
        [placeId],
      ),
      executor.execute<AdminMenuRow[]>(
        `SELECT id, name, price_amount, is_available
         FROM menus
         WHERE place_id = ? AND deleted_at IS NULL
         ORDER BY is_main_item DESC, sort_order ASC, price_amount ASC, id ASC`,
        [placeId],
      ),
      executor.execute<OperatingHourRow[]>(
        `SELECT day_of_week, opens_at, closes_at, is_24_hours
         FROM operating_hours
         WHERE place_id = ?
         ORDER BY day_of_week ASC, sequence ASC`,
        [placeId],
      ),
    ]);
    return {
      ...mapReportPlaceFromPlace(place),
      categories: categoryRows[0].map((row) => row.code),
      description: place.description,
      facilities: facilityRows[0].map((row) => ({
        code: row.code,
        status: row.facility_status,
      })),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      menus: menuRows[0].map((row) => ({
        id: row.id,
        isAvailable: Boolean(row.is_available),
        name: row.name,
        priceAmount: Number(row.price_amount),
      })),
      operatingHours: operatingHourRows[0].map((row) => ({
        closesAt: normalizeTime(row.closes_at),
        dayOfWeek: Number(row.day_of_week),
        is24Hours: Boolean(row.is_24_hours),
        isClosed: false,
        opensAt: normalizeTime(row.opens_at),
      })),
    };
  }

  private async loadReportAudit(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    reportId: string,
    placeId: string,
  ): Promise<readonly GovernanceAuditEntry[]> {
    const [rows] = await executor.execute<AuditRow[]>(
      `SELECT id, actor_type, actor_user_id, action, target_type, target_id,
         request_id, previous_status, next_status, metadata, created_at
       FROM audit_logs
       WHERE (target_type = 'REPORT' AND target_id = ?)
          OR (target_type = 'PLACE' AND target_id = ?
              AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.sourceReportId')) = ?)
       ORDER BY created_at ASC, id ASC
       LIMIT 100`,
      [reportId, placeId, reportId],
    );
    return rows.map(mapAuditRow);
  }

  private async loadPlaceHistory(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    placeId: string,
    reportId: string,
  ): Promise<readonly PlaceHistoryEntry[]> {
    const [rows] = await executor.execute<HistoryRow[]>(
      `SELECT id, changed_by, source_type, source_id, previous_version, next_version,
         changed_fields, previous_value, new_value, reason, created_at
       FROM place_change_history
       WHERE place_id = ? OR (source_type = 'REPORT' AND source_id = ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 30`,
      [placeId, reportId],
    );
    return rows.map(mapHistoryRow);
  }

  private async loadRelatedReports(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    placeId: string,
    reportId: string,
  ): Promise<AdminReportDetail['relatedPendingReports']> {
    const [rows] = await executor.execute<RelatedReportRow[]>(
      `SELECT id, report_type, created_at
       FROM place_reports
       WHERE place_id = ? AND id <> ? AND report_status IN ('PENDING', 'IN_REVIEW')
       ORDER BY created_at DESC, id DESC
       LIMIT 10`,
      [placeId, reportId],
    );
    return rows.map((row) => ({
      id: row.id,
      reportType: row.report_type,
      submittedAt: isoDate(row.created_at),
    }));
  }

  private async applyApprovedPatch(
    connection: PoolConnection,
    place: PlaceLockRow,
    patch: ApprovedPlacePatch,
  ): Promise<readonly string[]> {
    switch (patch.kind) {
      case 'PRICE_CHANGED': {
        if (patch.menuId) {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE menus
             SET name = COALESCE(?, name), price_amount = COALESCE(?, price_amount),
               version = version + 1
             WHERE id = ? AND place_id = ? AND deleted_at IS NULL`,
            [patch.menuName ?? null, patch.priceAmount ?? null, patch.menuId, place.id],
          );
          if (result.affectedRows !== 1) throw new ReportsRepositoryError('INVALID_PATCH');
        } else {
          if (patch.menuName === undefined || patch.priceAmount === undefined) {
            throw new ReportsRepositoryError('INVALID_PATCH');
          }
          await connection.execute(
            `INSERT INTO menus (
               id, place_id, name, price_amount, is_main_item, is_available, sort_order
             ) VALUES (?, ?, ?, ?, true, true, 0)`,
            [createUlid(), place.id, patch.menuName, patch.priceAmount],
          );
        }
        return ['menus'];
      }
      case 'HOURS_CHANGED': {
        const patchedDays = [...new Set(patch.operatingHours.map((hours) => hours.dayOfWeek))];
        const dayPlaceholders = patchedDays.map(() => '?').join(', ');
        await connection.execute(
          `DELETE FROM operating_hours
           WHERE place_id = ? AND day_of_week IN (${dayPlaceholders})`,
          [place.id, ...patchedDays],
        );
        const nextSequenceByDay = new Map<number, number>();
        for (const hours of patch.operatingHours) {
          if (hours.isClosed) continue;
          const sequence = nextSequenceByDay.get(hours.dayOfWeek) ?? 0;
          await connection.execute(
            `INSERT INTO operating_hours (
               id, place_id, day_of_week, sequence, opens_at, closes_at, is_24_hours
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              createUlid(),
              place.id,
              hours.dayOfWeek,
              sequence,
              hours.opensAt ? `${hours.opensAt}:00` : null,
              hours.closesAt ? `${hours.closesAt}:00` : null,
              hours.is24Hours,
            ],
          );
          nextSequenceByDay.set(hours.dayOfWeek, sequence + 1);
        }
        return ['operatingHours'];
      }
      case 'LOCATION_INCORRECT': {
        await connection.execute(
          `UPDATE places
           SET address = COALESCE(?, address), district = COALESCE(?, district),
             city = COALESCE(?, city), province = COALESCE(?, province),
             postal_code = CASE WHEN ? THEN ? ELSE postal_code END
           WHERE id = ?`,
          [
            patch.address ?? null,
            patch.district ?? null,
            patch.city ?? null,
            patch.province ?? null,
            patch.postalCode !== undefined,
            patch.postalCode ?? null,
            place.id,
          ],
        );
        if (patch.latitude !== undefined && patch.longitude !== undefined) {
          await connection.execute(
            `UPDATE places
             SET location = ST_GeomFromText(?, 4326, 'axis-order=long-lat')
             WHERE id = ?`,
            [`POINT(${patch.longitude} ${patch.latitude})`, place.id],
          );
        }
        return [
          ...(patch.address === undefined ? [] : ['address']),
          ...(patch.district === undefined ? [] : ['district']),
          ...(patch.city === undefined ? [] : ['city']),
          ...(patch.province === undefined ? [] : ['province']),
          ...(patch.postalCode === undefined ? [] : ['postalCode']),
          ...(patch.latitude === undefined ? [] : ['location']),
        ];
      }
      case 'CATEGORY_INCORRECT': {
        const [categories] = await connection.execute<(RowDataPacket & { readonly id: string })[]>(
          'SELECT id FROM categories WHERE code = ? LIMIT 1',
          [patch.categoryCode],
        );
        const categoryId = categories[0]?.id;
        if (!categoryId) throw new ReportsRepositoryError('INVALID_PATCH');
        await connection.execute(
          'UPDATE place_categories SET is_primary = false WHERE place_id = ?',
          [place.id],
        );
        await connection.execute(
          `INSERT INTO place_categories (place_id, category_id, is_primary)
           VALUES (?, ?, true)
           ON DUPLICATE KEY UPDATE is_primary = true`,
          [place.id, categoryId],
        );
        return ['categories'];
      }
      case 'FACILITY_CHANGED': {
        const [facilities] = await connection.execute<(RowDataPacket & { readonly id: string })[]>(
          'SELECT id FROM facilities WHERE code = ? LIMIT 1',
          [patch.facilityCode],
        );
        const facilityId = facilities[0]?.id;
        if (!facilityId) throw new ReportsRepositoryError('INVALID_PATCH');
        await connection.execute(
          `INSERT INTO place_facilities (
             place_id, facility_id, facility_status, confirmed_at
           ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE facility_status = VALUES(facility_status),
             confirmed_at = CURRENT_TIMESTAMP(3)`,
          [place.id, facilityId, patch.status],
        );
        return ['facilities'];
      }
      case 'TEMPORARILY_CLOSED':
      case 'PERMANENTLY_CLOSED': {
        await connection.execute('UPDATE places SET place_status = ? WHERE id = ?', [
          patch.placeStatus,
          place.id,
        ]);
        return ['placeStatus'];
      }
      case 'DUPLICATE_PLACE': {
        if (patch.duplicatePlaceId === place.id) throw new ReportsRepositoryError('INVALID_PATCH');
        const [targets] = await connection.execute<CountRow[]>(
          `SELECT COUNT(*) AS count
           FROM places
           WHERE id = ? AND deleted_at IS NULL AND place_status <> 'ARCHIVED'`,
          [patch.duplicatePlaceId],
        );
        if (Number(targets[0]?.count ?? 0) !== 1) {
          throw new ReportsRepositoryError('INVALID_PATCH');
        }
        await connection.execute("UPDATE places SET place_status = 'ARCHIVED' WHERE id = ?", [
          place.id,
        ]);
        return ['placeStatus'];
      }
      case 'OTHER': {
        await connection.execute(
          `UPDATE places
           SET name = COALESCE(?, name),
             description = CASE WHEN ? THEN ? ELSE description END,
             landmark = CASE WHEN ? THEN ? ELSE landmark END
           WHERE id = ?`,
          [
            patch.name ?? null,
            patch.description !== undefined,
            patch.description ?? null,
            patch.landmark !== undefined,
            patch.landmark ?? null,
            place.id,
          ],
        );
        return [
          ...(patch.name === undefined ? [] : ['name']),
          ...(patch.description === undefined ? [] : ['description']),
          ...(patch.landmark === undefined ? [] : ['landmark']),
        ];
      }
    }
  }

  private async recalculateVerification(
    connection: PoolConnection,
    input: {
      readonly actorId: string;
      readonly actorType: 'ADMIN' | 'USER';
      readonly place: PlaceLockRow;
      readonly requestId: string;
      readonly sourceId: string;
      readonly sourceType: 'CONFIRMATION' | 'REPORT';
    },
  ): Promise<PlaceLockRow> {
    const [confirmationRows] = await connection.execute<VerificationCountRow[]>(
      `SELECT COUNT(DISTINCT pc.user_id) AS active_count,
         MAX(pc.observed_at) AS latest_observed_at
       FROM place_confirmations pc
       WHERE pc.place_id = ? AND pc.confirmation_type = 'STILL_VALID'
         AND pc.expires_at > CURRENT_TIMESTAMP(3)
         AND pc.observed_at >= (
           SELECT p.data_freshness_at FROM places p WHERE p.id = pc.place_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM contributions c
           WHERE c.submitted_by = pc.user_id AND c.merged_place_id = pc.place_id
         )`,
      [input.place.id],
    );
    const [pendingRows] = await connection.query<CountRow[]>(
      `SELECT COUNT(*) AS count
       FROM place_reports
       WHERE place_id = ? AND report_status IN ('PENDING', 'IN_REVIEW')
         AND report_type IN (?, ?, ?, ?)`,
      [input.place.id, ...seriousReportTypeList],
    );
    const confirmation = confirmationRows[0];
    const activeCount = Number(confirmation?.active_count ?? 0);
    const latest = confirmation?.latest_observed_at
      ? new Date(confirmation.latest_observed_at)
      : null;
    const nextStatus = calculateVerificationStatus({
      activeConfirmationCount: activeCount,
      adminVerifiedAt: input.place.verified_at ? new Date(input.place.verified_at) : null,
      hasPendingSeriousReport: Number(pendingRows[0]?.count ?? 0) > 0,
      latestConfirmationAt: latest,
      now: new Date(),
    });
    const nextCommunityAt = nextStatus === 'COMMUNITY_CONFIRMED' && latest ? latest : null;
    const currentCommunityAt = input.place.community_confirmed_at
      ? new Date(input.place.community_confirmed_at)
      : null;
    const changed =
      nextStatus !== input.place.verification_status ||
      activeCount !== Number(input.place.community_confirmation_count) ||
      (nextCommunityAt?.getTime() ?? null) !== (currentCommunityAt?.getTime() ?? null);
    if (!changed) return input.place;

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE places
       SET verification_status = ?, community_confirmation_count = ?,
         community_confirmed_at = ?, version = version + 1
       WHERE id = ? AND version = ?`,
      [nextStatus, activeCount, nextCommunityAt, input.place.id, input.place.version],
    );
    if (result.affectedRows !== 1) throw new ReportsRepositoryError('VERSION_CONFLICT');
    const nextPlace = await this.lockPlace(connection, input.place.id);
    const changedFields = [
      ...(nextStatus === input.place.verification_status ? [] : ['verificationStatus']),
      'communityConfirmationCount',
    ];
    await this.insertPlaceHistory(connection, {
      actorId: input.actorId,
      after: buildSafePlaceSnapshot(nextPlace),
      before: buildSafePlaceSnapshot(input.place),
      changedFields,
      nextVersion: nextPlace.version,
      placeId: input.place.id,
      previousVersion: input.place.version,
      reason: null,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    });
    if (nextStatus !== input.place.verification_status) {
      await this.insertAudit(connection, {
        action: 'PLACE_VERIFICATION_CHANGED',
        actorId: input.actorId,
        actorType: input.actorType,
        metadata: {
          confirmationCount: activeCount,
          placeId: input.place.id,
          ...(input.sourceType === 'REPORT' ? { sourceReportId: input.sourceId } : {}),
        },
        nextStatus,
        previousStatus: input.place.verification_status,
        requestId: input.requestId,
        resourceId: input.place.id,
        resourceType: 'PLACE',
      });
    }
    return nextPlace;
  }

  private async lockAvailablePlace(
    connection: PoolConnection,
    placeId: string,
  ): Promise<PlaceLockRow> {
    const place = await this.lockPlace(connection, placeId);
    if (place.place_status !== 'ACTIVE') {
      throw new ReportsRepositoryError('PLACE_UNAVAILABLE');
    }
    return place;
  }

  private async lockPlace(connection: PoolConnection, placeId: string): Promise<PlaceLockRow> {
    const [rows] = await connection.execute<PlaceLockRow[]>(
      `${placeSelect}
       WHERE p.id = ? AND p.deleted_at IS NULL
       FOR UPDATE`,
      [placeId],
    );
    const place = rows[0];
    if (!place) throw new ReportsRepositoryError('NOT_FOUND');
    return place;
  }

  private async lockReport(
    connection: PoolConnection,
    reportId: string,
  ): Promise<ReportLockRow | null> {
    const [rows] = await connection.execute<ReportLockRow[]>(
      `SELECT r.id, r.place_id, r.reported_by, r.report_type, r.description,
         r.proposed_value, r.evidence_url, r.evidence_reference, r.report_status,
         r.submitted_place_version, r.reviewed_by, r.review_claimed_at, r.reviewed_at,
         r.resolution, r.applied_change_summary, r.version, r.created_at, r.updated_at,
         (r.review_claimed_at IS NOT NULL AND
           r.review_claimed_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE))
           AS review_claim_expired
       FROM place_reports r
       WHERE r.id = ?
       FOR UPDATE`,
      [reportId],
    );
    return rows[0] ?? null;
  }

  private assertDecisionAllowed(
    report: ReportLockRow | null,
    adminId: string,
    expectedVersion: number,
  ): asserts report is ReportLockRow {
    if (!report) throw new ReportsRepositoryError('NOT_FOUND');
    if (report.report_status !== 'IN_REVIEW') {
      throw new ReportsRepositoryError('INVALID_STATE');
    }
    if (report.reviewed_by !== adminId || report.review_claim_expired === 1) {
      throw new ReportsRepositoryError('NOT_REVIEWER');
    }
    if (report.version !== expectedVersion) {
      throw new ReportsRepositoryError('VERSION_CONFLICT');
    }
  }

  private async insertPlaceHistory(
    connection: PoolConnection,
    input: {
      readonly actorId: string;
      readonly after: Readonly<Record<string, unknown>>;
      readonly before: Readonly<Record<string, unknown>> | null;
      readonly changedFields: readonly string[];
      readonly nextVersion: number;
      readonly placeId: string;
      readonly previousVersion: number | null;
      readonly reason: string | null;
      readonly sourceId: string;
      readonly sourceType: 'CONFIRMATION' | 'REPORT';
    },
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO place_change_history (
         id, place_id, changed_by, source_type, source_id, change_type,
         previous_version, next_version, changed_fields, previous_value, new_value, reason
       ) VALUES (?, ?, ?, ?, ?, 'PLACE_UPDATED', ?, ?, ?, ?, ?, ?)`,
      [
        createUlid(),
        input.placeId,
        input.actorId,
        input.sourceType,
        input.sourceId,
        input.previousVersion,
        input.nextVersion,
        JSON.stringify(input.changedFields),
        input.before ? JSON.stringify(input.before) : null,
        JSON.stringify(input.after),
        input.reason,
      ],
    );
  }

  private async insertAudit(
    connection: PoolConnection,
    input: {
      readonly action: string;
      readonly actorId: string;
      readonly actorType: 'ADMIN' | 'USER';
      readonly metadata: Readonly<Record<string, unknown>>;
      readonly nextStatus: string | null;
      readonly previousStatus: string | null;
      readonly reason?: string;
      readonly requestId: string;
      readonly resourceId: string;
      readonly resourceType: string;
    },
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO audit_logs (
         id, actor_type, actor_user_id, actor_role, action, target_type, target_id,
         request_id, previous_status, next_status, metadata, reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createUlid(),
        input.actorType,
        input.actorId,
        input.actorType,
        input.action,
        input.resourceType,
        input.resourceId,
        input.requestId,
        input.previousStatus,
        input.nextStatus,
        JSON.stringify(sanitizeAuditMetadata(input.metadata)),
        input.reason ?? null,
      ],
    );
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
      `SELECT request_hash, response_body
       FROM idempotency_keys
       WHERE scope = ? AND idempotency_key = ?
       FOR UPDATE`,
      [scope, idempotencyKey],
    );
    const row = rows[0];
    if (!row) throw new Error('Idempotency key could not be claimed');
    if (row.request_hash !== requestHash) {
      throw new ReportsRepositoryError('IDEMPOTENCY_KEY_REUSED');
    }
    return parseMutationReplay(row.response_body);
  }

  private async completeIdempotencyKey(
    connection: PoolConnection,
    scope: string,
    idempotencyKey: string,
    responseStatus: number,
    responseBody: MutationReplay,
  ): Promise<void> {
    await connection.execute(
      `UPDATE idempotency_keys
       SET response_status = ?, response_body = ?, locked_until = NULL
       WHERE scope = ? AND idempotency_key = ?`,
      [responseStatus, JSON.stringify(responseBody), scope, idempotencyKey],
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

interface ReportPlaceColumns {
  readonly place_address: string;
  readonly place_id: string;
  readonly place_name: string;
  readonly place_slug: string;
  readonly place_version: number;
}

const reportDetailColumns = `SELECT r.id, r.reported_by, r.report_type, r.description,
  r.proposed_value, r.evidence_url, r.evidence_reference, r.report_status,
  r.reviewed_by, r.review_claimed_at, r.reviewed_at, r.resolution,
  r.applied_change_summary, r.version, r.created_at, r.updated_at,
  p.id AS place_id, p.name AS place_name, p.slug AS place_slug,
  p.address AS place_address, p.version AS place_version, p.verification_status`;

const placeSelect = `SELECT p.id, p.name, p.slug, p.description, p.address, p.landmark,
  p.district, p.city, p.province, p.postal_code, p.place_status,
  p.verification_status, p.verified_at, p.community_confirmed_at,
  p.community_confirmation_count, p.version,
  ST_Longitude(p.location) AS longitude, ST_Latitude(p.location) AS latitude
  FROM places p`;

function mapReportDetail(row: ReportDetailRow): PlaceReportDetail {
  return {
    appliedChangeSummary:
      row.applied_change_summary === null ? null : parseRecord(row.applied_change_summary),
    evidenceReference: row.evidence_reference,
    evidenceUrl: row.evidence_url,
    explanation: row.description,
    id: row.id,
    place: mapReportPlace(row),
    proposal: approvedPlacePatchSchema.parse(parseJson(row.proposed_value)),
    reportType: row.report_type,
    resolution: row.resolution,
    reviewedAt: nullableIsoDate(row.reviewed_at),
    status: row.report_status,
    submittedAt: isoDate(row.created_at),
    version: Number(row.version),
  };
}

function mapReportPlace(
  row: ReportPlaceColumns & { readonly verification_status: VerificationStatus },
) {
  return {
    address: row.place_address,
    id: row.place_id,
    name: row.place_name,
    slug: row.place_slug,
    verificationStatus: row.verification_status,
    version: Number(row.place_version),
  };
}

function mapReportPlaceFromPlace(place: PlaceLockRow) {
  return {
    address: place.address,
    id: place.id,
    name: place.name,
    slug: place.slug,
    verificationStatus: place.verification_status,
    version: Number(place.version),
  };
}

function mapActivityRow(row: ActivityRow): ActivityItem {
  const common = {
    createdAt: isoDate(row.created_at),
    id: row.id,
    placeId: row.place_id,
    placeName: row.place_name,
    updatedAt: isoDate(row.updated_at),
  };
  switch (row.activity_type) {
    case 'CONTRIBUTION':
      return {
        ...common,
        status: row.activity_status as ContributionStatus,
        type: 'CONTRIBUTION',
      };
    case 'REPORT':
      if (!row.place_id || !row.report_type) throw new Error('Invalid report activity row');
      return {
        ...common,
        placeId: row.place_id,
        reportType: row.report_type,
        status: row.activity_status as ReportStatus,
        type: 'REPORT',
      };
    case 'CONFIRMATION':
      if (!row.place_id || !row.confirmation_type) {
        throw new Error('Invalid confirmation activity row');
      }
      return {
        ...common,
        confirmationType: row.confirmation_type,
        placeId: row.place_id,
        status: row.activity_status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
        type: 'CONFIRMATION',
      };
  }
}

function mapQueueRow(row: QueueRow): AdminReportQueue['items'][number] {
  return {
    category: row.category_code,
    currentReviewer: mapReviewer({
      claimedAt: row.review_claimed_at,
      email: row.reviewer_email,
      id: row.reviewer_id,
    }),
    id: row.id,
    place: {
      id: row.place_id,
      name: row.place_name,
      version: Number(row.place_version),
    },
    reporter: { id: row.reporter_id, maskedEmail: maskEmail(row.reporter_email) },
    reportType: row.report_type,
    status: row.report_status,
    submittedAt: isoDate(row.created_at),
    version: Number(row.version),
  };
}

function mapReviewer(input: {
  readonly claimedAt: Date | string | null;
  readonly email: string | null;
  readonly id: string | null;
}): AdminReportReviewer | null {
  if (!input.claimedAt || !input.email || !input.id) return null;
  const claimedAt = new Date(input.claimedAt);
  const expiresAt = new Date(claimedAt.getTime() + reviewLeaseMinutes * 60_000);
  return {
    claimExpired: expiresAt.getTime() <= Date.now(),
    claimExpiresAt: expiresAt.toISOString(),
    claimedAt: claimedAt.toISOString(),
    email: maskEmail(input.email),
    id: input.id,
  };
}

function mapAuditRow(row: AuditRow): GovernanceAuditEntry {
  return {
    action: row.action,
    actorId: row.actor_user_id,
    actorType: row.actor_type,
    createdAt: isoDate(row.created_at),
    id: row.id,
    metadata: parseRecord(row.metadata),
    nextStatus: row.next_status,
    previousStatus: row.previous_status,
    requestId: row.request_id,
    resourceId: row.target_id,
    resourceType: row.target_type,
  };
}

function mapHistoryRow(row: HistoryRow): PlaceHistoryEntry {
  return {
    actorId: row.changed_by,
    after: parseRecord(row.new_value),
    before: row.previous_value === null ? null : parseRecord(row.previous_value),
    changedFields: parseStringArray(row.changed_fields),
    createdAt: isoDate(row.created_at),
    id: row.id,
    nextVersion: Number(row.next_version),
    previousVersion: row.previous_version === null ? null : Number(row.previous_version),
    reason: row.reason,
    sourceId: row.source_id,
    sourceType: row.source_type,
  };
}

function parseMutationReplay(value: unknown): MutationReplay {
  const parsed = parseJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const confirmationId = Reflect.get(parsed, 'confirmationId');
  const reportId = Reflect.get(parsed, 'reportId');
  return {
    ...(typeof confirmationId === 'string' ? { confirmationId } : {}),
    ...(typeof reportId === 'string' ? { reportId } : {}),
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseRecord(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = parseJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return parsed as Readonly<Record<string, unknown>>;
}

function parseStringArray(value: unknown): readonly string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
}

function isoDate(value: Date | string): string {
  return new Date(value).toISOString();
}

function nullableIsoDate(value: Date | string | null): string | null {
  return value === null ? null : isoDate(value);
}

function normalizeTime(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_');
}
