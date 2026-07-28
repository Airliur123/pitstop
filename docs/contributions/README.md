# Phase 7 contribution flow

Phase 7 lets an authenticated `USER` create an incomplete server-side draft, resume it, review it,
and submit it exactly once for later moderation. Submission changes `DRAFT` to `PENDING`; it does
not publish a place. Activity feeds, revision requests, moderation actions, and publication remain
deferred.

## Routes and lifecycle

The web routes are:

- `/contribute` creates a draft and replaces the URL with `/contribute?id=<ULID>&step=1`;
- `/contribute?id=<ULID>&step=1|2|3` resumes a server-owned draft;
- `/contributions/<ULID>/success` confirms a server-returned `PENDING` result;
- `/contributions/<ULID>` renders canonical server state and is read-only after submission.

The only contributor transition is `DRAFT -> PENDING`. A `DRAFT` can be updated repeatedly.
`PENDING`, `IN_REVIEW`, `NEEDS_REVISION`, `APPROVED`, `REJECTED`, and `MERGED` are immutable through
the contributor API. `version` starts at 1 and increments on each successful update or submission.
The client sends `expectedVersion`; stale writes receive `CONTRIBUTION_VERSION_CONFLICT` (409).

## Payload

Drafts may be incomplete. Unknown facilities are persisted explicitly as `UNKNOWN`, and omitted
operating days mean that their schedule is not known.

```json
{
  "placeName": "Warung Contoh",
  "category": "MAKAN_MURAH",
  "address": "Jl. Contoh No. 7, Jakarta",
  "landmark": "Samping halte",
  "mapsUrl": "https://www.google.com/maps?q=-6.2,106.8",
  "mainMenu": {
    "name": "Nasi telur",
    "priceAmount": 12000
  },
  "facilities": [
    { "code": "PARKING", "status": "AVAILABLE" },
    { "code": "TOILET", "status": "UNKNOWN" }
  ],
  "operatingHours": [
    {
      "dayOfWeek": 0,
      "isClosed": false,
      "is24Hours": false,
      "opensAt": "18:00",
      "closesAt": "02:00"
    }
  ],
  "notes": "Masuk dari sisi timur."
}
```

Categories are `MAKAN_MURAH`, `NGOPI`, `TOILET`, `MUSALA`, and `ISTIRAHAT`. Makan Murah and Ngopi
require a menu name and a positive integer rupiah price at final submission. Other categories reject
menu data. Facility codes are `PARKING`, `TOILET`, `MUSALA`, `POWER_OUTLET`, `SEATING`, `SHADE`, and
`WIFI`; each status is `AVAILABLE`, `NOT_AVAILABLE`, or `UNKNOWN`.

Opening hours use Monday `0` through Sunday `6`. Closed and 24-hour days have null open/close times.
A normal interval needs both `HH:mm` values; a closing time earlier than the opening time represents
an overnight interval. Duplicate days or facilities, control characters, unknown object keys,
non-integer/invalid prices, and unsupported URLs are rejected. Maps links are limited to safe
HTTP(S) Google Maps hosts without embedded credentials.

Changing category clears menu or non-applicable facility answers only after confirmation in the web
UI. The server canonicalizes every draft and fills unanswered official facilities with `UNKNOWN`.

## Ownership, CSRF, privacy, and rate limiting

Every endpoint requires the HttpOnly session established in Phase 6. Queries always constrain both
contribution ID and `submitted_by`; a missing contribution and another user's contribution both
return the same `CONTRIBUTION_NOT_FOUND` (404). Mutation requests additionally require an allowed
Origin or Referer. Private successes and errors use `Cache-Control: no-store`.

Redis rate limits create, update, and submit separately by an HMAC-derived user key. Contribution
mutation limits fail closed with `CONTRIBUTION_RATE_LIMIT_UNAVAILABLE` (503) if Redis cannot enforce
them. Defaults are 30 requests per operation per 60 seconds and can be changed with
`CONTRIBUTION_RATE_LIMIT_MAX` and `CONTRIBUTION_RATE_LIMIT_WINDOW_SECONDS`.

Contributor-authored address, landmark, maps link, notes, place name, and menu text are declared log
redaction surfaces. The API does not log the request payload. The UI never collects the driver's
current coordinates for a contribution.

## Idempotency

Creating a draft and submitting it require an `Idempotency-Key` containing 8-128 safe characters.
The database stores a 24-hour `(scope, key)` record with a SHA-256 request hash and completed
response. Replaying the same operation returns the same contribution. Reusing a key for a different
request returns `IDEMPOTENCY_KEY_REUSED` (409).

Submission locks the idempotency row and owned contribution in one MySQL transaction. Concurrent
submit requests converge on one `PENDING` row, one server `submitted_at`, and one version increment,
even if the concurrent requests use different keys.

## Persistence and migration

The canonical proposal remains JSON in `contribution_payloads`; lifecycle, ownership, timestamps,
and optimistic version remain in `contributions`. This preserves the Phase 1 modular schema and
avoids duplicate proposal tables. Migration `0006_perpetual_lorna_dane.sql` adds:

- `idx_contributions_submitter_id (submitted_by, id)` for owned detail/update locks;
- `idx_contributions_submitted_at (submitted_at)` for later activity ordering.

Apply it with `pnpm db:migrate`, then run `pnpm db:check` and `pnpm db:test`. MySQL DDL auto-commits,
and shared migrations are forward-only. If an unreleased local migration must be reversed, the SQL
equivalent is:

```sql
DROP INDEX idx_contributions_submitter_id ON contributions;
DROP INDEX idx_contributions_submitted_at ON contributions;
```

Do not run that manually in a shared environment; create a reviewed forward Drizzle migration.

## Local run and tests

```bash
pnpm install --frozen-lockfile
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev

pnpm test
pnpm db:test
pnpm test:api:integration
pnpm test:e2e
```

Mailpit at `http://localhost:8025` provides local sign-in links. Open `/contribute`, sign in, and
complete the three-step flow. API integration uses real MySQL and Redis containers; Playwright uses
the local Compose MySQL, Redis, and Mailpit services.

## Deliberate Phase 7 boundaries

- Photos remain optional in the product specification and are not collected because the connected
  Figma file has no contribution flow or upload interaction to implement.
- Coordinates are not inferred or collected from the contributor.
- Submitted records do not become public places.
- Activity UI, revision workflows, moderation, notifications, profile changes, and admin actions
  remain later-phase work.
- The connected Figma file contains only Cover and Design System Foundations. The flow therefore
  uses the established mobile shell, semantic tokens, accessible controls, and 48px targets while
  treating the missing contribution frames as an explicit design follow-up. No Figma file was
  changed.
