import { fileURLToPath } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import type { RowDataPacket } from 'mysql2/promise';

import { createDatabaseConnectionConfig, createDatabasePool } from '../index';

interface CountRow extends RowDataPacket {
  readonly count: number;
}

interface PlaceMetadataRow extends RowDataPacket {
  readonly engineValue: string;
  readonly tableCollation: string;
  readonly srsId: number;
  readonly indexType: string;
}

interface ModerationMetadataRow extends RowDataPacket {
  readonly columnCount: number;
  readonly eventTableCount: number;
  readonly indexCount: number;
  readonly verifiedSrid: number;
}

interface IntegrationMetadataRow extends RowDataPacket {
  readonly hintTableCount: number;
  readonly inboxColumnCount: number;
  readonly integrationIndexCount: number;
  readonly resultSrid: number;
}

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../../', import.meta.url)));
const pool = createDatabasePool(createDatabaseConnectionConfig(process.env));

try {
  const [tableRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'`,
  );
  const tableCount = Number(tableRows[0]?.count ?? 0);
  if (tableCount !== 31) throw new Error(`Expected 31 domain tables, found ${tableCount}`);

  const [metadataRows] = await pool.query<PlaceMetadataRow[]>(
    `SELECT t.engine AS engineValue, t.table_collation AS tableCollation,
       c.srs_id AS srsId, s.index_type AS indexType
     FROM information_schema.tables t
     JOIN information_schema.columns c
       ON c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'location'
     JOIN information_schema.statistics s
       ON s.table_schema = t.table_schema AND s.table_name = t.table_name
       AND s.index_name = 'idx_places_location'
     WHERE t.table_schema = DATABASE() AND t.table_name = 'places'`,
  );
  const metadata = metadataRows[0];
  if (!metadata) throw new Error('Places spatial metadata is missing');
  if (metadata.engineValue !== 'InnoDB') {
    throw new Error(`Unexpected places engine: ${metadata.engineValue}`);
  }
  if (!metadata.tableCollation.startsWith('utf8mb4_')) {
    throw new Error(`Unexpected places collation: ${metadata.tableCollation}`);
  }
  if (Number(metadata.srsId) !== 4326) {
    throw new Error(`Unexpected places SRID: ${metadata.srsId}`);
  }
  if (metadata.indexType !== 'SPATIAL') {
    throw new Error(`Unexpected places index type: ${metadata.indexType}`);
  }

  const [moderationRows] = await pool.query<ModerationMetadataRow[]>(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'moderation_events') AS eventTableCount,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'contributions'
          AND column_name IN (
            'reviewed_by', 'review_claimed_at', 'decision_reason', 'approved_at', 'merged_at',
            'merged_place_id', 'verified_location', 'verified_district', 'verified_city',
            'verified_province', 'verified_postal_code'
          )) AS columnCount,
       (SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND index_name IN (
            'idx_contributions_queue', 'idx_contributions_reviewer_status',
            'idx_contributions_merged_place', 'idx_contribution_payloads_category',
            'idx_contribution_payloads_place_name',
            'idx_moderation_events_contribution_created',
            'idx_moderation_events_actor_created', 'idx_moderation_events_recent'
          )) AS indexCount,
       (SELECT srs_id FROM information_schema.st_geometry_columns
        WHERE table_schema = DATABASE() AND table_name = 'contributions'
          AND column_name = 'verified_location') AS verifiedSrid`,
  );
  const moderation = moderationRows[0];
  if (
    !moderation ||
    Number(moderation.eventTableCount) !== 1 ||
    Number(moderation.columnCount) !== 11 ||
    Number(moderation.indexCount) !== 8 ||
    Number(moderation.verifiedSrid) !== 4326
  ) {
    throw new Error('Phase 8 moderation schema metadata is incomplete');
  }

  const [integrationRows] = await pool.query<IntegrationMetadataRow[]>(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'duplicate_place_hints')
         AS hintTableCount,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'google_form_submissions'
          AND column_name IN (
            'payload_schema_version', 'request_hash', 'accepted_key_id', 'correlation_id',
            'submitted_at', 'queued_at', 'attempt_count', 'last_error_class',
            'last_error_code', 'geocoding_status', 'duplicate_detection_status',
            'created_at', 'updated_at'
          )) AS inboxColumnCount,
       (SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND index_name IN (
            'uq_google_form_source_external', 'idx_google_form_status_received',
            'idx_google_form_contribution', 'uq_geocoding_contribution',
            'idx_duplicate_hint_submission', 'idx_duplicate_hint_candidate',
            'uq_duplicate_hint_contribution_place'
          )) AS integrationIndexCount,
       (SELECT srs_id FROM information_schema.st_geometry_columns
        WHERE table_schema = DATABASE() AND table_name = 'geocoding_results'
          AND column_name = 'result_location') AS resultSrid`,
  );
  const integration = integrationRows[0];
  if (
    !integration ||
    Number(integration.hintTableCount) !== 1 ||
    Number(integration.inboxColumnCount) !== 13 ||
    Number(integration.integrationIndexCount) !== 7 ||
    Number(integration.resultSrid) !== 4326
  ) {
    throw new Error('Phase 9 integration schema metadata is incomplete');
  }

  process.stdout.write(
    `Database check passed: ${JSON.stringify({
      tableCount,
      engine: metadata.engineValue,
      collation: metadata.tableCollation,
      srid: Number(metadata.srsId),
      spatialIndex: metadata.indexType,
      moderationIndexes: Number(moderation.indexCount),
      integrationIndexes: Number(integration.integrationIndexCount),
      verifiedLocationSrid: Number(moderation.verifiedSrid),
    })}\n`,
  );
} finally {
  await pool.end();
}
