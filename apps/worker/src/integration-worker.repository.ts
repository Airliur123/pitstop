import { Inject, Injectable } from '@nestjs/common';
import type {
  DetectDuplicatePlaceJob,
  GeocodeContributionJob,
  GoogleFormCanonicalPayload,
  PitstopJobName,
  ProcessGoogleFormSubmissionJob,
} from '@pitstop/contracts';
import { createUlid, type Pool, type PoolConnection, type RowDataPacket } from '@pitstop/database';
import {
  contributionSubmissionSchema,
  googleFormCanonicalPayloadSchema,
} from '@pitstop/validation';

import type { GeocodingResult } from './geocoding.port';
import type { SafeErrorClassification } from './job-policy';
import { PermanentWorkerError } from './job-policy';
import { WORKER_DATABASE_POOL } from './worker-database';

interface InboxRow extends RowDataPacket {
  readonly attempt_count: number;
  readonly contribution_id: string | null;
  readonly correlation_id: string;
  readonly id: string;
  readonly payload: unknown;
  readonly processing_status: string;
  readonly request_hash: string;
  readonly submitted_at: Date | string;
}

interface CandidateRow extends RowDataPacket {
  readonly contribution_id: string | null;
  readonly correlation_id: string;
  readonly id: string;
}

interface GeocodeRow extends RowDataPacket {
  readonly contribution_id: string;
  readonly correlation_id: string;
  readonly id: string;
  readonly payload: unknown;
}

interface DuplicateCandidateRow extends RowDataPacket {
  readonly address_match: number;
  readonly distance_meters: number;
  readonly id: string;
  readonly name_match: number;
}

export interface DuplicateHint {
  readonly candidatePlaceId: string;
  readonly distanceMeters: number;
  readonly matchedSignals: readonly string[];
  readonly score: number;
}

@Injectable()
export class IntegrationWorkerRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async findEnqueueCandidates(limit = 100): Promise<ProcessGoogleFormSubmissionJob[]> {
    const [rows] = await this.pool.query<CandidateRow[]>(
      `SELECT id, correlation_id, contribution_id
       FROM google_form_submissions
       WHERE contribution_id IS NULL
         AND (processing_status IN ('RECEIVED', 'RETRYABLE_FAILURE')
          OR (processing_status = 'QUEUED'
              AND queued_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 5 MINUTE)))
       ORDER BY received_at ASC, id ASC
       LIMIT ?`,
      [limit],
    );
    return rows.map((row) => ({
      attempt: 0,
      correlationId: row.correlation_id,
      enqueuedAt: new Date().toISOString(),
      idempotencyKey: `google-form:process:${row.id}`,
      inboxId: row.id,
      requestId: row.correlation_id,
    }));
  }

  async findGeocodingCandidates(limit = 100): Promise<GeocodeContributionJob[]> {
    const [rows] = await this.pool.query<CandidateRow[]>(
      `SELECT id, correlation_id, contribution_id
       FROM google_form_submissions
       WHERE contribution_id IS NOT NULL
         AND processing_status NOT IN ('COMPLETED', 'DEAD_LETTER', 'REJECTED_INVALID')
         AND geocoding_status IN ('PENDING', 'FAILED')
       ORDER BY updated_at ASC, id ASC
       LIMIT ?`,
      [limit],
    );
    return rows.flatMap((row) =>
      row.contribution_id
        ? [
            {
              attempt: 0,
              contributionId: row.contribution_id,
              correlationId: row.correlation_id,
              enqueuedAt: new Date().toISOString(),
              idempotencyKey: `google-form:geocode:${row.contribution_id}`,
              inboxId: row.id,
              requestId: row.correlation_id,
            },
          ]
        : [],
    );
  }

  async findDuplicateCandidates(limit = 100): Promise<DetectDuplicatePlaceJob[]> {
    const [rows] = await this.pool.query<CandidateRow[]>(
      `SELECT id, correlation_id, contribution_id
       FROM google_form_submissions
       WHERE contribution_id IS NOT NULL
         AND processing_status NOT IN ('COMPLETED', 'DEAD_LETTER', 'REJECTED_INVALID')
         AND geocoding_status = 'SUCCEEDED'
         AND duplicate_detection_status IN ('PENDING', 'FAILED')
       ORDER BY updated_at ASC, id ASC
       LIMIT ?`,
      [limit],
    );
    return rows.flatMap((row) =>
      row.contribution_id
        ? [
            {
              attempt: 0,
              contributionId: row.contribution_id,
              correlationId: row.correlation_id,
              enqueuedAt: new Date().toISOString(),
              idempotencyKey: `google-form:duplicate:${row.contribution_id}`,
              inboxId: row.id,
              requestId: row.correlation_id,
            },
          ]
        : [],
    );
  }

  async markQueued(inboxId: string): Promise<void> {
    await this.pool.execute(
      `UPDATE google_form_submissions
       SET processing_status = 'QUEUED', queued_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND processing_status IN ('RECEIVED', 'RETRYABLE_FAILURE', 'QUEUED')`,
      [inboxId],
    );
  }

  async processSubmission(inboxId: string): Promise<GeocodeContributionJob | null> {
    return this.withTransaction(async (connection) => {
      const [rows] = await connection.execute<InboxRow[]>(
        `SELECT id, payload, processing_status, contribution_id, correlation_id,
           request_hash, submitted_at, attempt_count
         FROM google_form_submissions WHERE id = ? FOR UPDATE`,
        [inboxId],
      );
      const inbox = rows[0];
      if (!inbox) throw new PermanentWorkerError('INBOX_NOT_FOUND');
      const parsedPayload = googleFormCanonicalPayloadSchema.safeParse(parseJson(inbox.payload));
      if (!parsedPayload.success) {
        throw new PermanentWorkerError('INBOX_CANONICAL_PAYLOAD_INVALID');
      }
      if (inbox.processing_status === 'COMPLETED' && inbox.contribution_id) return null;

      const contributionId = inbox.contribution_id ?? createUlid();
      if (!inbox.contribution_id) {
        const contributionPayload = contributionSubmissionSchema.parse(
          contributionPayloadFromGoogleForm(parsedPayload.data),
        );
        await connection.execute(
          `INSERT INTO contributions (
             id, submitted_by, source, contribution_status, submitted_at
           ) VALUES (?, NULL, 'GOOGLE_FORM', 'PENDING', ?)`,
          [contributionId, inbox.submitted_at],
        );
        await connection.execute(
          `INSERT INTO contribution_payloads (contribution_id, schema_version, payload)
           VALUES (?, 1, ?)`,
          [contributionId, JSON.stringify(contributionPayload)],
        );
      }
      await connection.execute(
        `UPDATE google_form_submissions
         SET contribution_id = ?, processing_status = 'PROCESSING',
           attempt_count = attempt_count + 1, last_error_class = NULL, last_error_code = NULL
         WHERE id = ?`,
        [contributionId, inboxId],
      );
      return {
        attempt: 0,
        contributionId,
        correlationId: inbox.correlation_id,
        enqueuedAt: new Date().toISOString(),
        idempotencyKey: `google-form:geocode:${contributionId}`,
        inboxId,
        requestId: inbox.correlation_id,
      };
    });
  }

  async geocodeInput(
    job: GeocodeContributionJob,
  ): Promise<{ readonly payload: GoogleFormCanonicalPayload } | null> {
    const [rows] = await this.pool.execute<GeocodeRow[]>(
      `SELECT g.id, g.correlation_id, g.contribution_id, g.payload
       FROM google_form_submissions g
       WHERE g.id = ? AND g.contribution_id = ?
       LIMIT 1`,
      [job.inboxId, job.contributionId],
    );
    const row = rows[0];
    if (!row) return null;
    return { payload: googleFormCanonicalPayloadSchema.parse(parseJson(row.payload)) };
  }

  async markGeocodingProcessing(inboxId: string): Promise<void> {
    await this.pool.execute(
      `UPDATE google_form_submissions
       SET geocoding_status = 'PROCESSING', processing_status = 'PROCESSING',
         attempt_count = attempt_count + 1
       WHERE id = ? AND processing_status <> 'COMPLETED'`,
      [inboxId],
    );
  }

  async saveGeocodingResult(
    job: GeocodeContributionJob,
    result: Extract<GeocodingResult, { readonly status: 'FOUND' }>,
    lowConfidence: boolean,
  ): Promise<void> {
    await this.withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO geocoding_results (
           id, contribution_id, place_id, provider, result_location, normalized_address,
           confidence, status, raw_response, is_admin_verified
         ) VALUES (?, ?, NULL, ?, ST_GeomFromText(?, 4326, 'axis-order=long-lat'),
           ?, ?, ?, ?, false)
         ON DUPLICATE KEY UPDATE provider = VALUES(provider),
           result_location = VALUES(result_location),
           normalized_address = VALUES(normalized_address),
           confidence = VALUES(confidence), status = VALUES(status),
           raw_response = VALUES(raw_response), is_admin_verified = false`,
        [
          createUlid(),
          job.contributionId,
          result.provider,
          `POINT(${result.longitude} ${result.latitude})`,
          result.normalizedAddress,
          result.confidence.toFixed(4),
          lowConfidence ? 'LOW_CONFIDENCE' : 'SUCCEEDED',
          JSON.stringify(result.rawSummary),
        ],
      );
      await connection.execute(
        `UPDATE google_form_submissions
         SET geocoding_status = ?,
           duplicate_detection_status = CASE WHEN ? THEN 'SKIPPED' ELSE 'PENDING' END,
           processing_status = CASE WHEN ? THEN 'COMPLETED' ELSE 'PROCESSING' END,
           processed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP(3) ELSE processed_at END
         WHERE id = ? AND contribution_id = ?`,
        [
          lowConfidence ? 'LOW_CONFIDENCE' : 'SUCCEEDED',
          lowConfidence,
          lowConfidence,
          lowConfidence,
          job.inboxId,
          job.contributionId,
        ],
      );
    });
  }

  async findDuplicateHints(
    job: DetectDuplicatePlaceJob,
    radiusMeters: number,
  ): Promise<DuplicateHint[]> {
    const [rows] = await this.pool.execute<DuplicateCandidateRow[]>(
      `SELECT p.id,
         ROUND(ST_Distance_Sphere(p.location, gr.result_location)) AS distance_meters,
         LOWER(TRIM(p.name)) = cp.place_name_normalized AS name_match,
         LOWER(TRIM(p.address)) = cp.address_normalized AS address_match
       FROM contributions c
       JOIN contribution_payloads cp ON cp.contribution_id = c.id
       JOIN geocoding_results gr ON gr.contribution_id = c.id
         AND gr.status = 'SUCCEEDED'
       JOIN places p ON p.place_status = 'ACTIVE' AND p.deleted_at IS NULL
       JOIN place_categories pc ON pc.place_id = p.id
       JOIN categories cat ON cat.id = pc.category_id AND cat.code = cp.category_code
       WHERE c.id = ?
         AND ST_Distance_Sphere(p.location, gr.result_location) <= ?
       ORDER BY distance_meters ASC, p.id ASC
       LIMIT 25`,
      [job.contributionId, radiusMeters],
    );
    return rows
      .map((row) =>
        calculateDuplicateHint({
          addressMatches: row.address_match === 1,
          candidatePlaceId: row.id,
          distanceMeters: Number(row.distance_meters),
          nameMatches: row.name_match === 1,
          radiusMeters,
        }),
      )
      .filter((hint) => hint.score >= 0.35);
  }

  async markDuplicateProcessing(inboxId: string): Promise<void> {
    await this.pool.execute(
      `UPDATE google_form_submissions
       SET duplicate_detection_status = 'PROCESSING', processing_status = 'PROCESSING',
         attempt_count = attempt_count + 1
       WHERE id = ? AND geocoding_status = 'SUCCEEDED'`,
      [inboxId],
    );
  }

  async saveDuplicateHints(job: DetectDuplicatePlaceJob, hints: readonly DuplicateHint[]) {
    await this.withTransaction(async (connection) => {
      await connection.execute('DELETE FROM duplicate_place_hints WHERE contribution_id = ?', [
        job.contributionId,
      ]);
      for (const hint of hints) {
        await connection.execute(
          `INSERT INTO duplicate_place_hints (
             id, contribution_id, google_form_submission_id, candidate_place_id,
             distance_meters, matched_signals, hint_score
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            createUlid(),
            job.contributionId,
            job.inboxId,
            hint.candidatePlaceId,
            Math.round(hint.distanceMeters),
            JSON.stringify(hint.matchedSignals),
            hint.score.toFixed(4),
          ],
        );
      }
      await connection.execute(
        `UPDATE google_form_submissions
         SET duplicate_detection_status = 'SUCCEEDED', processing_status = 'COMPLETED',
           processed_at = CURRENT_TIMESTAMP(3), last_error_class = NULL, last_error_code = NULL
         WHERE id = ? AND contribution_id = ?`,
        [job.inboxId, job.contributionId],
      );
    });
  }

  async markPermanentGeocodingFailure(
    job: GeocodeContributionJob,
    provider: string,
    code: string,
  ): Promise<void> {
    await this.withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO geocoding_results (
           id, contribution_id, place_id, provider, result_location, normalized_address,
           confidence, status, raw_response, is_admin_verified
         ) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, 'NOT_FOUND', ?, false)
         ON DUPLICATE KEY UPDATE provider = VALUES(provider), result_location = NULL,
           normalized_address = NULL, confidence = NULL, status = 'NOT_FOUND',
           raw_response = VALUES(raw_response), is_admin_verified = false`,
        [createUlid(), job.contributionId, provider, JSON.stringify({ code })],
      );
      await connection.execute(
        `UPDATE google_form_submissions
         SET geocoding_status = 'FAILED', duplicate_detection_status = 'SKIPPED'
         WHERE id = ?`,
        [job.inboxId],
      );
    });
  }

  async recordJobFailure(
    inboxId: string,
    jobName: PitstopJobName,
    error: SafeErrorClassification,
    exhausted: boolean,
  ): Promise<void> {
    const processingStatus =
      error.errorClass === 'PERMANENT_VALIDATION' && jobName === 'process-google-form-submission'
        ? 'REJECTED_INVALID'
        : exhausted
          ? 'DEAD_LETTER'
          : 'RETRYABLE_FAILURE';
    if (jobName === 'geocode-contribution') {
      await this.pool.execute(
        `UPDATE google_form_submissions
         SET processing_status = ?, last_error_class = ?, last_error_code = ?,
           geocoding_status = 'FAILED'
         WHERE id = ?`,
        [processingStatus, error.errorClass, error.code, inboxId],
      );
      return;
    }
    if (jobName === 'detect-duplicate-place') {
      await this.pool.execute(
        `UPDATE google_form_submissions
         SET processing_status = ?, last_error_class = ?, last_error_code = ?,
           duplicate_detection_status = 'FAILED'
         WHERE id = ?`,
        [processingStatus, error.errorClass, error.code, inboxId],
      );
      return;
    }
    await this.pool.execute(
      `UPDATE google_form_submissions
       SET processing_status = ?, last_error_class = ?, last_error_code = ?
       WHERE id = ?`,
      [processingStatus, error.errorClass, error.code, inboxId],
    );
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

export function calculateDuplicateHint(input: {
  readonly addressMatches: boolean;
  readonly candidatePlaceId: string;
  readonly distanceMeters: number;
  readonly nameMatches: boolean;
  readonly radiusMeters: number;
}): DuplicateHint {
  const matchedSignals = [
    ...(input.nameMatches ? ['NORMALIZED_NAME'] : []),
    ...(input.addressMatches ? ['NORMALIZED_ADDRESS'] : []),
    'SPATIAL_PROXIMITY',
    'CATEGORY',
  ];
  const proximity = Math.max(0, 1 - input.distanceMeters / input.radiusMeters);
  const score = (input.nameMatches ? 0.5 : 0) + (input.addressMatches ? 0.3 : 0) + proximity * 0.2;
  return {
    candidatePlaceId: input.candidatePlaceId,
    distanceMeters: input.distanceMeters,
    matchedSignals,
    score: Number(score.toFixed(4)),
  };
}

function contributionPayloadFromGoogleForm(payload: GoogleFormCanonicalPayload) {
  const priceCategory = payload.category === 'MAKAN_MURAH' || payload.category === 'NGOPI';
  return {
    address: payload.address,
    area: payload.area,
    category: payload.category,
    facilities: payload.facilities,
    landmark: payload.landmark,
    mainMenu: priceCategory
      ? { name: payload.cheapestMenuName, priceAmount: payload.cheapestMenuPrice }
      : undefined,
    mapsUrl: payload.mapUrl,
    maximumUsefulBudget: payload.maximumUsefulBudget,
    notes: payload.notes,
    operatingHours: payload.openingHours,
    placeName: payload.placeName,
    priceRange: payload.priceRange,
  };
}

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}
