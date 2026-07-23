import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, ulidColumn, updatedAtColumn } from './columns';
import {
  contributionSourceValues,
  contributionStatusValues,
  moderationDecisionValues,
} from './enums';
import { users } from './identity';
import { places } from './places';

export const contributions = mysqlTable(
  'contributions',
  {
    id: ulidColumn().primaryKey(),
    submittedBy: ulidColumn('submitted_by').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    source: mysqlEnum('source', contributionSourceValues).notNull(),
    contributionStatus: mysqlEnum('contribution_status', contributionStatusValues)
      .notNull()
      .default('DRAFT'),
    targetPlaceId: ulidColumn('target_place_id').references(() => places.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    revisionOfId: ulidColumn('revision_of_id'),
    submittedAt: timestamp('submitted_at', { fsp: 3 }),
    reviewedAt: timestamp('reviewed_at', { fsp: 3 }),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('idx_contributions_status_created').on(table.contributionStatus, table.createdAt),
    index('idx_contributions_submitter').on(table.submittedBy, table.createdAt),
    index('idx_contributions_target').on(table.targetPlaceId),
    foreignKey({
      name: 'fk_contributions_revision_of',
      columns: [table.revisionOfId],
      foreignColumns: [table.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    check('chk_contributions_version_positive', sql`${table.version} > 0`),
  ],
);

export const contributionPayloads = mysqlTable(
  'contribution_payloads',
  {
    contributionId: ulidColumn('contribution_id')
      .notNull()
      .references(() => contributions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    schemaVersion: int('schema_version', { unsigned: true }).notNull(),
    payload: json('payload').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ name: 'pk_contribution_payloads', columns: [table.contributionId] }),
    check('chk_contribution_payloads_schema_version', sql`${table.schemaVersion} > 0`),
  ],
);

export const contributionPhotos = mysqlTable(
  'contribution_photos',
  {
    id: ulidColumn().primaryKey(),
    contributionId: ulidColumn('contribution_id')
      .notNull()
      .references(() => contributions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: int('file_size').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_contribution_photos_object_key').on(table.objectKey),
    index('idx_contribution_photos_contribution').on(table.contributionId),
    check('chk_contribution_photos_file_size', sql`${table.fileSize} >= 0`),
  ],
);

export const moderationReviews = mysqlTable(
  'moderation_reviews',
  {
    id: ulidColumn().primaryKey(),
    contributionId: ulidColumn('contribution_id')
      .notNull()
      .references(() => contributions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    reviewerId: ulidColumn('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    decision: mysqlEnum('decision', moderationDecisionValues).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    adminNote: text('admin_note'),
    duplicatePlaceId: ulidColumn('duplicate_place_id').references(() => places.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('idx_moderation_reviews_contribution_created').on(table.contributionId, table.createdAt),
    index('idx_moderation_reviews_reviewer').on(table.reviewerId, table.createdAt),
  ],
);
