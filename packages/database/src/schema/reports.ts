import { sql } from 'drizzle-orm';
import {
  check,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, ulidColumn, updatedAtColumn } from './columns';
import { confirmationTypeValues, reportStatusValues, reportTypeValues } from './enums';
import { users } from './identity';
import { places } from './places';

export const placeConfirmations = mysqlTable(
  'place_confirmations',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: ulidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    confirmationType: mysqlEnum('confirmation_type', confirmationTypeValues).notNull(),
    observedAt: timestamp('observed_at', { fsp: 3 }).notNull(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    note: varchar('note', { length: 300 }),
    placeVersion: int('place_version', { unsigned: true }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_place_confirmations_user_place').on(table.userId, table.placeId),
    index('idx_place_confirmations_place_type').on(table.placeId, table.confirmationType),
    index('idx_place_confirmations_place_expiry').on(table.placeId, table.expiresAt, table.userId),
    index('idx_place_confirmations_user_created').on(table.userId, table.createdAt, table.id),
    check('chk_place_confirmations_place_version', sql`${table.placeVersion} > 0`),
    check('chk_place_confirmations_expiry', sql`${table.expiresAt} > ${table.observedAt}`),
  ],
);

export const placeReports = mysqlTable(
  'place_reports',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    reportedBy: ulidColumn('reported_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    reportType: mysqlEnum('report_type', reportTypeValues).notNull(),
    description: varchar('description', { length: 1000 }).notNull(),
    proposedValue: json('proposed_value'),
    evidenceUrl: varchar('evidence_url', { length: 1000 }),
    evidenceReference: varchar('evidence_reference', { length: 500 }),
    reportStatus: mysqlEnum('report_status', reportStatusValues).notNull().default('PENDING'),
    submittedPlaceVersion: int('submitted_place_version', { unsigned: true }).notNull(),
    reviewedBy: ulidColumn('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    reviewClaimedAt: timestamp('review_claimed_at', { fsp: 3 }),
    reviewedAt: timestamp('reviewed_at', { fsp: 3 }),
    resolution: varchar('resolution', { length: 500 }),
    appliedChangeSummary: json('applied_change_summary'),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('idx_place_reports_status_created').on(table.reportStatus, table.createdAt),
    index('idx_place_reports_place').on(table.placeId, table.createdAt),
    index('idx_place_reports_queue').on(table.reportStatus, table.createdAt, table.id),
    index('idx_place_reports_type_status').on(
      table.reportType,
      table.reportStatus,
      table.createdAt,
    ),
    index('idx_place_reports_place_status').on(table.placeId, table.reportStatus, table.createdAt),
    index('idx_place_reports_reporter_created').on(table.reportedBy, table.createdAt, table.id),
    index('idx_place_reports_reviewer_status').on(table.reviewedBy, table.reportStatus),
    check('chk_place_reports_submitted_place_version', sql`${table.submittedPlaceVersion} > 0`),
    check('chk_place_reports_version_positive', sql`${table.version} > 0`),
  ],
);

export const reportEvidence = mysqlTable(
  'report_evidence',
  {
    id: ulidColumn().primaryKey(),
    reportId: ulidColumn('report_id')
      .notNull()
      .references(() => placeReports.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: int('file_size').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_report_evidence_object_key').on(table.objectKey),
    index('idx_report_evidence_report').on(table.reportId),
    check('chk_report_evidence_file_size', sql`${table.fileSize} >= 0`),
  ],
);
