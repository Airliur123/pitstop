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

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../../', import.meta.url)));
const pool = createDatabasePool(createDatabaseConnectionConfig(process.env));

try {
  const [tableRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'`,
  );
  const tableCount = Number(tableRows[0]?.count ?? 0);
  if (tableCount !== 30) throw new Error(`Expected 30 domain tables, found ${tableCount}`);

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

  process.stdout.write(
    `Database check passed: ${JSON.stringify({
      tableCount,
      engine: metadata.engineValue,
      collation: metadata.tableCollation,
      srid: Number(metadata.srsId),
      spatialIndex: metadata.indexType,
      moderationIndexes: Number(moderation.indexCount),
      verifiedLocationSrid: Number(moderation.verifiedSrid),
    })}\n`,
  );
} finally {
  await pool.end();
}
