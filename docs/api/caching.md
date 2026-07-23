# Public Read Cache

Redis is accessed through one fail-open abstraction. Default TTLs:

- categories: 300 seconds;
- place detail: 60 seconds;
- search: 30 seconds;
- recommendations: 30 seconds.

Keys use namespace version plus SHA-256 of normalized input. Request IDs are excluded, and precise
coordinates/category values are not plaintext in the key. Search keys include radius, category,
budget behavior, sort, limit, and cursor.

Only successful domain payloads are cached. Request metadata is generated after lookup, so hits
receive a fresh request ID and timestamp. Invalid/malformed cached JSON is deleted and treated as a
miss. Redis timeout/outage returns `BYPASS` and continues to MySQL; validation failures and errors
are never cached. Phase 3 has no write endpoints, so complex invalidation is intentionally deferred.
