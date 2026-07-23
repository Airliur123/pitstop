# Spatial Data and Queries

`places.location` is `POINT NOT NULL SRID 4326` with the InnoDB spatial index
`idx_places_location`. `geocoding_results.result_location` is nullable but has the same SRID.

Application input order is always:

```text
POINT(longitude, latitude)
longitude = 106.8061
latitude  = -6.1468
```

All coordinate and radius values are bound parameters. `findPlacesWithinRadius`:

- calculates distance with `ST_Distance_Sphere`;
- defaults to 5,000 metres;
- filters `ACTIVE`, `ADMIN_VERIFIED`, and `deleted_at IS NULL`;
- orders nearest first;
- enforces a validated maximum result cap of 100.

The Drizzle `point` custom type maps mysql2's `{ x, y }` driver object and its binary parameter
format to the public `{ longitude, latitude }` representation. Business code must use that typed
representation or the spatial helper, never mysql2's raw POINT value.

## MySQL 8.4 EPSG axis semantics

EPSG:4326 defines latitude as its first SRS axis in MySQL. Consequently, direct `ST_X(location)` is
latitude and `ST_Y(location)` is longitude even when application input and WKT are explicitly
longitude/latitude. For geographic output the implementation therefore uses:

```sql
ST_Longitude(location) AS longitude,
ST_Latitude(location) AS latitude,
ST_AsText(location, 'axis-order=long-lat')
```

This is not a coordinate swap in storage. The long/lat WKT for Warung Bu Ani is
`POINT(106.8061 -6.1468)`. Integration tests verify the WKT, geographic accessors, SRID, spatial
index, distance, radius membership, and state filters on MySQL 8.4.

Do not replace the point with independent doubles and do not use SRID 0 to emulate Cartesian axis
semantics.
