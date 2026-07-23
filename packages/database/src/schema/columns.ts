import { sql } from 'drizzle-orm';
import { char, customType, timestamp } from 'drizzle-orm/mysql-core';

export interface SpatialPoint {
  readonly longitude: number;
  readonly latitude: number;
}

export interface MySqlPointObject {
  readonly x: number;
  readonly y: number;
}

export type MySqlPointDriverValue = Buffer | MySqlPointObject;

const geographicSrid = 4326;
const mysqlPointBinaryLength = 25;

export const point = customType<{
  data: SpatialPoint;
  driverData: MySqlPointDriverValue;
}>({
  dataType: () => 'point',
  toDriver: (value) => {
    assertSpatialPoint(value);
    const buffer = Buffer.alloc(mysqlPointBinaryLength);
    buffer.writeUInt32LE(geographicSrid, 0);
    buffer.writeUInt8(1, 4);
    buffer.writeUInt32LE(1, 5);
    buffer.writeDoubleLE(value.longitude, 9);
    buffer.writeDoubleLE(value.latitude, 17);
    return buffer;
  },
  fromDriver: (value) => {
    if (Buffer.isBuffer(value)) return pointFromBinary(value);
    if (!isMySqlPointObject(value)) throw new TypeError('MySQL POINT driver value is invalid');
    return createSpatialPoint(value.x, value.y);
  },
});

function pointFromBinary(value: Buffer): SpatialPoint {
  if (
    value.length !== mysqlPointBinaryLength ||
    value.readUInt32LE(0) !== geographicSrid ||
    value.readUInt8(4) !== 1 ||
    value.readUInt32LE(5) !== 1
  ) {
    throw new TypeError('MySQL POINT binary value is invalid');
  }
  return createSpatialPoint(value.readDoubleLE(9), value.readDoubleLE(17));
}

function isMySqlPointObject(value: MySqlPointDriverValue): value is MySqlPointObject {
  return !Buffer.isBuffer(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function createSpatialPoint(longitude: number, latitude: number): SpatialPoint {
  const pointValue = { longitude, latitude };
  assertSpatialPoint(pointValue);
  return pointValue;
}

function assertSpatialPoint(value: SpatialPoint): void {
  if (!Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) {
    throw new RangeError('longitude must be between -180 and 180');
  }
  if (!Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90) {
    throw new RangeError('latitude must be between -90 and 90');
  }
}

export const ulidColumn = (name = 'id') => char(name, { length: 26 });

export const createdAtColumn = () =>
  timestamp('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`);

export const updatedAtColumn = () =>
  timestamp('updated_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .onUpdateNow();

export const deletedAtColumn = () => timestamp('deleted_at', { fsp: 3 });
