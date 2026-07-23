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

loadWorkspaceEnvironment(fileURLToPath(new URL('../../../../', import.meta.url)));
const pool = createDatabasePool(createDatabaseConnectionConfig(process.env));

try {
  const [tableRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'`,
  );
  const tableCount = Number(tableRows[0]?.count ?? 0);
  if (tableCount !== 27) throw new Error(`Expected 27 domain tables, found ${tableCount}`);

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

  process.stdout.write(
    `Database check passed: ${JSON.stringify({
      tableCount,
      engine: metadata.engineValue,
      collation: metadata.tableCollation,
      srid: Number(metadata.srsId),
      spatialIndex: metadata.indexType,
    })}\n`,
  );
} finally {
  await pool.end();
}
