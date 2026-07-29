import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminGoogleFormIntegrationStatus,
  AdminGoogleFormSubmissionDetail,
  AdminGoogleFormSubmissionItem,
  AdminGoogleFormSubmissionList,
  GoogleFormAcceptedSubmission,
  GoogleFormCanonicalPayload,
  GoogleFormSubmissionStatus,
  IntegrationStageStatus,
  ReplayGoogleFormSubmissionResult,
} from '@pitstop/contracts';
import { createUlid, type Pool, type PoolConnection, type RowDataPacket } from '@pitstop/database';
import { maskIntegrationEmail } from '@pitstop/validation';

import { DATABASE_POOL } from '../../common/database/database.module';
import type { ApiEnvironmentProvider } from '../../configuration';

export class GoogleFormRepositoryError extends Error {
  constructor(
    readonly code: 'BODY_CONFLICT' | 'NOT_FOUND' | 'REPLAY_NOT_ALLOWED' | 'SOURCE_DISABLED',
  ) {
    super(code);
    this.name = 'GoogleFormRepositoryError';
  }
}

interface ExistingSubmissionRow extends RowDataPacket {
  readonly id: string;
  readonly processing_status: GoogleFormSubmissionStatus;
  readonly request_hash: string;
}

interface CountRow extends RowDataPacket {
  readonly count: number;
  readonly processing_status: GoogleFormSubmissionStatus;
}

interface StatusRow extends RowDataPacket {
  readonly last_successful_sync_at: Date | string | null;
  readonly recent_received: number;
}

interface SubmissionRow extends RowDataPacket {
  readonly attempt_count: number;
  readonly contribution_id: string | null;
  readonly duplicate_detection_status: IntegrationStageStatus;
  readonly external_submission_id: string;
  readonly geocoding_status: IntegrationStageStatus;
  readonly id: string;
  readonly last_error_code: string | null;
  readonly payload: unknown;
  readonly processed_at: Date | string | null;
  readonly processing_status: GoogleFormSubmissionStatus;
  readonly received_at: Date | string;
  readonly submitted_at: Date | string;
  readonly updated_at: Date | string;
}

interface TotalRow extends RowDataPacket {
  readonly count: number;
}

interface HintRow extends RowDataPacket {
  readonly candidate_place_id: string;
  readonly distance_meters: number;
  readonly hint_score: string | number;
  readonly matched_signals: unknown;
}

@Injectable()
export class GoogleFormRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async accept(input: {
    readonly acceptedKeyId: string;
    readonly canonicalPayload: GoogleFormCanonicalPayload;
    readonly correlationId: string;
    readonly environment: ApiEnvironmentProvider;
    readonly externalSubmissionId: string;
    readonly requestHash: string;
  }): Promise<GoogleFormAcceptedSubmission> {
    return this.withTransaction(async (connection) => {
      const sourceId = await this.ensureSource(connection, input.environment);
      const [existingRows] = await connection.execute<ExistingSubmissionRow[]>(
        `SELECT id, request_hash, processing_status
         FROM google_form_submissions
         WHERE integration_source_id = ? AND external_submission_id = ?
         FOR UPDATE`,
        [sourceId, input.externalSubmissionId],
      );
      const existing = existingRows[0];
      if (existing) {
        if (existing.request_hash !== input.requestHash) {
          throw new GoogleFormRepositoryError('BODY_CONFLICT');
        }
        return {
          accepted: true,
          duplicate: true,
          inboxId: existing.id,
          status: existing.processing_status,
        };
      }

      const inboxId = createUlid();
      await connection.execute(
        `INSERT INTO google_form_submissions (
           id, integration_source_id, external_submission_id, payload, payload_schema_version,
           request_hash, accepted_key_id, correlation_id, received_at, submitted_at,
           processing_status, geocoding_status, duplicate_detection_status
         ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'RECEIVED', 'PENDING', 'PENDING')`,
        [
          inboxId,
          sourceId,
          input.externalSubmissionId,
          JSON.stringify(input.canonicalPayload),
          input.requestHash,
          input.acceptedKeyId,
          input.correlationId,
          new Date(input.canonicalPayload.sourceMetadata.receivedAt),
          new Date(input.canonicalPayload.sourceMetadata.submittedAt),
        ],
      );
      return { accepted: true, duplicate: false, inboxId, status: 'RECEIVED' };
    });
  }

  async status(environment: ApiEnvironmentProvider): Promise<AdminGoogleFormIntegrationStatus> {
    const [counts, rows] = await Promise.all([
      this.pool.execute<CountRow[]>(
        `SELECT processing_status, COUNT(*) AS count
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE s.code = ?
         GROUP BY processing_status`,
        [environment.GOOGLE_FORM_SOURCE_ID],
      ),
      this.pool.execute<StatusRow[]>(
        `SELECT
           SUM(g.received_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 24 HOUR)) AS recent_received,
           MAX(CASE WHEN g.processing_status = 'COMPLETED' THEN g.processed_at END)
             AS last_successful_sync_at
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE s.code = ?`,
        [environment.GOOGLE_FORM_SOURCE_ID],
      ),
    ]);
    const statusCounts = emptyStatusCounts();
    for (const row of counts[0]) statusCounts[row.processing_status] = Number(row.count);
    const aggregate = rows[0][0];
    return {
      counts: statusCounts,
      lastSuccessfulSyncAt: aggregate?.last_successful_sync_at
        ? isoDate(aggregate.last_successful_sync_at)
        : null,
      queue: {
        delayed: statusCounts.RETRYABLE_FAILURE,
        pending: statusCounts.RECEIVED + statusCounts.QUEUED + statusCounts.PROCESSING,
      },
      recentReceived: Number(aggregate?.recent_received ?? 0),
      source: {
        enabled: environment.GOOGLE_FORM_SOURCE_ENABLED,
        id: environment.GOOGLE_FORM_SOURCE_ID,
        keyId: environment.GOOGLE_FORM_CURRENT_KEY_ID,
      },
    };
  }

  async list(input: {
    readonly page: number;
    readonly pageSize: number;
    readonly sourceCode: string;
    readonly status?: GoogleFormSubmissionStatus | undefined;
  }): Promise<AdminGoogleFormSubmissionList> {
    const whereStatus = input.status ? ' AND g.processing_status = ?' : '';
    const bindings = input.status ? [input.sourceCode, input.status] : [input.sourceCode];
    const offset = (input.page - 1) * input.pageSize;
    const [[items], [totals]] = await Promise.all([
      this.pool.query<SubmissionRow[]>(
        `SELECT g.id, g.external_submission_id, g.processing_status, g.attempt_count,
           g.last_error_code, g.contribution_id, g.geocoding_status,
           g.duplicate_detection_status, g.payload, g.received_at, g.submitted_at,
           g.processed_at, g.updated_at
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE s.code = ?${whereStatus}
         ORDER BY g.received_at DESC, g.id DESC
         LIMIT ? OFFSET ?`,
        [...bindings, input.pageSize, offset],
      ),
      this.pool.execute<TotalRow[]>(
        `SELECT COUNT(*) AS count
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE s.code = ?${whereStatus}`,
        bindings,
      ),
    ]);
    const totalItems = Number(totals[0]?.count ?? 0);
    return {
      items: items.map(mapSubmissionItem),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / input.pageSize)),
      },
    };
  }

  async detail(id: string, sourceCode: string): Promise<AdminGoogleFormSubmissionDetail | null> {
    const [[submissions], [hints]] = await Promise.all([
      this.pool.execute<SubmissionRow[]>(
        `SELECT g.id, g.external_submission_id, g.processing_status, g.attempt_count,
           g.last_error_code, g.contribution_id, g.geocoding_status,
           g.duplicate_detection_status, g.payload, g.received_at, g.submitted_at,
           g.processed_at, g.updated_at
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE g.id = ? AND s.code = ?
         LIMIT 1`,
        [id, sourceCode],
      ),
      this.pool.execute<HintRow[]>(
        `SELECT candidate_place_id, distance_meters, matched_signals, hint_score
         FROM duplicate_place_hints
         WHERE google_form_submission_id = ?
         ORDER BY hint_score DESC, distance_meters ASC`,
        [id],
      ),
    ]);
    const row = submissions[0];
    if (!row) return null;
    const payload = parsePayload(row.payload);
    return {
      ...mapSubmissionItem(row),
      duplicateHints: hints.map((hint) => ({
        candidatePlaceId: hint.candidate_place_id,
        distanceMeters: Number(hint.distance_meters),
        matchedSignals: parseStringArray(hint.matched_signals),
        score: Number(hint.hint_score),
      })),
      payloadSummary: {
        area: payload.area,
        category: payload.category,
        placeName: payload.placeName,
      },
      processedAt: row.processed_at ? isoDate(row.processed_at) : null,
      submittedAt: isoDate(row.submitted_at),
    };
  }

  async replay(input: {
    readonly actorAdminId: string;
    readonly inboxId: string;
    readonly requestId: string;
    readonly sourceCode: string;
  }): Promise<ReplayGoogleFormSubmissionResult> {
    return this.withTransaction(async (connection) => {
      const [rows] = await connection.execute<ExistingSubmissionRow[]>(
        `SELECT g.id, g.request_hash, g.processing_status
         FROM google_form_submissions g
         JOIN integration_sources s ON s.id = g.integration_source_id
         WHERE g.id = ? AND s.code = ?
         FOR UPDATE`,
        [input.inboxId, input.sourceCode],
      );
      const current = rows[0];
      if (!current) throw new GoogleFormRepositoryError('NOT_FOUND');
      if (current.processing_status === 'COMPLETED') {
        return { inboxId: current.id, replayed: true, status: 'COMPLETED' };
      }
      if (
        current.processing_status !== 'RETRYABLE_FAILURE' &&
        current.processing_status !== 'DEAD_LETTER' &&
        current.processing_status !== 'REJECTED_INVALID'
      ) {
        throw new GoogleFormRepositoryError('REPLAY_NOT_ALLOWED');
      }
      await connection.execute(
        `UPDATE google_form_submissions
         SET processing_status = 'RECEIVED', queued_at = NULL, processed_at = NULL,
           last_error_class = NULL, last_error_code = NULL,
           geocoding_status = CASE
             WHEN contribution_id IS NULL THEN 'PENDING' ELSE geocoding_status END,
           duplicate_detection_status = CASE
             WHEN contribution_id IS NULL THEN 'PENDING' ELSE duplicate_detection_status END
         WHERE id = ?`,
        [input.inboxId],
      );
      await connection.execute(
        `INSERT INTO audit_logs (
           id, actor_user_id, actor_role, action, target_type, target_id, request_id, new_value
         ) VALUES (?, ?, 'ADMIN', 'GOOGLE_FORM_SUBMISSION_REPLAYED',
           'GOOGLE_FORM_SUBMISSION', ?, ?, ?)`,
        [
          createUlid(),
          input.actorAdminId,
          input.inboxId,
          input.requestId,
          JSON.stringify({ previousStatus: current.processing_status }),
        ],
      );
      return { inboxId: current.id, replayed: true, status: 'RECEIVED' };
    });
  }

  private async ensureSource(
    connection: PoolConnection,
    environment: ApiEnvironmentProvider,
  ): Promise<string> {
    const proposedId = createUlid();
    await connection.execute(
      `INSERT INTO integration_sources (
         id, code, name, is_active, current_key_id, previous_key_id,
         replay_window_seconds, rate_limit_window_seconds, rate_limit_maximum
       ) VALUES (?, ?, 'Google Form', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active),
         current_key_id = VALUES(current_key_id), previous_key_id = VALUES(previous_key_id),
         replay_window_seconds = VALUES(replay_window_seconds),
         rate_limit_window_seconds = VALUES(rate_limit_window_seconds),
         rate_limit_maximum = VALUES(rate_limit_maximum)`,
      [
        proposedId,
        environment.GOOGLE_FORM_SOURCE_ID,
        environment.GOOGLE_FORM_SOURCE_ENABLED,
        environment.GOOGLE_FORM_CURRENT_KEY_ID,
        environment.GOOGLE_FORM_PREVIOUS_KEY_ID ?? null,
        environment.GOOGLE_FORM_REPLAY_WINDOW_SECONDS,
        environment.GOOGLE_FORM_RATE_LIMIT_WINDOW_SECONDS,
        environment.GOOGLE_FORM_RATE_LIMIT_MAX,
      ],
    );
    const [rows] = await connection.execute<(RowDataPacket & { readonly id: string })[]>(
      'SELECT id FROM integration_sources WHERE code = ? AND is_active = true LIMIT 1',
      [environment.GOOGLE_FORM_SOURCE_ID],
    );
    const source = rows[0];
    if (!source) throw new GoogleFormRepositoryError('SOURCE_DISABLED');
    return source.id;
  }

  private async withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
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
}

function mapSubmissionItem(row: SubmissionRow): AdminGoogleFormSubmissionItem {
  const payload = parsePayload(row.payload);
  return {
    attemptCount: Number(row.attempt_count),
    contributionId: row.contribution_id,
    duplicateDetectionStatus: row.duplicate_detection_status,
    externalSubmissionId: row.external_submission_id,
    geocodingStatus: row.geocoding_status,
    id: row.id,
    lastErrorCode: row.last_error_code,
    receivedAt: isoDate(row.received_at),
    status: row.processing_status,
    submitterEmailMasked: maskIntegrationEmail(payload.submitterEmail),
    updatedAt: isoDate(row.updated_at),
  };
}

function parsePayload(value: unknown): GoogleFormCanonicalPayload {
  return (typeof value === 'string' ? JSON.parse(value) : value) as GoogleFormCanonicalPayload;
}

function parseStringArray(value: unknown): string[] {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function isoDate(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function emptyStatusCounts(): Record<GoogleFormSubmissionStatus, number> {
  return {
    COMPLETED: 0,
    DEAD_LETTER: 0,
    PROCESSING: 0,
    QUEUED: 0,
    RECEIVED: 0,
    REJECTED_INVALID: 0,
    RETRYABLE_FAILURE: 0,
  };
}
