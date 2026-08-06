# Phase 11: PWA, security hardening, reliability, and observability

This document describes the Phase 11 implementation as of 2026-07-31. It supplements, but does not
change, the product specification or accepted ADRs. In particular, it follows
[ADR 0011](../adr/0011-progressive-web-app.md) for Serwist and
[ADR 0012](../adr/0012-separate-web-admin-apps.md) for the separate public and administrator trust
boundaries.

Phase 11 hardens the existing Phase 0-10 modular monolith. It does not provision or deploy
production infrastructure.

## Trust boundaries

| Boundary             | Entrypoint and identity                                                                     | Permitted behavior                                                                              | Cache and logging rule                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Public               | `apps/web` and guest `GET /api/v1/public/*`                                                 | Search, categories, Place detail, and recommendations                                           | Only explicitly allowlisted public PWA data may enter Cache Storage. Precise query coordinates are excluded from access-log URLs.    |
| Authenticated        | Web routes plus the revocable `pitstop_session` cookie                                      | Activity, contributions, reports, and confirmations, always constrained by session ownership    | Responses are `private, no-store`; the service worker never handles them with a cache strategy.                                      |
| Administrator        | Separate `apps/admin` hostname, server reads, and fixed same-origin mutation Route Handlers | Moderation, governance, integration replay, diagnostics, and optional metrics                   | ADMIN role is checked again by the API. Admin pages and API responses are `private, no-store`.                                       |
| Integration          | Signed Google Form endpoint                                                                 | Commit an authenticated submission into the durable inbox                                       | No browser session or browser CSRF assumption. Raw body, signature, optional email, and payload are never logged or cached.          |
| Worker               | Nest application context connected to MySQL, Redis, BullMQ, and the configured geocoder     | Reconcile the durable inbox, process bounded jobs, publish ephemeral heartbeat/metric snapshots | It has no public HTTP listener. Sensitive source payloads remain in MySQL; BullMQ messages contain bounded IDs/correlation metadata. |
| Internal operational | Publicly minimal health routes and ADMIN-only diagnostics/metrics                           | Process health, dependency readiness, aggregate queue/backlog state                             | Health and operational responses are `no-store`; metrics contain bounded labels and no user/resource/request identifiers.            |

An `Origin` header is not an identity. CORS controls browser access, CSRF guards protect
session-bearing mutations, session/role guards establish identity and authorization, and the Google
Form HMAC establishes the integration identity. These controls are deliberately separate.

## Sensitive-data and no-cache map

| Data class                                           | Storage/transport boundary                                                    | Browser cache                                                                       | Structured logs and metrics                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Magic-link and session tokens                        | Raw values exist only in the email/browser exchange; MySQL stores HMAC hashes | Never                                                                               | Token, hash, query token, Authorization, Cookie, and Set-Cookie paths are redacted                          |
| Session state and masked identity                    | Server-side session plus in-memory TanStack Query state                       | Never in Cache Storage, localStorage, or sessionStorage                             | Raw email is redacted; metrics never use user ID or email                                                   |
| Activity, contribution, report, moderation, evidence | Authenticated API and existing MySQL domain tables                            | `private, no-store`; never matched by the worker cache                              | Raw body, authored content, evidence, precise coordinates, and email are redacted                           |
| Google Form submission                               | Signed request, durable inbox, and bounded worker job identifiers             | Never                                                                               | Signature/key headers, canonical/raw payload, optional email, geocoder detail, and coordinates are redacted |
| Current user location                                | Request query and normalized server-side computation                          | Search/recommendation responses are not cached by the service worker                | Access logs use route paths without query strings; metric labels use route templates                        |
| Public categories                                    | Credential-free exact public endpoint                                         | Network-first, five-minute maximum runtime retention                                | Safe aggregate/request metadata only                                                                        |
| Public Place/search/recommendation data              | Public API                                                                    | Deliberately not cached by the service worker, avoiding presentation of stale facts | Existing safe public projection and bounded route metrics                                                   |
| Operational state                                    | In-memory metrics and expiring Redis worker snapshots                         | Never                                                                               | Aggregate counts, availability, fixed error classes, queue states, release, and safe timestamps only        |

Pino redaction covers case-normalized nested values and explicit paths for Authorization,
Cookie/Set-Cookie, CSRF/XSRF, PitStop/integration signatures, tokens, passwords, raw email, payload,
evidence, URLs that may carry secrets, and precise latitude/longitude. A redaction helper also
bounds recursion and handles circular values. Do not bypass these serializers by logging an
unreviewed request, response, job, or domain object.

## PWA installability

The public web app owns the PWA. The administrator app is intentionally not installable.

`/manifest.webmanifest` is generated by Next.js with:

- name `PitStop - Cari Tempat Singgah`, short name `PitStop`, and an Indonesian description;
- `start_url`, `scope`, and manifest ID `/`;
- standalone display without an orientation lock;
- design-system background `#f8fafc` and theme `#166534`;
- 192x192 and 512x512 PNG icons plus a 512x512 maskable PNG icon; and
- Indonesian language metadata.

Root metadata links the manifest, declares Apple web-app capability, provides an Apple touch icon,
and repeats the theme color. Next.js serves the manifest route with its manifest content type.

Serwist compiles `apps/web/app/sw.ts` to `/sw.js`. It is included only when
`NEXT_PUBLIC_PWA_ENABLED=true` and either:

- `NODE_ENV=production`; or
- the explicit controlled PWA test mode is enabled with
  `NEXT_PUBLIC_PWA_TEST_MODE=true` or the server-only `PWA_TEST_MODE=true`.

Normal development does not register a worker. When PWA mode is disabled, the lifecycle component
unregisters the PitStop worker and removes `pitstop-web-*` caches so a stale development worker
cannot continue intercepting requests.

## Cache policy

The current cache family is `pitstop-web`, policy version `v1`, and namespace
`pitstop-web-v1`. Every runtime cache is bounded.

| Request class                             | Strategy                                       | Limits and eligibility                                                                                                                    | Offline result                                                                        |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Serwist precache                          | Build revisioned                               | Generated build entries, explicit `/offline`, and public icons                                                                            | Supplies the offline page and revisioned shell assets after a successful online visit |
| Hashed Next JS/CSS/font assets            | Cache-first                                    | Same-origin `GET`, under `/_next/static/`, hashed filename, no sensitive headers; 96 entries, 30 days from last use                       | Cached revisioned asset                                                               |
| Public categories API                     | Network-first with four-second network timeout | Exact configured API origin and `/public/categories` path, no query, `credentials: omit`, no sensitive headers; two entries, five minutes | Last safe category response, if present                                               |
| Public navigation                         | Network-only with explicit fallback            | Same-origin navigation; HTML is not written to a runtime cache                                                                            | `/offline`, never authenticated or stale Place HTML                                   |
| Other public APIs                         | No service-worker route                        | Search, Place detail, and recommendations are intentionally excluded                                                                      | The normal application error state, or offline fallback for navigation                |
| Auth/session/Activity/contribution/report | Bypass                                         | Cookie, Authorization, CSRF, private/no-store, Set-Cookie, or non-allowlisted path cannot match a data cache                              | Connection-required UI; no private cached response                                    |
| Admin and magic links                     | Bypass                                         | Different origin/app and no admin PWA; token-bearing navigation is not runtime cached                                                     | No cached admin or magic-link response                                                |
| Mutations                                 | Network only                                   | No mutation matcher, Background Sync plugin, queue, or replay code                                                                        | Fails safely through the existing online-required error path                          |
| Map tiles                                 | No service-worker route                        | Tile-provider responses are never stored by PitStop                                                                                       | Neutral/list experience; no offline tile claim                                        |

A response is cacheable only when it is a non-opaque `200`, has no `Set-Cookie`, does not declare
`private`, `no-store`, `no-cache`, or `must-revalidate`, does not use `Vary: *`, and has the expected
content type when one is required. Error responses are never cached. The public API matcher
includes the complete URL conditions and currently permits no query at all.

OpenStreetMap tiles are requested directly from the exact configured HTTPS origins. PitStop does not
cache or redistribute them and therefore makes no offline-map claim. Set
`NEXT_PUBLIC_MAP_TILES_DISABLED=true` for deterministic tests or privacy-sensitive environments.
The accessible list remains primary.

There is no background sync for reports, contributions, confirmation, moderation, Google Form
replay, or any other mutation. Adding one would require a separate idempotency, consent, expiry, and
conflict design.

## Private-cache guarantees and logout

The service worker has no generic API or HTML cache. Its only API matcher requires a credential-free
exact categories request. Sensitive request headers include Authorization, Cookie, CSRF, and
integration signature material. Private/no-store responses, errors, opaque responses, and
Set-Cookie responses are rejected again at the response boundary.

Logout revokes the server-side session, expires the host-only cookie, clears authenticated query
state, posts `PURGE_PRIVATE_CACHES` to the active worker, and independently removes all non-precache,
non-static PitStop caches from the page. This second deletion path remains best-effort so unavailable
Cache Storage cannot make logout fail.

These rules mean:

- authenticated HTML is never available from the worker offline;
- Activity, contribution/report detail, admin, session, CSRF, and magic-link responses cannot enter
  the public data cache;
- the public cache has no user/session dimension because its sole request requires
  `credentials: omit`;
- logout removes the public runtime API cache and any unexpected PitStop cache while retaining only
  the current revisioned shell/static caches; and
- no failed mutation is retained for automatic replay.

## Offline experience

The mobile-first `/offline` page states that the connection is unavailable and explicitly refuses
to present stored data as current. It identifies login, Activity, contributions, reports, and form
submission as online-only. Deep navigation uses the same safe fallback instead of a browser-generic
error. If the precached page is unavailable, the worker returns a minimal Indonesian `503` HTML
response with `Cache-Control: no-store`.

The page listens for online/offline changes, announces status through a polite live region, exposes
a real button for retry, and links to the safe home route. Reconnection updates the message without
a forced reload; navigation occurs only after the user chooses retry.

## Service-worker updates and rollback

Serwist uses `skipWaiting: false`. A newly installed worker waits while the existing controller
continues serving the open application. The client:

1. detects `updatefound` or an already waiting worker;
2. announces the update through an accessible live notice;
3. tells the user to finish form input first;
4. sends `SKIP_WAITING` only after the user chooses **Muat versi baru**; and
5. reloads once on `controllerchange`, guarded by both "activation requested" and "reload started"
   state.

Registration, update, redundant-worker, and activation failures become bounded client operational
events. Reduced-motion users do not receive the applying spinner animation.

Activation deletes only old caches in the `pitstop-web` family whose namespace is not the current
version. A cache-policy change must increment `PWA_CACHE_VERSION` and the explicit offline precache
revision. Do not reuse a cache version for different semantics.

A rollback is a new forward deployment of the previous application source with a new cache-policy
version/revision. This allows activation to remove the faulty cache deterministically. Merely
repointing server files while reusing `v1` can leave already installed clients on ambiguous cache
contents and is not the rollback procedure.

## Security headers and CSP

Shared pure builders define web, admin, and API policies. Next attaches browser headers to web/admin
routes, while the API adds them in Fastify's request hook. Helmet's CSP and HSTS emitters are disabled
on the API to avoid conflicting duplicate values; route-specific Cache-Control remains owned by
controllers/Next routes.

Common headers are:

- `Content-Security-Policy`, including `frame-ancestors 'none'`;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- a restricted `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`; and
- `Strict-Transport-Security: max-age=31536000` only for an HTTPS production base URL.

The browser CSP defaults to self, denies objects and frames, restricts forms and workers to self,
and permits images only from self, `data:`, `blob:`, and exact configured map-tile origins. Connect
sources are self plus the exact API origin and an optional same-origin client-observability adapter.
Free wildcards and directive/header injection are rejected.

Production never enables `unsafe-eval`. Static Next.js headers cannot attach a per-request nonce to
the framework's inline bootstrap, so the static mode retains `script-src 'unsafe-inline'` as a
documented compatibility exception. If a request nonce is supplied, the builder replaces that
script exception with the nonce and `strict-dynamic`. `style-src 'unsafe-inline'` remains necessary
for current Next/Leaflet inline styles. The API's normal JSON CSP is `default-src 'none'`; the
development/test Swagger UI has a separate self-only compatibility policy. Production
configuration rejects `API_SWAGGER_ENABLED=true`.

No CSP report collector or third-party reporting endpoint is shipped. Treat a violation as a
release regression: reproduce against the same `RELEASE_VERSION`, inspect the browser console and
blocked origin, verify that it is an intended dependency, and update the smallest exact directive
allowlist. Never resolve a violation with `*`, production `unsafe-eval`, or by silently disabling
CSP. A future internal report-only collector belongs to deployment/operations work.

## Cookie and session policy

`pitstop_session` is:

- HttpOnly;
- host-only, with no `Domain` attribute;
- `Path=/`;
- `SameSite=Lax`;
- bounded by matching `Max-Age` and `Expires`; and
- `Secure` when `AUTH_COOKIE_SECURE=true`, which production configuration requires.

Local HTTP remains compatible with Secure disabled. The clear cookie uses the same host/path,
HttpOnly, SameSite, and Secure policy, with `Max-Age=0` and an epoch expiry.

Magic-link verification atomically consumes the one-time login token and creates a fresh random
256-bit session token, preventing fixation on a caller-supplied value. Only its HMAC hash is stored.
Every lookup rejects expired, revoked, deleted-user, disabled-user, and unknown sessions. An invalid
cookie is cleared on the session response; logout revokes the hash before clearing the cookie.

There is no long-lived browser refresh credential or silent cookie-domain expansion. A later login
creates a new independent session. On the separate admin hostname, the admin callback/proxy returns
Set-Cookie to that hostname, preserving the host-only boundary.

SameSite is defense in depth, not the mutation CSRF control. Session-bearing mutations require an
exact configured Origin/Referer; every administrator resource also requires a database-backed ADMIN
role.

## CORS, canonical URLs, proxy trust, and host safety

Production configuration fails before startup unless public base URLs are HTTPS, non-local, and
free of credentials, wildcard hosts, queries, and fragments. Web/admin base URLs and CORS entries
must be exact origins. `CORS_ALLOWED_ORIGINS` must include the configured web and admin origins.
Absolute redirects, magic-link targets, and admin upstream URLs use these configured bases rather
than `Host`, `X-Forwarded-Host`, or another user header.

An explicit Origin is accepted only when its serialized value is already an exact allowlisted
origin. Missing Origin remains valid for non-browser/server clients; browser mutations still pass
their separate CSRF guard. Credentialed CORS never reflects an arbitrary origin.

`TRUST_PROXY=false` is the default. Enabling it without `TRUST_PROXY_CIDRS` fails configuration.
CIDR/IP entries are validated as IPv4 or IPv6 and passed to Fastify as the trust-proxy allowlist.
Fastify, not application code, evaluates the forwarded chain from the directly connected peer
toward the client and stops at the first untrusted address. Consequently, an Internet client cannot
choose its rate-limit IP by sending `X-Forwarded-For` when the peer is not trusted.

The administrator mutation proxy is not an open proxy. A typed action plus validated ULID selects a
fixed route; server configuration selects the API origin. It accepts JSON only, enforces a 256 KiB
declared and measured body limit, validates admin Origin/Referer, replaces upstream Origin/Referer,
forwards only allowlisted request/response headers, and refuses automatic redirects.

The API currently binds to `127.0.0.1`. Production TLS termination, network ACLs, and the exact
reverse-proxy CIDRs are Phase 12 deployment inputs.

## Request safety and operational errors

The API applies a global body limit of 1 MiB, a default 2,048-character request-URL limit, strict
validation with unknown fields forbidden, and bounded query/page/limit/cursor schemas. The signed
Google Form route applies its tighter default 128 KiB limit to both Content-Length and the raw
chunked stream before JSON parsing or HMAC work.

Request-specific defenses retained from earlier phases include:

- exact content types and strict object allowlists, preventing mass assignment;
- HMAC-signed, query-bound cursor contents that never become SQL;
- parameterized mysql2 values and server-allowlisted dynamic ordering;
- idempotency keys bound to canonical request hashes, with conflict on changed reuse;
- Google Form timestamp replay windows, source IDs, current/previous keys, and constant-time HMAC
  comparison;
- allowlisted full Google Maps URLs that are parsed locally, never fetched;
- a configured HTTPS production geocoder base URL and bounded outbound timeout;
- text/HTML validation and React escaping for user-authored content; and
- safe Problem Details that remove query strings, stack traces, SQL, parameters, credentials, and
  internal dependency messages.

No multipart upload endpoint is introduced in Phase 11. There is also no generic URL fetcher or
proxy route.

Operational error classes are stable and bounded: validation, authentication, authorization,
conflict, rate limit, dependency timeout/unavailable, and unexpected internal error. Expected 4xx
responses contribute metrics but are not logged as application panics. Unexpected errors include
internal class/code/stack plus request and correlation IDs; clients receive only safe Problem
Details and the identifiers needed for support. Worker policy separately distinguishes retryable
dependency failures, permanent validation failures, exhausted/DLQ work, and unexpected failures.

## Health, startup, and shutdown

`GET /health/live` returns only `{status, service}`. It proves that the HTTP process/event loop can
answer and deliberately does not contact dependencies.

`GET /health/ready` checks, concurrently and with the bounded
`HEALTH_DEPENDENCY_TIMEOUT_MS`:

- MySQL with `SELECT 1`;
- Redis with `PING`;
- the queue foundation, which currently shares Redis availability;
- mandatory configuration, already fail-fast parsed at startup; and
- migration compatibility by requiring the eleven existing migration records `0000` through
  `0010`.

It returns 200 `ready` or 503 `not_ready`, exposes only named `up/down` checks, and includes no
credentials, hostnames, queries, or exception text. Both health routes are `no-store`, return
request/correlation headers, and are excluded from routine HTTP access logging to avoid probe noise.

API startup parses mandatory production configuration before listening. Startup failure emits one
small JSON fatal event without serializing the configuration or exception. SIGINT/SIGTERM is
idempotent, logs normal start/completion at info, calls Nest/Fastify close, and uses the bounded
graceful-shutdown timeout. A timeout is an error and sets exit code 1; normal shutdown sets exit code 0.

Worker startup validates configuration, opens MySQL through Nest lifecycle, requires Redis startup
PING within a bounded timeout, creates BullMQ queues/connections, starts the worker with
`autorun: false`, reconciles durable work, then announces READY. SIGINT/SIGTERM uses Nest shutdown
hooks and:

1. stops accepting/reconciling new work and stops timers;
2. pauses the worker;
3. publishes a `stopping` heartbeat;
4. awaits reconciliation, active jobs, and failure handlers within the configured deadline;
5. closes worker/queues, BullMQ Redis connections, and MySQL; and
6. force-closes resources and sets exit code 1 only on timeout/failure.

Normal SIGTERM is logged as STOPPING/STOPPED, not as a worker application error.

## Structured logging and correlation

Pino supplies timestamps and levels. API base fields are `service`, `environment`, and `release`;
request logs add bounded request/correlation IDs, method, route template, status code, and response
duration. Domain/worker events add safe job name, attempt/status, queue, resource identifiers where
operationally necessary, duration, and bounded error class/code. Request serializers never emit a
token-bearing query URL.

Incoming request IDs use a safe 128-character alphabet. Correlation IDs use a stricter 64-character
alphabet; invalid or oversized input is replaced with a UUID, and the response returns both IDs.
The admin server reader and mutation proxy validate or create the identifiers and preserve them to
the API. Signed Google Form ingestion stores the sanitized correlation ID with the inbox, derived
jobs retain it, worker job identifiers are sanitized again, and relevant audit mutations receive
the same correlation context.

User ID, email, Place ID, job ID, request ID, and correlation ID are not metric labels. Metrics use
fixed definitions and exact label sets such as method, route template, status class, dependency,
operation, outcome, queue state, or backlog kind.

## Metrics, worker heartbeat, and admin diagnostics

Metrics are vendor-neutral Prometheus text generated by an in-memory registry. The
`GET /api/v1/admin/metrics` route is protected by session plus ADMIN role, is `private, no-store`,
and appears as 404 while `METRICS_ENABLED=false` (the default).

The current API series cover:

- request count, active requests, error count/class, and duration histogram;
- rate-limit rejection count;
- dependency availability and operation-failure count;
- worker up/freshness, processed/succeeded/failed/retried/DLQ counts, queue
  waiting/active/delayed/failed/DLQ counts, and stale-lease recoveries; and
- contribution, report, Google Form inbox, and Google Form DLQ backlog.

The worker maintains bounded counters for job outcomes, retry/DLQ, Redis loss/recovery, queue
failures, database failures, stalls, stale-lease recovery, and processing duration. It writes a
schema-versioned heartbeat to `pitstop:worker:v1:integration:heartbeat` in Redis, every 10 seconds by
default, with a default 30-second TTL. The optional fuller metric snapshot uses
`pitstop:worker:v1:integration:metrics` and the same TTL. No raw job data is stored in either key.

`GET /api/v1/admin/diagnostics` and the admin `/system` page are always ADMIN-only and
`private, no-store`. They show MySQL/Redis/queue state, fresh/stale/stopping/unavailable worker
state, safe queue counts, domain/integration backlog, release/environment/service, last heartbeat,
last successful worker activity, and snapshot time. They do not show connection strings, secrets,
raw logs, emails, user payloads, tokens, IDs, or precise coordinates.

## Client observability

Client collection is disabled by default and is a no-op unless
`NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED=true`. The adapter accepts only LCP, CLS, INP, a bounded
navigation-failure code, and bounded service-worker registration/update/activation codes. It sends
only metric name/value/rating/code plus a route template, uses `credentials: omit`, and rejects
cross-origin, credential-bearing, query-bearing, or fragment-bearing endpoints.

No receiver, persistence, vendor SDK, SaaS account, API key, form content, raw URL, magic token,
email, precise location, or administrator data is shipped in Phase 11. Supplying an internal
same-origin receiver and retention/aggregation policy is deferred; leaving the flag disabled is the
supported default.

## Accessibility

The offline state uses a semantic main region, focusable skip target, real buttons/links, and a
polite status announcement. The update notice uses an atomic live region, remains keyboard
operable, exposes applying/failure labels, and honors reduced motion. Diagnostics use headings,
status text, semantic description lists, and do not encode state by color alone. Component tests
cover reconnect/update states, and the workspace Playwright axe policy remains zero serious or
critical violations.

## Incident debugging

1. Record the response `x-correlation-id`, `x-request-id`, route template, time, and
   `RELEASE_VERSION`. Do not request a cookie, token, raw body, email, or coordinates.
2. Check `/health/live`. If it fails, investigate process/listener startup. If it succeeds, check
   `/health/ready` to separate MySQL, Redis/queue, configuration, and migration compatibility.
3. As ADMIN, open `/system`. Compare dependency state, heartbeat freshness, queue counts, DLQ, and
   domain backlogs. Enable the ADMIN metrics endpoint only for a bounded diagnostic window if
   aggregate series are needed.
4. Search structured logs by correlation ID and release. Expected 4xx should be handled as request
   outcomes; investigate unexpected 5xx, dependency timeouts, Redis transitions, worker retry/DLQ,
   or forced shutdown events.
5. For a stale worker, compare heartbeat TTL to the last heartbeat, then check Redis recovery,
   BullMQ queue state, reconcile activity, and normal STOPPING/STOPPED lifecycle events.
6. For PWA issues, inspect `/manifest.webmanifest`, `/sw.js`, the active/waiting worker, and only
   `pitstop-web-*` Cache Storage entries. Verify the request against the cache matrix before deleting
   anything.
7. For CSP issues, capture the blocked directive/origin locally, confirm the resource is required,
   and change only the exact allowlist. Do not paste tokens or full sensitive URLs into an issue.
8. Roll back a service-worker regression as a new versioned deployment, following the cache
   versioning procedure above.

## Local testing

Use the locked runtime and local services:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
pnpm install --frozen-lockfile
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

Normal development leaves PWA disabled. For an isolated PWA test profile, set
`NEXT_PUBLIC_PWA_ENABLED=true` and `PWA_TEST_MODE=true` (or
`NEXT_PUBLIC_PWA_TEST_MODE=true`), then verify manifest content type, worker registration/update,
offline deep navigation, logout purge, and that private/admin requests are absent from Cache
Storage. A service worker requires localhost or an HTTPS secure context.

Run the Phase 0-11 regression gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:test
pnpm test:api:integration
pnpm test:worker:integration
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm build
pnpm test:e2e
pnpm audit --audit-level critical
git diff --check
git status --short
```

Production-like builds must use explicit non-local HTTPS web/admin/API base URLs, exact CORS and map
origins, secure cookies, required secrets, a non-silent log level, and a real release identifier.
TLS certificates and the reverse proxy are not created by this phase.

## Persistence and phase boundaries

Phase 11 adds no database migration. Migration `0010` remains the latest file; the readiness count
of eleven means migrations `0000` through `0010`. Metrics remain in process memory, and worker
heartbeat/snapshots are bounded by Redis TTL. MySQL is queried only through existing domain tables;
it is not used as a raw metric or log store.

The following remain Phase 12/deployment work:

- VPS, domain/DNS, Cloudflare, TLS termination, production reverse-proxy CIDRs, firewall, and
  production URL routing;
- GitHub Container Registry, production containers, backup/restore, blue-green rollout, Kubernetes,
  or a managed database;
- production secrets, SMTP/geocoder credentials, monitoring SaaS, alert routing, and on-call
  ownership;
- an internal client-observability or CSP-report receiver and its retention policy;
- dependency parent-package upgrades listed in
  [dependency-audit.md](./dependency-audit.md), followed by full regression;
- production data-retention jobs and external backup verification; and
- any offline map license, mutation Background Sync, or broad private-data cache design.

No Phase 12 provisioning, deployment, secret, commit, release, or infrastructure operation is
performed by Phase 11.
