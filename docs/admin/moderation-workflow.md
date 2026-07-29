# Moderation Workflow

## State machine

Only these transitions are accepted:

```text
PENDING --claim--> IN_REVIEW
IN_REVIEW --needs revision--> NEEDS_REVISION
IN_REVIEW --reject--> REJECTED
IN_REVIEW --approve--> APPROVED
APPROVED --merge/publish--> MERGED
```

`IN_REVIEW -> IN_REVIEW` is recorded only as `RECLAIM` when the 30-minute reviewer lease has
expired. A live claim belongs exclusively to its administrator. Decision and approval endpoints
reject a different or expired reviewer.

## Mutations

Every mutation requires:

- a valid ADMIN session;
- a trusted admin origin for CSRF protection;
- a syntactically valid `Idempotency-Key`;
- `expectedVersion` for optimistic concurrency;
- a status-valid transition.

Needs-revision and rejection reasons are trimmed, 10–500 characters, and reject active markup.
Approval requires server-validated latitude/longitude and structured district, city, province, and
optional postal code. It also requires either `CREATE_NEW` or a valid active
`MERGE_EXISTING.targetPlaceId`.

## Publication transaction

`MERGE` locks the contribution and optional target Place, then performs all publication writes on
one connection:

1. validate status, reviewer, version, canonical payload, location, and target;
2. create or update an `ACTIVE`/`ADMIN_VERIFIED` Place with SRID 4326 coordinates;
3. map primary category, main menu, facility states, and operating hours;
4. append Place change history and an audit log;
5. transition the contribution to `MERGED` and append a moderation event;
6. persist the idempotent response and commit.

Any error rolls back all writes. Public Place-detail cache invalidation happens only after commit;
a cache outage is logged without reversing a successful database transaction. Replaying the same
request or attempting a second merge returns the already-published Place without duplicating it.

## Audit history

`moderation_events` is an append-only application log containing actor, previous/next status,
action, reason, contribution version, optional merged Place, and server timestamp. The admin UI
masks email addresses and never exposes session tokens, raw location candidates as verified data,
or secret configuration.
