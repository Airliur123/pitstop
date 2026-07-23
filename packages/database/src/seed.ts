import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { createUlid } from './identifiers';
import { createDatabaseConnectionConfig, createDatabasePool } from './index';
import type { PlaceStatus, VerificationStatus } from './schema/enums';

interface CodeRow extends RowDataPacket {
  readonly id: string;
  readonly code: string;
}

interface IdRow extends RowDataPacket {
  readonly id: string;
}

interface SeedPlace {
  readonly name: string;
  readonly slug: string;
  readonly categoryCode: string;
  readonly menuName: string;
  readonly priceAmount: number;
  readonly district: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly placeStatus: PlaceStatus;
  readonly verificationStatus: VerificationStatus;
  readonly facilityCodes: readonly string[];
  readonly schedule: readonly SeedSchedule[];
}

interface SeedSchedule {
  readonly dayOfWeek: number;
  readonly sequence: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly is24Hours: boolean;
}

export interface SeedSummary {
  readonly roles: number;
  readonly categories: number;
  readonly facilities: number;
  readonly integrationSources: number;
  readonly places: number;
}

const roles = [
  { code: 'USER', name: 'User', description: 'Authenticated PitStop user' },
  { code: 'ADMIN', name: 'Admin', description: 'PitStop governance administrator' },
] as const;

const categories = [
  { code: 'MAKAN_MURAH', name: 'Makan Murah', isPrimary: true, sortOrder: 0 },
  { code: 'NGOPI', name: 'Ngopi', isPrimary: false, sortOrder: 1 },
  { code: 'TOILET', name: 'Toilet', isPrimary: false, sortOrder: 2 },
  { code: 'MUSALA', name: 'Musala', isPrimary: false, sortOrder: 3 },
  { code: 'ISTIRAHAT', name: 'Istirahat', isPrimary: false, sortOrder: 4 },
] as const;

const facilities = [
  { code: 'PARKING', name: 'Parkir' },
  { code: 'TOILET', name: 'Toilet' },
  { code: 'MUSALA', name: 'Musala' },
  { code: 'POWER_OUTLET', name: 'Colokan' },
  { code: 'SEATING', name: 'Tempat Duduk' },
  { code: 'SHADE', name: 'Area Teduh' },
  { code: 'WIFI', name: 'Wi-Fi' },
] as const;

const integrationSources = [{ code: 'GOOGLE_FORM', name: 'Google Form' }] as const;

function dailySchedule(opensAt: string, closesAt: string): readonly SeedSchedule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    sequence: 0,
    opensAt,
    closesAt,
    is24Hours: false,
  }));
}

function allDaySchedule(): readonly SeedSchedule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    sequence: 0,
    opensAt: null,
    closesAt: null,
    is24Hours: true,
  }));
}

const seedPlaces: readonly SeedPlace[] = [
  {
    name: 'Warung Bu Ani',
    slug: 'data-simulasi-warung-bu-ani',
    categoryCode: 'MAKAN_MURAH',
    menuName: 'Nasi telur',
    priceAmount: 12_000,
    district: 'Tambora',
    longitude: 106.8061,
    latitude: -6.1468,
    placeStatus: 'ACTIVE',
    verificationStatus: 'ADMIN_VERIFIED',
    facilityCodes: ['TOILET', 'PARKING'],
    schedule: [
      ...dailySchedule('08:00:00', '22:00:00').filter(({ dayOfWeek }) => dayOfWeek !== 0),
      { dayOfWeek: 0, sequence: 0, opensAt: '08:00:00', closesAt: '14:00:00', is24Hours: false },
      { dayOfWeek: 0, sequence: 1, opensAt: '17:00:00', closesAt: '22:00:00', is24Hours: false },
    ],
  },
  {
    name: 'Warkop Bang Udin',
    slug: 'data-simulasi-warkop-bang-udin',
    categoryCode: 'NGOPI',
    menuName: 'Kopi',
    priceAmount: 5_000,
    district: 'Tambora',
    longitude: 106.8039,
    latitude: -6.1491,
    placeStatus: 'ACTIVE',
    verificationStatus: 'ADMIN_VERIFIED',
    facilityCodes: ['POWER_OUTLET', 'WIFI'],
    schedule: dailySchedule('17:00:00', '01:00:00'),
  },
  {
    name: 'Warteg Barokah',
    slug: 'data-simulasi-warteg-barokah',
    categoryCode: 'MAKAN_MURAH',
    menuName: 'Nasi rames',
    priceAmount: 13_000,
    district: 'Grogol',
    longitude: 106.7972,
    latitude: -6.167,
    placeStatus: 'TEMPORARILY_CLOSED',
    verificationStatus: 'ADMIN_VERIFIED',
    facilityCodes: ['PARKING', 'TOILET'],
    schedule: dailySchedule('07:00:00', '21:00:00'),
  },
  {
    name: 'Nasi Uduk Ibu Rini',
    slug: 'data-simulasi-nasi-uduk-ibu-rini',
    categoryCode: 'MAKAN_MURAH',
    menuName: 'Nasi uduk telur',
    priceAmount: 14_000,
    district: 'Cengkareng',
    longitude: 106.734,
    latitude: -6.143,
    placeStatus: 'ACTIVE',
    verificationStatus: 'COMMUNITY_CONFIRMED',
    facilityCodes: ['SHADE'],
    schedule: dailySchedule('05:30:00', '11:00:00'),
  },
  {
    name: 'Warung Madura 24 Jam',
    slug: 'data-simulasi-warung-madura-24-jam',
    categoryCode: 'ISTIRAHAT',
    menuName: 'Mie instan',
    priceAmount: 10_000,
    district: 'Kalideres',
    longitude: 106.703,
    latitude: -6.138,
    placeStatus: 'ACTIVE',
    verificationStatus: 'ADMIN_VERIFIED',
    facilityCodes: ['PARKING', 'POWER_OUTLET'],
    schedule: allDaySchedule(),
  },
] as const;

export async function seedDatabase(pool: Pool): Promise<SeedSummary> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await seedRoles(connection);
    await seedCategories(connection);
    await seedFacilities(connection);
    await seedIntegrationSources(connection);
    await seedSimulationPlaces(connection);
    await connection.commit();
    return {
      roles: roles.length,
      categories: categories.length,
      facilities: facilities.length,
      integrationSources: integrationSources.length,
      places: seedPlaces.length,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function seedRoles(connection: PoolConnection): Promise<void> {
  for (const role of roles) {
    await connection.execute(
      `INSERT INTO roles (id, code, name, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
      [createUlid(), role.code, role.name, role.description],
    );
  }
}

async function seedCategories(connection: PoolConnection): Promise<void> {
  for (const category of categories) {
    await connection.execute(
      `INSERT INTO categories (id, code, name, description, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
         is_primary = VALUES(is_primary), sort_order = VALUES(sort_order)`,
      [
        createUlid(),
        category.code,
        category.name,
        'Data Simulasi - kategori development/test',
        category.isPrimary,
        category.sortOrder,
      ],
    );
  }
}

async function seedFacilities(connection: PoolConnection): Promise<void> {
  for (const facility of facilities) {
    await connection.execute(
      `INSERT INTO facilities (id, code, name, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
      [createUlid(), facility.code, facility.name, 'Data Simulasi - fasilitas development/test'],
    );
  }
}

async function seedIntegrationSources(connection: PoolConnection): Promise<void> {
  for (const source of integrationSources) {
    await connection.execute(
      `INSERT INTO integration_sources (id, code, name, is_active)
       VALUES (?, ?, ?, true)
       ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = true`,
      [createUlid(), source.code, source.name],
    );
  }
}

async function seedSimulationPlaces(connection: PoolConnection): Promise<void> {
  const categoryIds = await loadCodeMap(connection, 'categories');
  const facilityIds = await loadCodeMap(connection, 'facilities');

  for (const place of seedPlaces) {
    await connection.execute(
      `INSERT INTO places (
         id, name, slug, description, address, district, city, province, postal_code,
         location, place_status, verification_status, verified_at, data_freshness_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SRID(POINT(?, ?), 4326), ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
         address = VALUES(address), district = VALUES(district), city = VALUES(city),
         province = VALUES(province), postal_code = VALUES(postal_code), location = VALUES(location),
         place_status = VALUES(place_status), verification_status = VALUES(verification_status),
         data_freshness_at = VALUES(data_freshness_at), version = version + 1`,
      [
        createUlid(),
        place.name,
        place.slug,
        'Data Simulasi - bukan bisnis atau alamat publik nyata.',
        `Alamat Data Simulasi, ${place.district}, Jakarta Barat`,
        place.district,
        'Jakarta Barat',
        'DKI Jakarta',
        '00000',
        place.longitude,
        place.latitude,
        place.placeStatus,
        place.verificationStatus,
      ],
    );

    const placeId = await loadPlaceId(connection, place.slug);
    const categoryId = requiredMapValue(categoryIds, place.categoryCode);
    await connection.execute(
      `INSERT INTO place_categories (place_id, category_id, is_primary)
       VALUES (?, ?, true)
       ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
      [placeId, categoryId],
    );
    await connection.execute(
      `INSERT INTO menus (id, place_id, name, description, price_amount, is_main_item, is_available)
       VALUES (?, ?, ?, ?, ?, true, true)
       ON DUPLICATE KEY UPDATE description = VALUES(description), price_amount = VALUES(price_amount),
         is_main_item = true, is_available = true, deleted_at = NULL, version = version + 1`,
      [
        createUlid(),
        placeId,
        place.menuName,
        'Data Simulasi - menu development/test',
        place.priceAmount,
      ],
    );

    for (const facilityCode of place.facilityCodes) {
      await connection.execute(
        `INSERT INTO place_facilities (place_id, facility_id, facility_status, confirmed_at)
         VALUES (?, ?, 'AVAILABLE', CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE facility_status = 'AVAILABLE', confirmed_at = CURRENT_TIMESTAMP(3)`,
        [placeId, requiredMapValue(facilityIds, facilityCode)],
      );
    }

    for (const schedule of place.schedule) {
      await connection.execute(
        `INSERT INTO operating_hours (
           id, place_id, day_of_week, sequence, opens_at, closes_at, is_24_hours
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE opens_at = VALUES(opens_at), closes_at = VALUES(closes_at),
           is_24_hours = VALUES(is_24_hours)`,
        [
          createUlid(),
          placeId,
          schedule.dayOfWeek,
          schedule.sequence,
          schedule.opensAt,
          schedule.closesAt,
          schedule.is24Hours,
        ],
      );
    }
  }
}

async function loadCodeMap(
  connection: PoolConnection,
  table: 'categories' | 'facilities',
): Promise<ReadonlyMap<string, string>> {
  const query =
    table === 'categories' ? 'SELECT id, code FROM categories' : 'SELECT id, code FROM facilities';
  const [rows] = await connection.query<CodeRow[]>(query);
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function loadPlaceId(connection: PoolConnection, slug: string): Promise<string> {
  const [rows] = await connection.execute<IdRow[]>('SELECT id FROM places WHERE slug = ?', [slug]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Seeded place not found for slug: ${slug}`);
  return id;
}

function requiredMapValue(values: ReadonlyMap<string, string>, code: string): string {
  const value = values.get(code);
  if (!value) throw new Error(`Seed master data missing code: ${code}`);
  return value;
}

async function runSeedCommand(): Promise<void> {
  loadWorkspaceEnvironment(fileURLToPath(new URL('../../../', import.meta.url)));
  const pool = createDatabasePool(createDatabaseConnectionConfig(process.env));
  try {
    const summary = await seedDatabase(pool);
    process.stdout.write(`Seed complete: ${JSON.stringify(summary)}\n`);
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await runSeedCommand();
}
