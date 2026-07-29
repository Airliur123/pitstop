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

import { createdAtColumn, point, ulidColumn, updatedAtColumn } from './columns';
import {
  contributionSourceValues,
  contributionStatusValues,
  moderationActionValues,
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
    reviewedBy: ulidColumn('reviewed_by').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    reviewClaimedAt: timestamp('review_claimed_at', { fsp: 3 }),
    submittedAt: timestamp('submitted_at', { fsp: 3 }),
    reviewedAt: timestamp('reviewed_at', { fsp: 3 }),
    decisionReason: varchar('decision_reason', { length: 500 }),
    approvedAt: timestamp('approved_at', { fsp: 3 }),
    mergedAt: timestamp('merged_at', { fsp: 3 }),
    mergedPlaceId: ulidColumn('merged_place_id').references(() => places.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    verifiedLocation: point('verified_location'),
    verifiedDistrict: varchar('verified_district', { length: 120 }),
    verifiedCity: varchar('verified_city', { length: 120 }),
    verifiedProvince: varchar('verified_province', { length: 120 }),
    verifiedPostalCode: varchar('verified_postal_code', { length: 12 }),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('idx_contributions_status_created').on(table.contributionStatus, table.createdAt),
    index('idx_contributions_queue').on(table.contributionStatus, table.submittedAt, table.id),
    index('idx_contributions_reviewer_status').on(table.reviewedBy, table.contributionStatus),
    index('idx_contributions_submitter').on(table.submittedBy, table.createdAt),
    index('idx_contributions_submitter_id').on(table.submittedBy, table.id),
    index('idx_contributions_submitted_at').on(table.submittedAt),
    index('idx_contributions_target').on(table.targetPlaceId),
    index('idx_contributions_merged_place').on(table.mergedPlaceId),
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
    placeNameNormalized: varchar('place_name_normalized', { length: 180 }).generatedAlwaysAs(
      sql`LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.placeName'))))`,
      { mode: 'stored' },
    ),
    addressNormalized: varchar('address_normalized', { length: 500 }).generatedAlwaysAs(
      sql`LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.address'))))`,
      { mode: 'stored' },
    ),
    categoryCode: varchar('category_code', { length: 40 }).generatedAlwaysAs(
      sql`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.category'))`,
      { mode: 'stored' },
    ),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ name: 'pk_contribution_payloads', columns: [table.contributionId] }),
    index('idx_contribution_payloads_category').on(table.categoryCode, table.contributionId),
    index('idx_contribution_payloads_place_name').on(
      table.placeNameNormalized,
      table.contributionId,
    ),
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

export const moderationEvents = mysqlTable(
  'moderation_events',
  {
    id: ulidColumn().primaryKey(),
    contributionId: ulidColumn('contribution_id')
      .notNull()
      .references(() => contributions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    actorAdminId: ulidColumn('actor_admin_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    previousStatus: mysqlEnum('previous_status', contributionStatusValues).notNull(),
    nextStatus: mysqlEnum('next_status', contributionStatusValues).notNull(),
    action: mysqlEnum('action', moderationActionValues).notNull(),
    reason: varchar('reason', { length: 500 }),
    contributionVersion: int('contribution_version', { unsigned: true }).notNull(),
    mergedPlaceId: ulidColumn('merged_place_id').references(() => places.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('idx_moderation_events_contribution_created').on(
      table.contributionId,
      table.createdAt,
      table.id,
    ),
    index('idx_moderation_events_actor_created').on(table.actorAdminId, table.createdAt),
    index('idx_moderation_events_recent').on(table.createdAt, table.id),
    check('chk_moderation_events_version_positive', sql`${table.contributionVersion} > 0`),
  ],
);
