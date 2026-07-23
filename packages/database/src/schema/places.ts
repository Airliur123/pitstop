import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import { createdAtColumn, deletedAtColumn, point, ulidColumn, updatedAtColumn } from './columns';
import { facilityStatusValues, placeStatusValues, verificationStatusValues } from './enums';
import { users } from './identity';

export const places = mysqlTable(
  'places',
  {
    id: ulidColumn().primaryKey(),
    name: varchar('name', { length: 180 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    address: varchar('address', { length: 500 }).notNull(),
    landmark: varchar('landmark', { length: 255 }),
    district: varchar('district', { length: 120 }).notNull(),
    city: varchar('city', { length: 120 }).notNull(),
    province: varchar('province', { length: 120 }).notNull(),
    postalCode: varchar('postal_code', { length: 12 }),
    location: point('location').notNull(),
    placeStatus: mysqlEnum('place_status', placeStatusValues).notNull().default('DRAFT'),
    verificationStatus: mysqlEnum('verification_status', verificationStatusValues)
      .notNull()
      .default('UNVERIFIED'),
    verifiedAt: timestamp('verified_at', { fsp: 3 }),
    verifiedBy: ulidColumn('verified_by').references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    dataFreshnessAt: timestamp('data_freshness_at', { fsp: 3 }).notNull(),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_places_slug').on(table.slug),
    index('idx_places_status_verification').on(table.placeStatus, table.verificationStatus),
    index('idx_places_deleted_at').on(table.deletedAt),
    index('idx_places_data_freshness').on(table.dataFreshnessAt),
    index('idx_places_district_city').on(table.district, table.city),
    check('chk_places_version_positive', sql`${table.version} > 0`),
  ],
);

export const categories = mysqlTable(
  'categories',
  {
    id: ulidColumn().primaryKey(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: int('sort_order', { unsigned: true }).notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_categories_code').on(table.code),
    index('idx_categories_sort_order').on(table.sortOrder),
  ],
);

export const placeCategories = mysqlTable(
  'place_categories',
  {
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    categoryId: ulidColumn('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    primaryPlaceId: ulidColumn('primary_place_id').generatedAlwaysAs(
      sql`(CASE WHEN is_primary = 1 THEN place_id ELSE NULL END)`,
      { mode: 'stored' },
    ),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ name: 'pk_place_categories', columns: [table.placeId, table.categoryId] }),
    uniqueIndex('uq_place_categories_one_primary').on(table.primaryPlaceId),
    index('idx_place_categories_category').on(table.categoryId, table.placeId),
  ],
);

export const menus = mysqlTable(
  'menus',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description'),
    priceAmount: int('price_amount').notNull(),
    isMainItem: boolean('is_main_item').notNull().default(false),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: int('sort_order', { unsigned: true }).notNull().default(0),
    version: int('version', { unsigned: true }).notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_menus_place_name').on(table.placeId, table.name),
    index('idx_menus_place_main_available_price').on(
      table.placeId,
      table.isMainItem,
      table.isAvailable,
      table.priceAmount,
    ),
    check('chk_menus_price_nonnegative', sql`${table.priceAmount} >= 0`),
    check('chk_menus_version_positive', sql`${table.version} > 0`),
  ],
);

export const facilities = mysqlTable(
  'facilities',
  {
    id: ulidColumn().primaryKey(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex('uq_facilities_code').on(table.code)],
);

export const placeFacilities = mysqlTable(
  'place_facilities',
  {
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    facilityId: ulidColumn('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    facilityStatus: mysqlEnum('facility_status', facilityStatusValues).notNull().default('UNKNOWN'),
    confirmedAt: timestamp('confirmed_at', { fsp: 3 }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    primaryKey({ name: 'pk_place_facilities', columns: [table.placeId, table.facilityId] }),
    index('idx_place_facilities_status').on(table.facilityId, table.facilityStatus),
  ],
);

export const operatingHours = mysqlTable(
  'operating_hours',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    dayOfWeek: int('day_of_week', { unsigned: true }).notNull(),
    sequence: int('sequence', { unsigned: true }).notNull().default(0),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    is24Hours: boolean('is_24_hours').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_operating_hours_place_day_sequence').on(
      table.placeId,
      table.dayOfWeek,
      table.sequence,
    ),
    index('idx_operating_hours_place_day').on(table.placeId, table.dayOfWeek),
    check('chk_operating_hours_day', sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
    check('chk_operating_hours_sequence', sql`${table.sequence} >= 0`),
    check(
      'chk_operating_hours_mode',
      sql`(${table.is24Hours} = 1 AND ${table.opensAt} IS NULL AND ${table.closesAt} IS NULL) OR (${table.is24Hours} = 0 AND ${table.opensAt} IS NOT NULL AND ${table.closesAt} IS NOT NULL)`,
    ),
  ],
);

export const operatingHourExceptions = mysqlTable(
  'operating_hour_exceptions',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    exceptionDate: date('exception_date', { mode: 'string' }).notNull(),
    sequence: int('sequence', { unsigned: true }).notNull().default(0),
    isClosed: boolean('is_closed').notNull().default(false),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    note: varchar('note', { length: 500 }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_operating_exceptions_place_date_sequence').on(
      table.placeId,
      table.exceptionDate,
      table.sequence,
    ),
    check('chk_operating_exceptions_sequence', sql`${table.sequence} >= 0`),
    check(
      'chk_operating_exceptions_mode',
      sql`(${table.isClosed} = 1 AND ${table.opensAt} IS NULL AND ${table.closesAt} IS NULL) OR (${table.isClosed} = 0 AND ${table.opensAt} IS NOT NULL AND ${table.closesAt} IS NOT NULL)`,
    ),
  ],
);

export const placePhotos = mysqlTable(
  'place_photos',
  {
    id: ulidColumn().primaryKey(),
    placeId: ulidColumn('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: int('file_size').notNull(),
    width: int('width'),
    height: int('height'),
    sortOrder: int('sort_order', { unsigned: true }).notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    primaryPlaceId: ulidColumn('primary_place_id').generatedAlwaysAs(
      sql`(CASE WHEN is_primary = 1 AND deleted_at IS NULL THEN place_id ELSE NULL END)`,
      { mode: 'stored' },
    ),
    createdAt: createdAtColumn(),
    deletedAt: deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('uq_place_photos_object_key').on(table.objectKey),
    uniqueIndex('uq_place_photos_one_primary').on(table.primaryPlaceId),
    index('idx_place_photos_place_sort').on(table.placeId, table.sortOrder),
    check('chk_place_photos_file_size', sql`${table.fileSize} >= 0`),
    check('chk_place_photos_width', sql`${table.width} IS NULL OR ${table.width} > 0`),
    check('chk_place_photos_height', sql`${table.height} IS NULL OR ${table.height} > 0`),
  ],
);
