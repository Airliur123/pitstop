# Public Places

## Search

`GET /api/v1/public/places`

Required: `latitude`, `longitude`. Optional: `radiusMeters` (100-5000, default 5000), `category`,
`budgetAmount`, `limit` (1-50, default 20), `cursor`, and allowlisted `sort` (`NEAREST`,
`CHEAPEST`, `FRESHEST`).

Coordinates are application `{latitude, longitude}` but MySQL uses `POINT(longitude, latitude)`
with SRID 4326. `ST_Longitude`, `ST_Latitude`, and `ST_Distance_Sphere` produce explicit output
coordinates and integer response distance in metres.

Hard filters are `ACTIVE`, `ADMIN_VERIFIED`, `deleted_at IS NULL`, exact category, and distance.
Budget is applied only when a budget is supplied with `MAKAN_MURAH` or `NGOPI`. A qualifying menu
must be main, available, non-deleted, and priced at or below the integer-rupiah budget. For other
categories `meta.query.budgetApplied=false` and budget does not silently change results.

List responses expose safe category/facility summaries and the cheapest available valid main item.
They never expose verifier IDs, delete/audit fields, storage keys, raw provider responses, or users.

## Detail

`GET /api/v1/public/places/:slug`

Slug is the canonical public identifier. Detail includes address fields, coordinates, verification
timestamps, categories, active/available menus, facilities, hours, future exceptions, and safe photo
availability/count. Asset resolution is deferred; no fake URL or `object_key` is returned.
Ineligible and missing places both return `PLACE_NOT_FOUND` to prevent status enumeration.
