import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, deletedAtColumn, ulidColumn, updatedAtColumn } from './columns';
import { authProviderValues, userStatusValues } from './enums';

export const users = mysqlTable(
  'users',
  {
    id: ulidColumn().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    normalizedEmail: varchar('normalized_email', { length: 320 }).notNull(),
    activeNormalizedEmail: varchar('active_normalized_email', { length: 320 }).generatedAlwaysAs(
      sql`(CASE WHEN deleted_at IS NULL THEN normalized_email ELSE NULL END)`,
      { mode: 'stored' },
    ),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    status: mysqlEnum('status', userStatusValues).notNull().default('ACTIVE'),
    emailVerifiedAt: timestamp('email_verified_at', { fsp: 3 }),
    lastLoginAt: timestamp('last_login_at', { fsp: 3 }),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_users_active_normalized_email').on(table.activeNormalizedEmail),
    index('idx_users_status_deleted').on(table.status, table.deletedAt),
    check(
      'chk_users_normalized_email',
      sql`${table.normalizedEmail} = LOWER(TRIM(${table.email}))`,
    ),
    check('chk_users_version_positive', sql`${table.version} > 0`),
  ],
);

export const roles = mysqlTable(
  'roles',
  {
    id: ulidColumn().primaryKey(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: createdAtColumn(),
  },
  (table) => [uniqueIndex('uq_roles_code').on(table.code)],
);

export const userRoles = mysqlTable(
  'user_roles',
  {
    userId: ulidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    roleId: ulidColumn('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    assignedAt: timestamp('assigned_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    assignedBy: ulidColumn('assigned_by').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
  },
  (table) => [primaryKey({ name: 'pk_user_roles', columns: [table.userId, table.roleId] })],
);

export const authAccounts = mysqlTable(
  'auth_accounts',
  {
    id: ulidColumn().primaryKey(),
    userId: ulidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    provider: mysqlEnum('provider', authProviderValues).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_auth_accounts_provider_account').on(table.provider, table.providerAccountId),
    index('idx_auth_accounts_user').on(table.userId),
  ],
);

export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: ulidColumn().primaryKey(),
    userId: ulidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    tokenFamilyId: ulidColumn('token_family_id').notNull(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    revokedAt: timestamp('revoked_at', { fsp: 3 }),
    replacedByTokenId: ulidColumn('replaced_by_token_id'),
    userAgent: varchar('user_agent', { length: 512 }),
    ipHash: char('ip_hash', { length: 64 }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_refresh_tokens_token_hash').on(table.tokenHash),
    index('idx_refresh_tokens_user_family_revoked').on(
      table.userId,
      table.tokenFamilyId,
      table.revokedAt,
    ),
    index('idx_refresh_tokens_expires').on(table.expiresAt),
    foreignKey({
      name: 'fk_refresh_tokens_replaced_by',
      columns: [table.replacedByTokenId],
      foreignColumns: [table.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    check('chk_refresh_tokens_expiry', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const publicUserColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
  lastLoginAt: users.lastLoginAt,
  version: users.version,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;
