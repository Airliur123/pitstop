import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface SpatialSearchInput {
  readonly longitude: number;
  readonly latitude: number;
  readonly radiusMeters?: number;
  readonly limit?: number;
}

export interface SpatialPlaceResult {
  readonly id: string;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly distanceMeters: number;
}

interface SpatialPlaceRow extends RowDataPacket {
  readonly id: string;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly distance_meters: number;
}

const radiusQuery = `
SELECT
  id,
  name,
  ST_Longitude(location) AS longitude,
  ST_Latitude(location) AS latitude,
  ST_Distance_Sphere(location, ST_SRID(POINT(?, ?), 4326)) AS distance_meters
FROM places
WHERE place_status = 'ACTIVE'
  AND verification_status = 'ADMIN_VERIFIED'
  AND deleted_at IS NULL
  AND ST_Distance_Sphere(location, ST_SRID(POINT(?, ?), 4326)) <= ?
ORDER BY distance_meters ASC
LIMIT 100`;

export async function findPlacesWithinRadius(
  executor: Pick<Pool, 'execute'>,
  input: SpatialSearchInput,
): Promise<readonly SpatialPlaceResult[]> {
  assertSpatialInput(input);
  const radiusMeters = input.radiusMeters ?? 5_000;
  const limit = input.limit ?? 20;
  const parameters: number[] = [
    input.longitude,
    input.latitude,
    input.longitude,
    input.latitude,
    radiusMeters,
  ];
  const [rows] = await executor.execute<SpatialPlaceRow[]>(radiusQuery, parameters);
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    distanceMeters: Number(row.distance_meters),
  }));
}

function assertSpatialInput(input: SpatialSearchInput): void {
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new RangeError('longitude must be between -180 and 180');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new RangeError('latitude must be between -90 and 90');
  }
  if ((input.radiusMeters ?? 5_000) <= 0) {
    throw new RangeError('radiusMeters must be positive');
  }
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer between 1 and 100');
  }
}
