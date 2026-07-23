# Cursor Pagination

Place search uses opaque HMAC-SHA256 signed base64url keyset cursors. Offset pagination is not
accepted.

The versioned payload contains a SHA-256 query fingerprint, selected sort, and stable ordering keys:
distance, price, freshness, and ULID. The fingerprint covers normalized latitude, longitude,
radius, category, budget, budget behavior, and sort. The payload is authenticated with
`PUBLIC_CURSOR_SIGNING_SECRET`; a cursor cannot be reused with a different result-set query or
after its payload/signature is changed. Invalid encoding, signature, shape, timestamp, ULID,
fingerprint, or sort produces `INVALID_CURSOR` (400) without exposing cryptographic detail.

Production requires a secret of at least 32 UTF-8 bytes and fails startup if it is absent. Development
may omit it, in which case the API creates a process-local random secret and invalidates cursors on
restart. Tests set a deterministic non-production secret.

`NEAREST` orders distance then ID. `CHEAPEST` orders non-null price, distance, then ID.
`FRESHEST` orders freshness descending, distance, then ID.

Collection metadata:

```json
{
  "pagination": {
    "nextCursor": "eyJ2ZXJzaW9uIjox...",
    "hasMore": true
  }
}
```

The database fetches `limit + 1` rows to derive `hasMore`; payload and query work remain bounded.
Recommendations do not expose a cursor because the product contract is a bounded primary plus
three alternatives.
