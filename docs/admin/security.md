# Admin Security

- Authentication uses the Phase 6 one-time email token and revocable HttpOnly,
  `SameSite=Lax` session cookie. The token is consumed by the admin server route and removed from
  the browser URL.
- Browser mutations use same-origin admin Route Handlers. The handlers forward the admin host's
  session cookie to a fixed API route selected from server configuration; the browser never sends a
  session-bound admin mutation directly to the API hostname.
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

## Separate-host deployment

A supported production topology can use:

```dotenv
ADMIN_BASE_URL=https://admin.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

The host-only session cookie remains scoped to `admin.example.com`. Browser POSTs for magic-link
requests, moderation decisions/publication, and logout target relative `/api/*` handlers on that
origin. Those handlers:

- derive the upstream API URL only from validated server environment configuration and fixed route
  mappings;
- reject missing or non-matching `Origin`/`Referer` values before contacting the API;
- forward only allowlisted cookie, JSON, CSRF, idempotency, and request-correlation headers;
- replace upstream `Origin` and `Referer` with the validated `ADMIN_BASE_URL` origin;
- preserve the API status, Problem Details body, request ID, retry metadata, and private/no-store
  policy; and
- forward logout's `Set-Cookie` on the admin response so the browser deletes the cookie on the
  correct hostname.

No query parameter, body field, request header, or free-form path can select an upstream host.
Server-rendered dashboard, queue, and detail reads continue to call the API server-side and forward
the cookie explicitly.
