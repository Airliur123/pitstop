# Phase 10 reports, confirmations, history, and audit

Phase 10 adds a private governance workflow around an already published Place. A user report is a
proposal, never a direct edit. Only the administrator who owns the active review lease can apply or
reject it. An apply operation changes the Place, records limited before/after history, writes
append-only governance audit events, and closes the report in one MySQL transaction.

## Report lifecycle and ownership

The lifecycle is deterministic:

```text
PENDING -> IN_REVIEW -> APPLIED
                     \-> REJECTED
```

There are no reverse transitions and clients cannot submit a status. `POST /api/v1/places/:id/reports`
always creates `PENDING`; `GET /api/v1/reports/:id` constrains the query by both report ID and
authenticated reporter ID. A missing report and somebody else's report produce the same safe 404.
The user detail contains the Place summary, proposal, status, safe resolution, timestamps, and an
applied-change summary, but never reviewer notes, risk flags, authentication data, or raw audit
metadata.

Supported report types are temporary closure, permanent closure, incorrect location/address,
category, menu/price, facility, opening hours, duplicate Place, and another factual correction.
Each type maps to a strict, type-specific patch. Unknown keys and patch fields outside that map are
rejected. Text is length-bounded and active HTML is rejected. Evidence is stored as bounded text or
an HTTPS URL with a public host; the server does not fetch the URL.

Every mutation requires the passwordless session, same-origin CSRF proof, an `Idempotency-Key`, and
the expected optimistic version. Replaying the same key and request returns the completed response;
reusing it for different input conflicts. Responses are private and `no-store`. Report creation and
administrative reads/writes use Redis limits scoped to a minimized user key, Place, and operation.

## Community confirmation policy

`POST /api/v1/places/:id/confirmations` records `STILL_VALID`, `PRICE_ACCURATE`, or
`FACILITIES_ACCURATE` for a client-observed date and an optional short note. It never accepts
coordinates and raw GPS is not persisted. There is one row per user and Place. An exact idempotent
retry replays; a different request within the seven-day refresh window conflicts instead of
inflating the count.

Only unexpired `STILL_VALID` rows from distinct users count toward whole-Place
`COMMUNITY_CONFIRMED`. `PRICE_ACCURATE` and `FACILITIES_ACCURATE` remain scoped evidence and never
increase that threshold. A confirmation expires 90 days after `observedAt`; observations older than
the Place's latest factual mutation are also excluded. The contributor whose contribution created
the Place is excluded from the community threshold, so self-confirmation cannot repeatedly promote
the Place. The threshold is three eligible unique users. Confirmation does not override a current
admin verification.

## Verification state

Recalculation uses the following precedence:

1. A pending or in-review location, closure, or duplicate report makes the Place `STALE`.
2. Otherwise, an admin verification within 180 days is `ADMIN_VERIFIED`.
3. Otherwise, at least three eligible, unexpired confirmations with a latest observation within 90
   days produce `COMMUNITY_CONFIRMED`.
4. Expired admin/community evidence produces `STALE`.
5. With no verification evidence the state is `UNVERIFIED`.

Applying a reviewed factual correction establishes a fresh `ADMIN_VERIFIED` state. Any verification
transition is represented in the Place change history and governance audit written with the
mutation. The policy is deterministic; it does not use a score or probabilistic confidence.

## Activity

`GET /api/v1/activity` merges only the current user's contributions, reports, and confirmations.
`type` and `status` filters are validated against the selected activity kind. Ordering is
`updatedAt DESC, id DESC, type DESC`; the opaque HMAC-signed cursor preserves that ordering. The
`/activity` web route has guest sign-in, loading, empty, error/retry, filtering, next/previous
pagination, and links to the owned contribution/report or public Place detail.

A newly created contribution `DRAFT` may not have a Place or a completed name yet, so its activity
item preserves `placeId: null` and `placeName: null`; clients keep the item and use a neutral draft
label until the contribution is completed.

The response is private and `no-store`. TanStack Query keys include the authenticated user ID, and
logout removes the user's private cached queries before clearing the in-memory session.

## Administrative workflow

The admin app exposes `/reports`, `/reports/[id]`, and `/audit`. The queue has status, report type,
category, submitted date, Place search, reviewer state, stable cursor pagination, masked reporter,
Place version, and reviewer lease information. Detail shows the current Place, proposed patch,
old-versus-proposed values, evidence, minimized reporter identity, related pending reports, Place
history, and an audit summary.

Claim is allowed only from `PENDING`. It changes the report to `IN_REVIEW`, assigns a 30-minute
lease, increments its version, and writes audit in the same transaction. A competing administrator
receives a safe conflict. An expired lease can be recovered using current expected version and a new
idempotency key. Apply and reject require the current reviewer and active lease. The admin app sends
mutations through its same-origin proxy, which forwards only the session cookie, CSRF origin, safe
request ID, idempotency key, path, and validated JSON body.

Reject requires a bounded safe resolution, leaves the Place untouched, writes one audit event, and
sets `REJECTED`. The user-visible report returns that resolution.

## Apply transaction and cache boundary

Apply performs these operations in one transaction:

1. lock the idempotency key, report, and Place;
2. verify report/reviewer state, lease, report version, and Place version;
3. validate the approved patch against the report-type allowlist;
4. capture a limited Place snapshot and apply scalar or child-table changes;
5. increment Place version and recalculate verification;
6. insert append-only `place_change_history`;
7. insert append-only report, Place mutation, and verification audit events;
8. set the report to `APPLIED` with a safe resolution and applied summary;
9. store the completed idempotent response and commit.

Any error rolls back all nine steps. Closure uses the official Place status; there is no hard delete
or arbitrary mass assignment. Public Place cache namespaces are invalidated only after commit.
Cache invalidation failure is logged as a safe post-commit operational warning and never rewrites the
committed governance result.

## Place history and governance audit

`place_change_history` stores source, source report/contribution, nullable actor, previous/next
versions, changed-field names, limited before/after snapshots, safe reason, and a database timestamp.
It deliberately excludes cookies, tokens, signatures, raw request payloads, and raw user-location
logs.

`audit_logs` stores actor type/ID, action, resource type/ID, request ID, previous/next status, and
allowlisted safe metadata. It is the generic governance store for report claim/apply/reject, Place
mutation, and verification transition. Phase 8 `moderation_events` remains the contribution
moderation event stream; Phase 10 does not duplicate contribution events into the generic log.

Both tables have MySQL `BEFORE UPDATE` and `BEFORE DELETE` triggers that signal an error. No client
API updates or deletes either table. Audit reads are ADMIN-only, cursor-paginated, rate-limited,
private, and `no-store`.

## Migration 0010

`0010_stale_queen_noir.sql` is additive to the Phase 9 schema. It:

- extends reports with evidence, submitted Place version, review lease, safe resolution/applied
  summary, and queue indexes;
- extends confirmations with observed/expiry/note/Place-version data and recency indexes while
  retaining the unique `(place_id, user_id)` key;
- adds Place community verification timestamps/count metadata;
- completes history/audit version, actor, status, metadata, and query columns;
- backfills new non-null fields from existing Phase 9 data before enforcing constraints;
- adds append-only triggers for history and audit.

Foreign-key deletion behavior is explicit. Reports and Place history use restrictive references
for governance sources; nullable actors use `SET NULL`. There is no cascade that can erase history
or audit. Do not edit migrations `0001` through `0009`; corrections are forward migrations.

MySQL binary logging requires `log_bin_trust_function_creators=1` for a non-`SUPER` migration user
to install the four append-only triggers. Local Compose and all migration-bearing integration
containers set that server option. A managed environment must enable the equivalent database
parameter before applying migration 0010; the application database user still receives no API that
can update or delete either event store.

## Local validation

```bash
pnpm install --frozen-lockfile
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm test
pnpm db:test
pnpm test:api:integration
pnpm test:worker:integration
pnpm test:e2e
```

Unit coverage includes validation, transitions, confirmation timing/thresholds, verification,
patch allowlists, safe audit snapshots, cursor signatures, UI actions, and idempotent inputs. Real
MySQL/Redis integration covers ownership, competing claims, atomic apply/rollback, reject,
confirmation uniqueness, Activity, append-only constraints, CSRF, versions, idempotency, no-store,
Problem Details, and OpenAPI. Playwright covers the user-to-admin apply flow, confirmation,
Activity, authorization, keyboard/dialog behavior, and zero serious/critical Axe findings.

## Phase boundary

Phase 10 does not add notifications, reputation, gamification, public voting/comments, bulk or
automatic processing, automatic deletion, offline/PWA behavior, Phase 11 monitoring, or Phase 12
deployment. Product Specification and Figma remain unchanged.
