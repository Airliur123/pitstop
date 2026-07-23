import type { Pool, RowDataPacket } from 'mysql2/promise';

export type PublicPlaceQuerySort = 'NEAREST' | 'CHEAPEST' | 'FRESHEST';

export interface DatabasePublicCategory {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly isPrimary: boolean;
  readonly sortOrder: number;
}

export interface DatabasePublicPlaceCategory {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isPrimary: boolean;
}

export interface DatabasePublicFacility {
  readonly code: string;
  readonly name: string;
  readonly status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
}

export interface DatabasePublicOperatingHour {
  readonly dayOfWeek: number;
  readonly sequence: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly is24Hours: boolean;
}

export interface DatabasePublicOperatingHourException {
  readonly exceptionDate: string;
  readonly sequence: number;
  readonly isClosed: boolean;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly note: string | null;
}

export interface DatabasePublicPlace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly distanceMeters: number;
  readonly dataFreshnessAt: string;
  readonly primaryCategory: DatabasePublicPlaceCategory;
  readonly categories: readonly DatabasePublicPlaceCategory[];
  readonly facilities: readonly DatabasePublicFacility[];
  readonly cheapestAvailableMainItem: {
    readonly name: string;
    readonly priceAmount: number;
  } | null;
  readonly cheapestQualifyingItem: {
    readonly name: string;
    readonly priceAmount: number;
  } | null;
  readonly operatingHours: readonly DatabasePublicOperatingHour[];
  readonly operatingHourExceptions: readonly DatabasePublicOperatingHourException[];
  readonly communityConfirmationCount: number;
}

export interface PublicPlaceCursor {
  readonly id: string;
  readonly distanceMeters: number;
  readonly priceAmount: number | null;
  readonly dataFreshnessAt: string;
}

export interface SearchPublicPlacesInput {
  readonly longitude: number;
  readonly latitude: number;
  readonly radiusMeters: number;
  readonly category: string | null;
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
  readonly sort: PublicPlaceQuerySort;
  readonly limit: number;
  readonly cursor?: PublicPlaceCursor;
}

export interface SearchPublicPlacesResult {
  readonly places: readonly DatabasePublicPlace[];
  readonly hasMore: boolean;
}

export interface DatabasePublicMenu {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceAmount: number;
  readonly isMainItem: boolean;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
}

export interface DatabasePublicPlaceDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly verifiedAt: string | null;
  readonly dataFreshnessAt: string;
  readonly categories: readonly DatabasePublicPlaceCategory[];
  readonly menus: readonly DatabasePublicMenu[];
  readonly facilities: readonly DatabasePublicFacility[];
  readonly operatingHours: readonly DatabasePublicOperatingHour[];
  readonly operatingHourExceptions: readonly DatabasePublicOperatingHourException[];
  readonly photoCount: number;
}

export interface RecommendationFallbackInput {
  readonly longitude: number;
  readonly latitude: number;
  readonly radiusMeters: number;
  readonly fallbackRadiusMeters: number;
  readonly category: string;
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
}

export interface RecommendationFallbackDiagnostic {
  readonly categoryPlaceCount: number;
  readonly verifiedPlaceCount: number;
  readonly minimumMainItemAmountWithinRadius: number | null;
  readonly nearestOutsidePlace: DatabasePublicPlace | null;
}

interface CategoryRow extends RowDataPacket {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly is_primary: number;
  readonly sort_order: number;
}

interface PlaceRow extends RowDataPacket {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postal_code: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly distance_meters: number;
  readonly data_freshness_at: Date | string;
  readonly primary_category_json: unknown;
  readonly categories_json: unknown;
  readonly facilities_json: unknown;
  readonly cheapest_available_main_item_amount: number | null;
  readonly cheapest_available_main_item_name: string | null;
  readonly cheapest_qualifying_item_amount: number | null;
  readonly cheapest_qualifying_item_name: string | null;
  readonly operating_hours_json: unknown;
  readonly operating_hour_exceptions_json: unknown;
  readonly community_confirmation_count: number;
}

interface DetailRow extends RowDataPacket {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly landmark: string | null;
  readonly district: string;
  readonly city: string;
  readonly province: string;
  readonly postal_code: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly verified_at: Date | string | null;
  readonly data_freshness_at: Date | string;
}

interface PlaceCategoryRow extends RowDataPacket {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly is_primary: number;
}

interface MenuRow extends RowDataPacket {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly price_amount: number;
  readonly is_main_item: number;
  readonly is_available: number;
  readonly sort_order: number;
}

interface FacilityRow extends RowDataPacket {
  readonly code: string;
  readonly name: string;
  readonly facility_status: DatabasePublicFacility['status'];
}

interface OperatingHourRow extends RowDataPacket {
  readonly day_of_week: number;
  readonly sequence: number;
  readonly opens_at: string | null;
  readonly closes_at: string | null;
  readonly is_24_hours: number;
}

interface OperatingHourExceptionRow extends RowDataPacket {
  readonly exception_date: string;
  readonly sequence: number;
  readonly is_closed: number;
  readonly opens_at: string | null;
  readonly closes_at: string | null;
  readonly note: string | null;
}

interface CountRow extends RowDataPacket {
  readonly count: number;
}

interface AmountRow extends RowDataPacket {
  readonly amount: number | null;
}

const placeProjection = `
  p.id,
  p.slug,
  p.name,
  p.description,
  p.address,
  p.landmark,
  p.district,
  p.city,
  p.province,
  p.postal_code,
  ST_Longitude(p.location) AS longitude,
  ST_Latitude(p.location) AS latitude,
  ST_Distance_Sphere(p.location, ST_SRID(POINT(?, ?), 4326)) AS distance_meters,
  p.data_freshness_at,
  JSON_OBJECT(
    'id', primary_c.id,
    'code', primary_c.code,
    'name', primary_c.name,
    'isPrimary', true
  ) AS primary_category_json,
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT('id', c.id, 'code', c.code, 'name', c.name, 'isPrimary', pc.is_primary)
    )
    FROM place_categories pc
    JOIN categories c ON c.id = pc.category_id
    WHERE pc.place_id = p.id
  ) AS categories_json,
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT('code', f.code, 'name', f.name, 'status', pf.facility_status)
    )
    FROM place_facilities pf
    JOIN facilities f ON f.id = pf.facility_id
    WHERE pf.place_id = p.id
  ) AS facilities_json,
  ms.cheapest_available_main_item_amount,
  (
    SELECT m.name FROM menus m
    WHERE m.place_id = p.id AND m.is_main_item = true AND m.is_available = true
      AND m.deleted_at IS NULL AND m.price_amount = ms.cheapest_available_main_item_amount
    ORDER BY m.sort_order ASC, m.id ASC LIMIT 1
  ) AS cheapest_available_main_item_name,
  ms.cheapest_qualifying_item_amount,
  (
    SELECT m.name FROM menus m
    WHERE m.place_id = p.id AND m.is_main_item = true AND m.is_available = true
      AND m.deleted_at IS NULL AND m.price_amount = ms.cheapest_qualifying_item_amount
    ORDER BY m.sort_order ASC, m.id ASC LIMIT 1
  ) AS cheapest_qualifying_item_name,
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'dayOfWeek', h.day_of_week,
        'sequence', h.sequence,
        'opensAt', h.opens_at,
        'closesAt', h.closes_at,
        'is24Hours', h.is_24_hours
      )
    )
    FROM operating_hours h
    WHERE h.place_id = p.id
  ) AS operating_hours_json,
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'exceptionDate', e.exception_date,
        'sequence', e.sequence,
        'isClosed', e.is_closed,
        'opensAt', e.opens_at,
        'closesAt', e.closes_at,
        'note', e.note
      )
    )
    FROM operating_hour_exceptions e
    WHERE e.place_id = p.id
  ) AS operating_hour_exceptions_json,
  (
    SELECT COUNT(*) FROM place_confirmations confirmation
    WHERE confirmation.place_id = p.id
      AND confirmation.confirmation_type = 'STILL_VALID'
  ) AS community_confirmation_count`;

function eligiblePlacesCte(spatialPrefilter: boolean): string {
  return `
WITH menu_summary AS (
  SELECT
    place_id,
    MIN(
      CASE
        WHEN is_main_item = true AND is_available = true AND deleted_at IS NULL
        THEN price_amount
        ELSE NULL
      END
    ) AS cheapest_available_main_item_amount,
    MIN(
      CASE
        WHEN is_main_item = true AND is_available = true AND deleted_at IS NULL
          AND (? IS NULL OR price_amount <= ?)
        THEN price_amount
        ELSE NULL
      END
    ) AS cheapest_qualifying_item_amount
  FROM menus
  GROUP BY place_id
),
eligible_places AS (
  SELECT
    ${placeProjection}
  FROM places p
  JOIN place_categories primary_pc ON primary_pc.place_id = p.id AND primary_pc.is_primary = true
  JOIN categories primary_c ON primary_c.id = primary_pc.category_id
  LEFT JOIN menu_summary ms ON ms.place_id = p.id
  WHERE p.place_status = 'ACTIVE'
    AND p.verification_status = 'ADMIN_VERIFIED'
    AND p.deleted_at IS NULL
    ${spatialPrefilter ? "AND MBRContains(ST_GeomFromText(?, 4326, 'axis-order=long-lat'), p.location)" : ''}
    AND (? IS NULL OR EXISTS (
      SELECT 1
      FROM place_categories filter_pc
      JOIN categories filter_c ON filter_c.id = filter_pc.category_id
      WHERE filter_pc.place_id = p.id AND filter_c.code = ?
    ))
    AND (? = 0 OR ms.cheapest_qualifying_item_amount IS NOT NULL)
)`;
}

export async function findPublicCategories(
  executor: Pick<Pool, 'execute'>,
): Promise<readonly DatabasePublicCategory[]> {
  const [rows] = await executor.execute<CategoryRow[]>(
    `SELECT id, code, name, description, is_primary, sort_order
     FROM categories
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isPrimary: Boolean(row.is_primary),
    sortOrder: Number(row.sort_order),
  }));
}

export async function searchPublicPlaces(
  executor: Pick<Pool, 'query'>,
  input: SearchPublicPlacesInput,
): Promise<SearchPublicPlacesResult> {
  assertSearchInput(input);
  const boundingBox = createBoundingBoxWkt(input.longitude, input.latitude, input.radiusMeters);
  const cursorClause = createCursorClause(input.sort, input.cursor);
  const orderClause = orderByClause(input.sort);
  const query = `${eligiblePlacesCte(boundingBox !== null)}
SELECT *
FROM eligible_places
WHERE distance_meters <= ?
  ${cursorClause.sql}
ORDER BY ${orderClause}
LIMIT ?`;
  const effectiveBudget = input.budgetApplied ? input.budgetAmount : null;
  const parameters: (number | string | null)[] = [
    effectiveBudget,
    effectiveBudget,
    input.longitude,
    input.latitude,
    ...(boundingBox === null ? [] : [boundingBox]),
    input.category,
    input.category,
    input.budgetApplied ? 1 : 0,
    input.radiusMeters,
    ...cursorClause.parameters,
    input.limit + 1,
  ];
  const [rows] = await executor.query<PlaceRow[]>(query, parameters);
  return {
    places: rows.slice(0, input.limit).map(mapPlaceRow),
    hasMore: rows.length > input.limit,
  };
}

function createBoundingBoxWkt(
  longitude: number,
  latitude: number,
  radiusMeters: number,
): string | null {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeScale = Math.cos((latitude * Math.PI) / 180);
  if (Math.abs(longitudeScale) < 0.000_001) return null;
  const longitudeDelta = radiusMeters / (111_320 * Math.abs(longitudeScale));
  const minimumLongitude = longitude - longitudeDelta;
  const maximumLongitude = longitude + longitudeDelta;
  if (minimumLongitude < -180 || maximumLongitude > 180) return null;
  const minimumLatitude = Math.max(-90, latitude - latitudeDelta);
  const maximumLatitude = Math.min(90, latitude + latitudeDelta);
  return `POLYGON((
    ${minimumLongitude} ${minimumLatitude},
    ${maximumLongitude} ${minimumLatitude},
    ${maximumLongitude} ${maximumLatitude},
    ${minimumLongitude} ${maximumLatitude},
    ${minimumLongitude} ${minimumLatitude}
  ))`;
}

export async function findPublicPlaceBySlug(
  executor: Pick<Pool, 'execute'>,
  slug: string,
): Promise<DatabasePublicPlaceDetail | null> {
  const [placeRows] = await executor.execute<DetailRow[]>(
    `SELECT
       id, slug, name, description, address, landmark, district, city, province, postal_code,
       ST_Longitude(location) AS longitude, ST_Latitude(location) AS latitude,
       verified_at, data_freshness_at
     FROM places
     WHERE slug = ? AND place_status = 'ACTIVE'
       AND verification_status = 'ADMIN_VERIFIED' AND deleted_at IS NULL
     LIMIT 1`,
    [slug],
  );
  const place = placeRows[0];
  if (!place) return null;

  const [categoryResult, menuResult, facilityResult, hoursResult, exceptionsResult, photoResult] =
    await Promise.all([
      executor.execute<PlaceCategoryRow[]>(
        `SELECT c.id, c.code, c.name, pc.is_primary
         FROM place_categories pc
         JOIN categories c ON c.id = pc.category_id
         WHERE pc.place_id = ?
         ORDER BY c.sort_order ASC, c.id ASC`,
        [place.id],
      ),
      executor.execute<MenuRow[]>(
        `SELECT id, name, description, price_amount, is_main_item, is_available, sort_order
         FROM menus
         WHERE place_id = ? AND deleted_at IS NULL AND is_available = true
         ORDER BY sort_order ASC, price_amount ASC, id ASC`,
        [place.id],
      ),
      executor.execute<FacilityRow[]>(
        `SELECT f.code, f.name, pf.facility_status
         FROM place_facilities pf
         JOIN facilities f ON f.id = pf.facility_id
         WHERE pf.place_id = ?
         ORDER BY f.code ASC`,
        [place.id],
      ),
      executor.execute<OperatingHourRow[]>(
        `SELECT day_of_week, sequence, opens_at, closes_at, is_24_hours
         FROM operating_hours
         WHERE place_id = ?
         ORDER BY day_of_week ASC, sequence ASC`,
        [place.id],
      ),
      executor.execute<OperatingHourExceptionRow[]>(
        `SELECT exception_date, sequence, is_closed, opens_at, closes_at, note
         FROM operating_hour_exceptions
         WHERE place_id = ? AND exception_date >= CURRENT_DATE()
         ORDER BY exception_date ASC, sequence ASC
         LIMIT 100`,
        [place.id],
      ),
      executor.execute<CountRow[]>(
        `SELECT COUNT(*) AS count
         FROM place_photos
         WHERE place_id = ? AND deleted_at IS NULL`,
        [place.id],
      ),
    ]);

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    description: place.description,
    address: place.address,
    landmark: place.landmark,
    district: place.district,
    city: place.city,
    province: place.province,
    postalCode: place.postal_code,
    longitude: Number(place.longitude),
    latitude: Number(place.latitude),
    verifiedAt: place.verified_at === null ? null : toIsoString(place.verified_at),
    dataFreshnessAt: toIsoString(place.data_freshness_at),
    categories: categoryResult[0].map(mapCategoryRow),
    menus: menuResult[0].map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceAmount: Number(row.price_amount),
      isMainItem: Boolean(row.is_main_item),
      isAvailable: Boolean(row.is_available),
      sortOrder: Number(row.sort_order),
    })),
    facilities: facilityResult[0].map(mapFacilityRow),
    operatingHours: hoursResult[0].map(mapOperatingHourRow),
    operatingHourExceptions: exceptionsResult[0].map(mapOperatingHourExceptionRow),
    photoCount: Number(photoResult[0][0]?.count ?? 0),
  };
}

export async function findRecommendationFallback(
  executor: Pick<Pool, 'execute' | 'query'>,
  input: RecommendationFallbackInput,
): Promise<RecommendationFallbackDiagnostic> {
  const [categoryRows, verifiedRows, amountRows, outsideResult] = await Promise.all([
    executor.execute<CountRow[]>(
      `SELECT COUNT(DISTINCT p.id) AS count
       FROM places p
       JOIN place_categories pc ON pc.place_id = p.id
       JOIN categories c ON c.id = pc.category_id
       WHERE c.code = ? AND p.deleted_at IS NULL`,
      [input.category],
    ),
    executor.execute<CountRow[]>(
      `SELECT COUNT(DISTINCT p.id) AS count
       FROM places p
       JOIN place_categories pc ON pc.place_id = p.id
       JOIN categories c ON c.id = pc.category_id
       WHERE c.code = ? AND p.place_status = 'ACTIVE'
         AND p.verification_status = 'ADMIN_VERIFIED' AND p.deleted_at IS NULL`,
      [input.category],
    ),
    executor.execute<AmountRow[]>(
      `SELECT MIN(m.price_amount) AS amount
       FROM places p
       JOIN place_categories pc ON pc.place_id = p.id
       JOIN categories c ON c.id = pc.category_id
       JOIN menus m ON m.place_id = p.id
       WHERE c.code = ? AND p.place_status = 'ACTIVE'
         AND p.verification_status = 'ADMIN_VERIFIED' AND p.deleted_at IS NULL
         AND m.is_main_item = true AND m.is_available = true AND m.deleted_at IS NULL
         AND ST_Distance_Sphere(p.location, ST_SRID(POINT(?, ?), 4326)) <= ?`,
      [input.category, input.longitude, input.latitude, input.radiusMeters],
    ),
    searchPublicPlaces(executor, {
      longitude: input.longitude,
      latitude: input.latitude,
      radiusMeters: input.fallbackRadiusMeters,
      category: input.category,
      budgetAmount: input.budgetAmount,
      budgetApplied: false,
      sort: 'NEAREST',
      limit: 1,
      cursor: {
        id: '',
        distanceMeters: input.radiusMeters,
        priceAmount: null,
        dataFreshnessAt: new Date(0).toISOString(),
      },
    }),
  ]);
  return {
    categoryPlaceCount: Number(categoryRows[0][0]?.count ?? 0),
    verifiedPlaceCount: Number(verifiedRows[0][0]?.count ?? 0),
    minimumMainItemAmountWithinRadius:
      amountRows[0][0]?.amount === null || amountRows[0][0]?.amount === undefined
        ? null
        : Number(amountRows[0][0].amount),
    nearestOutsidePlace: outsideResult.places[0] ?? null,
  };
}

function createCursorClause(
  sort: PublicPlaceQuerySort,
  cursor: PublicPlaceCursor | undefined,
): { readonly sql: string; readonly parameters: readonly (number | string)[] } {
  if (!cursor) return { sql: '', parameters: [] };
  if (sort === 'NEAREST') {
    return {
      sql: `AND (
        distance_meters > ?
        OR (distance_meters = ? AND id > ?)
      )`,
      parameters: [cursor.distanceMeters, cursor.distanceMeters, cursor.id],
    };
  }
  if (sort === 'FRESHEST') {
    return {
      sql: `AND (
        data_freshness_at < ?
        OR (
          data_freshness_at = ?
          AND (
            distance_meters > ?
            OR (distance_meters = ? AND id > ?)
          )
        )
      )`,
      parameters: [
        cursor.dataFreshnessAt,
        cursor.dataFreshnessAt,
        cursor.distanceMeters,
        cursor.distanceMeters,
        cursor.id,
      ],
    };
  }
  if (cursor.priceAmount === null) {
    return {
      sql: `AND (
        cheapest_available_main_item_amount IS NULL
        AND (
          distance_meters > ?
          OR (distance_meters = ? AND id > ?)
        )
      )`,
      parameters: [cursor.distanceMeters, cursor.distanceMeters, cursor.id],
    };
  }
  return {
    sql: `AND (
      cheapest_available_main_item_amount IS NULL
      OR cheapest_available_main_item_amount > ?
      OR (
        cheapest_available_main_item_amount = ?
        AND (
          distance_meters > ?
          OR (distance_meters = ? AND id > ?)
        )
      )
    )`,
    parameters: [
      cursor.priceAmount,
      cursor.priceAmount,
      cursor.distanceMeters,
      cursor.distanceMeters,
      cursor.id,
    ],
  };
}

function orderByClause(sort: PublicPlaceQuerySort): string {
  if (sort === 'CHEAPEST') {
    return `cheapest_available_main_item_amount IS NULL ASC,
      cheapest_available_main_item_amount ASC, distance_meters ASC, id ASC`;
  }
  if (sort === 'FRESHEST') {
    return 'data_freshness_at DESC, distance_meters ASC, id ASC';
  }
  return 'distance_meters ASC, id ASC';
}

function mapPlaceRow(row: PlaceRow): DatabasePublicPlace {
  const primaryCategory = parseJsonObject<DatabasePublicPlaceCategory>(
    row.primary_category_json,
    'primary category',
  );
  const categories = parseJsonArray<DatabasePublicPlaceCategory>(row.categories_json).sort(
    (left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary) || left.code.localeCompare(right.code),
  );
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    address: row.address,
    landmark: row.landmark,
    district: row.district,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    distanceMeters: Number(row.distance_meters),
    dataFreshnessAt: toIsoString(row.data_freshness_at),
    primaryCategory: normalizeCategory(primaryCategory),
    categories: categories.map(normalizeCategory),
    facilities: parseJsonArray<DatabasePublicFacility>(row.facilities_json)
      .map((facility) => ({ ...facility }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    cheapestAvailableMainItem: createPriceSummary(
      row.cheapest_available_main_item_name,
      row.cheapest_available_main_item_amount,
    ),
    cheapestQualifyingItem: createPriceSummary(
      row.cheapest_qualifying_item_name,
      row.cheapest_qualifying_item_amount,
    ),
    operatingHours: parseJsonArray<DatabasePublicOperatingHour>(row.operating_hours_json)
      .map(normalizeOperatingHour)
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.sequence - right.sequence),
    operatingHourExceptions: parseJsonArray<DatabasePublicOperatingHourException>(
      row.operating_hour_exceptions_json,
    )
      .map(normalizeOperatingHourException)
      .sort(
        (left, right) =>
          left.exceptionDate.localeCompare(right.exceptionDate) || left.sequence - right.sequence,
      ),
    communityConfirmationCount: Number(row.community_confirmation_count),
  };
}

function mapCategoryRow(row: PlaceCategoryRow): DatabasePublicPlaceCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isPrimary: Boolean(row.is_primary),
  };
}

function mapFacilityRow(row: FacilityRow): DatabasePublicFacility {
  return { code: row.code, name: row.name, status: row.facility_status };
}

function mapOperatingHourRow(row: OperatingHourRow): DatabasePublicOperatingHour {
  return {
    dayOfWeek: Number(row.day_of_week),
    sequence: Number(row.sequence),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    is24Hours: Boolean(row.is_24_hours),
  };
}

function mapOperatingHourExceptionRow(
  row: OperatingHourExceptionRow,
): DatabasePublicOperatingHourException {
  return {
    exceptionDate: row.exception_date,
    sequence: Number(row.sequence),
    isClosed: Boolean(row.is_closed),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    note: row.note,
  };
}

function normalizeCategory(category: DatabasePublicPlaceCategory): DatabasePublicPlaceCategory {
  return { ...category, isPrimary: Boolean(category.isPrimary) };
}

function normalizeOperatingHour(hours: DatabasePublicOperatingHour): DatabasePublicOperatingHour {
  return {
    ...hours,
    dayOfWeek: Number(hours.dayOfWeek),
    sequence: Number(hours.sequence),
    is24Hours: Boolean(hours.is24Hours),
  };
}

function normalizeOperatingHourException(
  exception: DatabasePublicOperatingHourException,
): DatabasePublicOperatingHourException {
  return {
    ...exception,
    sequence: Number(exception.sequence),
    isClosed: Boolean(exception.isClosed),
  };
}

function createPriceSummary(name: string | null, amount: number | null) {
  return name === null || amount === null ? null : { name, priceAmount: Number(amount) };
}

function parseJsonArray<T>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) throw new TypeError('Expected database JSON array');
  return parsed as T[];
}

function parseJsonObject<T>(value: unknown, label: string): T {
  const parsed = parseJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`Expected database JSON object for ${label}`);
  }
  return parsed as T;
}

function parseJson(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8')) as unknown;
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Database timestamp is invalid');
  return date.toISOString();
}

function assertSearchInput(input: SearchPublicPlacesInput): void {
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new RangeError('longitude must be between -180 and 180');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new RangeError('latitude must be between -90 and 90');
  }
  if (
    !Number.isInteger(input.radiusMeters) ||
    input.radiusMeters < 100 ||
    input.radiusMeters > 10_000
  ) {
    throw new RangeError('radiusMeters must be an integer between 100 and 10000');
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new RangeError('limit must be an integer between 1 and 500');
  }
  if (input.budgetApplied && input.budgetAmount === null) {
    throw new RangeError('budgetAmount is required when budgetApplied is true');
  }
}
