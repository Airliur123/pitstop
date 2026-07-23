import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, point, ulidColumn, updatedAtColumn } from './columns';
import { contributions } from './contributions';
import { integrationProcessingStatusValues } from './enums';
import { places } from './places';

export const integrationSources = mysqlTable(
  'integration_sources',
  {
    id: ulidColumn().primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('uq_integration_sources_code').on(table.code)],
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
    signatureVersion: int('signature_version', { unsigned: true }).notNull(),
    receivedAt: timestamp('received_at', { fsp: 3 }).notNull(),
    processedAt: timestamp('processed_at', { fsp: 3 }),
    processingStatus: mysqlEnum('processing_status', integrationProcessingStatusValues)
      .notNull()
      .default('RECEIVED'),
    contributionId: ulidColumn('contribution_id').references(() => contributions.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    failureReason: text('failure_reason'),
  },
  (table) => [
    uniqueIndex('uq_google_form_source_external').on(
      table.integrationSourceId,
      table.externalSubmissionId,
    ),
    index('idx_google_form_status_received').on(table.processingStatus, table.receivedAt),
    check('chk_google_form_signature_version', sql`${table.signatureVersion} > 0`),
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
    queryText: varchar('query_text', { length: 1000 }).notNull(),
    resultLocation: point('result_location'),
    formattedAddress: varchar('formatted_address', { length: 500 }),
    confidence: decimal('confidence', { precision: 5, scale: 4 }),
    rawResponse: json('raw_response').notNull(),
    isAdminVerified: boolean('is_admin_verified').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
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
