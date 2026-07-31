import { sql } from 'drizzle-orm';
import {
  check,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, ulidColumn } from './columns';
import { auditActorTypeValues } from './enums';
import { users } from './identity';
import { places } from './places';

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: ulidColumn().primaryKey(),
    actorType: mysqlEnum('actor_type', auditActorTypeValues).notNull().default('SYSTEM'),
    actorUserId: ulidColumn('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    actorRole: varchar('actor_role', { length: 40 }).notNull(),
    action: varchar('action', { length: 120 }).notNull(),
    targetType: varchar('target_type', { length: 100 }).notNull(),
    targetId: ulidColumn('target_id').notNull(),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    previousStatus: varchar('previous_status', { length: 80 }),
    nextStatus: varchar('next_status', { length: 80 }),
    previousValue: json('previous_value'),
    newValue: json('new_value'),
    metadata: json('metadata'),
    reason: text('reason'),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('idx_audit_target_created').on(table.targetType, table.targetId, table.createdAt),
    index('idx_audit_actor_created').on(table.actorUserId, table.createdAt),
    index('idx_audit_request').on(table.requestId),
    index('idx_audit_created').on(table.createdAt, table.id),
  ],
);

export const placeChangeHistory = mysqlTable(
  'place_change_history',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    changedBy: ulidColumn('changed_by').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    sourceType: varchar('source_type', { length: 80 }).notNull(),
    sourceId: ulidColumn('source_id'),
    changeType: varchar('change_type', { length: 100 }).notNull(),
    previousVersion: int('previous_version', { unsigned: true }),
    nextVersion: int('next_version', { unsigned: true }).notNull(),
    changedFields: json('changed_fields').notNull(),
    previousValue: json('previous_value'),
    newValue: json('new_value'),
    reason: text('reason'),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('idx_place_history_place_created').on(table.placeId, table.createdAt),
    index('idx_place_history_source').on(table.sourceType, table.sourceId),
    check(
      'chk_place_history_version_transition',
      sql`${table.previousVersion} IS NULL OR ${table.nextVersion} > ${table.previousVersion}`,
    ),
  ],
);
