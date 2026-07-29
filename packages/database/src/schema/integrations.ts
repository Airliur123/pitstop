import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, point, ulidColumn, updatedAtColumn } from './columns';
import { contributions } from './contributions';
import {
  geocodingResultStatusValues,
  integrationProcessingStatusValues,
  integrationStageStatusValues,
} from './enums';
import { places } from './places';

export const integrationSources = mysqlTable(
  'integration_sources',
  {
    id: ulidColumn().primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    currentKeyId: varchar('current_key_id', { length: 64 }).notNull(),
    previousKeyId: varchar('previous_key_id', { length: 64 }),
    replayWindowSeconds: int('replay_window_seconds', { unsigned: true }).notNull().default(300),
    rateLimitWindowSeconds: int('rate_limit_window_seconds', { unsigned: true })
      .notNull()
      .default(60),
    rateLimitMaximum: int('rate_limit_maximum', { unsigned: true }).notNull().default(120),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_integration_sources_code').on(table.code),
    check('chk_integration_source_replay_window', sql`${table.replayWindowSeconds} > 0`),
    check('chk_integration_source_rate_window', sql`${table.rateLimitWindowSeconds} > 0`),
    check('chk_integration_source_rate_maximum', sql`${table.rateLimitMaximum} > 0`),
  ],
);

export const googleFormSubmissions = mysqlTable(
  'google_form_submissions',
  {
    id: ulidColumn().primaryKey(),
    integrationSourceId: ulidColumn('integration_source_id')
      .notNull()
      .references(() => integrationSources.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    externalSubmissionId: varchar('external_submission_id', { length: 255 }).notNull(),
    payload: json('payload').notNull(),
    payloadSchemaVersion: int('payload_schema_version', { unsigned: true }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    acceptedKeyId: varchar('accepted_key_id', { length: 64 }).notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    receivedAt: timestamp('received_at', { fsp: 3 }).notNull(),
    submittedAt: timestamp('submitted_at', { fsp: 3 }).notNull(),
    queuedAt: timestamp('queued_at', { fsp: 3 }),
    processedAt: timestamp('processed_at', { fsp: 3 }),
    processingStatus: mysqlEnum('processing_status', integrationProcessingStatusValues)
      .notNull()
      .default('RECEIVED'),
    attemptCount: int('attempt_count', { unsigned: true }).notNull().default(0),
    lastErrorClass: varchar('last_error_class', { length: 80 }),
    lastErrorCode: varchar('last_error_code', { length: 120 }),
    contributionId: ulidColumn('contribution_id').references(() => contributions.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    geocodingStatus: mysqlEnum('geocoding_status', integrationStageStatusValues)
      .notNull()
      .default('PENDING'),
    duplicateDetectionStatus: mysqlEnum('duplicate_detection_status', integrationStageStatusValues)
      .notNull()
      .default('PENDING'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_google_form_source_external').on(
      table.integrationSourceId,
      table.externalSubmissionId,
    ),
    index('idx_google_form_status_received').on(table.processingStatus, table.receivedAt),
    index('idx_google_form_contribution').on(table.contributionId),
    check('chk_google_form_payload_schema_version', sql`${table.payloadSchemaVersion} > 0`),
  ],
);

export const geocodingResults = mysqlTable(
  'geocoding_results',
  {
    id: ulidColumn().primaryKey(),
    contributionId: ulidColumn('contribution_id').references(() => contributions.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    placeId: ulidColumn('place_id').references(() => places.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    provider: varchar('provider', { length: 80 }).notNull(),
    resultLocation: point('result_location'),
    normalizedAddress: varchar('normalized_address', { length: 500 }),
    confidence: decimal('confidence', { precision: 5, scale: 4 }),
    status: mysqlEnum('status', geocodingResultStatusValues).notNull(),
    rawResponse: json('raw_response'),
    isAdminVerified: boolean('is_admin_verified').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_geocoding_contribution').on(table.contributionId),
    index('idx_geocoding_contribution').on(table.contributionId, table.createdAt),
    index('idx_geocoding_place').on(table.placeId, table.createdAt),
    check(
      'chk_geocoding_subject',
      sql`(${table.contributionId} IS NOT NULL) <> (${table.placeId} IS NOT NULL)`,
    ),
    check(
      'chk_geocoding_confidence',
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`,
    ),
  ],
);

export const duplicatePlaceHints = mysqlTable(
  'duplicate_place_hints',
  {
    id: ulidColumn().primaryKey(),
    contributionId: ulidColumn('contribution_id').notNull(),
    googleFormSubmissionId: ulidColumn('google_form_submission_id').notNull(),
    candidatePlaceId: ulidColumn('candidate_place_id').notNull(),
    distanceMeters: int('distance_meters', { unsigned: true }).notNull(),
    matchedSignals: json('matched_signals').notNull(),
    hintScore: decimal('hint_score', { precision: 5, scale: 4 }).notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_duplicate_hint_contribution_place').on(
      table.contributionId,
      table.candidatePlaceId,
    ),
    index('idx_duplicate_hint_submission').on(table.googleFormSubmissionId, table.createdAt),
    index('idx_duplicate_hint_candidate').on(table.candidatePlaceId, table.createdAt),
    foreignKey({
      name: 'fk_duplicate_hint_contribution',
      columns: [table.contributionId],
      foreignColumns: [contributions.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'fk_duplicate_hint_submission',
      columns: [table.googleFormSubmissionId],
      foreignColumns: [googleFormSubmissions.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'fk_duplicate_hint_candidate',
      columns: [table.candidatePlaceId],
      foreignColumns: [places.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check('chk_duplicate_hint_distance', sql`${table.distanceMeters} >= 0`),
    check('chk_duplicate_hint_score', sql`${table.hintScore} >= 0 AND ${table.hintScore} <= 1`),
  ],
);

export const idempotencyKeys = mysqlTable(
  'idempotency_keys',
  {
    id: ulidColumn().primaryKey(),
    scope: varchar('scope', { length: 120 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseStatus: int('response_status', { unsigned: true }),
    responseBody: json('response_body'),
    lockedUntil: timestamp('locked_until', { fsp: 3 }),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_idempotency_scope_key').on(table.scope, table.idempotencyKey),
    index('idx_idempotency_expires').on(table.expiresAt),
    check(
      'chk_idempotency_response_status',
      sql`${table.responseStatus} IS NULL OR ${table.responseStatus} BETWEEN 100 AND 599`,
    ),
    check('chk_idempotency_expiry', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
