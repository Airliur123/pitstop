# Phase 6 passwordless authentication

Phase 6 adds optional authentication without changing PitStop's guest-first behavior. Home, public
search, recommendations, place detail, location, map, and directions remain available without an
account. `/activity` requires a session and remains a next-phase placeholder. `/contribute` uses the
same Phase 6 session boundary for the Phase 7 contribution flow.

## Architecture and lifecycle

1. The web app normalizes an email with NFKC, trim, and lowercase and sends `POST
/api/v1/auth/email/request` with one of the allowlisted `returnTo` routes.
2. The API applies Redis-backed global, IP, and normalized-email limits. Authentication limits fail
   closed if Redis is unavailable.
3. A user is found or provisioned with the `USER` role. A cryptographically random 256-bit token is
   generated, HMAC-SHA256 hashed, and only the hash is stored in `auth_login_tokens`. Any previous
   active link for that user is consumed.
4. SMTP delivers the raw link. The response is always `202 {"accepted":true}` for usable request
   shapes; it does not disclose account existence or status.
5. The Next.js `/auth/verify` route consumes the link server-side through `POST
/api/v1/auth/email/verify`. It forwards the session cookie and redirects to a safe internal
   destination, so the token disappears from the browser URL immediately.
6. Verification locks and conditionally consumes the database row in one transaction. Expired,
   replayed, disabled-user, and unknown tokens cannot create a session.
7. The API stores only an HMAC-SHA256 session-token hash in `auth_sessions`. `GET
/api/v1/auth/session` returns only `id`, masked `email`, and effective `role`.
8. `POST /api/v1/auth/logout` revokes the server-side session and expires the browser cookie.
   Repeating logout is safe.

Magic links default to 15 minutes. Sessions default to 30 days. Both TTLs are configurable within
bounded ranges.

## Cookie and CSRF boundary

`pitstop_session` is `HttpOnly`, `Path=/`, and `SameSite=Lax`. Production configuration is rejected
unless `AUTH_COOKIE_SECURE=true`; local HTTP development leaves `Secure` off. Session-bearing
mutations use an Origin/Referer allowlist guard in addition to SameSite. Logout and Phase 7
contribution writes share this boundary. The reusable `SessionAuthGuard`, `RequireRoles`, and
`RoleGuard` provide authorization foundations for later authenticated endpoints.

`returnTo` accepts `/`, `/activity`, `/contribute`, and exact Phase 7 contribution detail/success
paths with a ULID. Absolute URLs, protocol-relative URLs, encoded external destinations, and
arbitrary internal paths fall back to `/` in the web flow or fail API validation.

## Rate limits

All authentication limits share `AUTH_RATE_LIMIT_WINDOW_SECONDS` (15 minutes by default):

| Flow               | Dimensions                   | Defaults                   |
| ------------------ | ---------------------------- | -------------------------- |
| Request magic link | global, IP, normalized email | 500 global, 10/IP, 3/email |
| Verify magic link  | global, IP                   | 1000 global, 30/IP         |

Redis keys contain keyed hashes rather than raw IP or email values. A Redis failure returns
`AUTH_RATE_LIMIT_UNAVAILABLE` (503). Exceeded limits return `AUTH_RATE_LIMITED` (429).

## Privacy and logging

- Raw login and session tokens are never stored in MySQL.
- Tokens, token hashes, session hashes, email bodies, email fields, cookies, authorization headers,
  and query tokens are declared Pino redaction paths.
- Request serializers remove query strings, preventing a callback token from appearing in access
  logs.
- Auth success and Problem Details responses use `Cache-Control: no-store, private` and
  `Pragma: no-cache`.
- Session responses mask the email and do not expose provider records, password fields, token
  metadata, or database status.
- The browser provider uses only TanStack Query memory. It does not copy auth data to localStorage
  or sessionStorage, and an auth endpoint failure does not block guest content.

## Local Mailpit workflow

Start infrastructure and applications:

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000/login`, request a link, then open Mailpit at
`http://localhost:8025`. SMTP is bound to `127.0.0.1:1025`. Local messages are test data; do not use
production addresses or forward links. The committed environment example uses
`noreply@pitstop.local` and no SMTP credentials.

Production requires explicit high-entropy `AUTH_TOKEN_SECRET` and `AUTH_SESSION_SECRET`, a secure
cookie, a non-local `WEB_BASE_URL`, and a non-local SMTP host. `MAIL_USER` and `MAIL_PASSWORD` must
be supplied together. Provider selection, reputation, bounce handling, and domain authentication
remain deployment decisions.

## Tests

- Validation tests cover email normalization, strict roles, token shape, and return destinations.
- API unit tests cover entropy, HMAC behavior, cookie attributes, redaction, session/role guards,
  and CSRF origin checks.
- MySQL Testcontainers tests cover migration shape, hash uniqueness, indexed lifecycle queries,
  atomic single consumption, expiry, replay resistance, revocation, and expired sessions.
- API integration tests run real MySQL, Redis, and Mailpit containers and cover delivery,
  verification, persistence, replay, expiry, logout, CSRF, rate limiting, no-cache behavior,
  anti-enumeration, and Redis fail-closed behavior.
- Playwright covers protected-route return, Mailpit login, HttpOnly persistence, token removal,
  logout, replay, expiry, external-return rejection, keyboard use, and axe.

## Design and phase decisions

The connected Figma file currently contains Cover and Design System Foundations only and is marked
“Ready for Phase 5”; it has no Guest Login, Email Login, Activity Guest, or Mobile Contribution
Flow frames. Phase 6 therefore uses its semantic tokens, mobile shell, typography, spacing, focus,
and 48px tap-target rules while deriving authentication behavior from the accepted Phase 6 brief.
No Figma file was changed.

The repository contains only the v1.0 product PDF, whose password/Google wording predates the
accepted passwordless Phase 6 definition. The PDF was not edited or silently reinterpreted. The
Phase 6 brief is treated as the explicit authentication decision; this mismatch remains a product
documentation follow-up.

Password reset, OAuth, activity data, profile editing, admin moderation, revision workflows, and
refresh-token rotation are intentionally deferred. Phase 7 contribution behavior is documented in
[docs/contributions](../contributions/README.md).
