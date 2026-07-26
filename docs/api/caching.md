# Public Read Cache

Redis is accessed through one fail-open abstraction. Cached public reads use these default TTLs:

- categories: 300 seconds;
- place detail: 60 seconds.

Coordinate-derived place search and recommendation lookups always return `cache: BYPASS`. They do
not read or write Redis, even when Redis caching is globally enabled. This prevents precise guest
location input, or a deterministic cache key derived from it, from being retained server-side.
The legacy search/recommendation TTL environment values remain accepted for configuration
compatibility but are not applied to spatial lookups.

Cached keys use namespace version plus SHA-256 of normalized non-coordinate input. Request IDs are
excluded. The opaque pagination cursor contains a signed query hash for request consistency; it is
returned to the caller and is not persisted as a server-side location cache.

Only successful domain payloads are cached. Request metadata is generated after lookup, so hits
receive a fresh request ID and timestamp. Invalid/malformed cached JSON is deleted and treated as a
miss. Redis timeout/outage returns `BYPASS` and continues to MySQL; validation failures and errors
are never cached. Phase 3 has no write endpoints, so complex invalidation is intentionally deferred.
