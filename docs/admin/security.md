# Admin Security

- Authentication uses the Phase 6 one-time email token and revocable HttpOnly,
  `SameSite=Lax` session cookie. The token is consumed by the admin server route and removed from
  the browser URL.
- Authorization is database-backed. Browser storage and UI state are never accepted as a role
  source.
- All admin API responses use `Cache-Control: no-store, private`; Next.js server reads also use
  `cache: no-store`.
- Mutations require a trusted `Origin`/`Referer`, including the configured `ADMIN_BASE_URL`.
- Redis rate limiting is keyed by an HMAC of administrator ID, has separate read/mutation budgets,
  and fails closed if Redis cannot enforce a limit.
- Queue filters are strict and bounded. All SQL values are parameters; LIKE wildcard characters
  are escaped before search.
- Queue cursors are opaque HMAC-signed payloads bound to sort order. Tampering or cross-sort reuse
  returns a typed `400`.
- IDs, versions, reasons, coordinates, structured locations, and publication targets are validated
  before repository work. Repository row locks are the final concurrency boundary.
- Logs contain request/contribution/Place identifiers but no token, session value, raw email,
  unverified URL, or precise user-submitted coordinates.

Production configuration rejects localhost API, web, and admin base URLs and requires secure
authentication/cursor secrets.
