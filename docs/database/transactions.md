# Transaction Boundaries

Transaction helpers use a dedicated `mysql2` pool connection, `BEGIN`, row locks, explicit commit,
and rollback on every thrown error.

## Phase 1 approval foundation

`approveContributionTransaction` is the original Phase 1 data-layer foundation. It performs:

1. `SELECT ... FOR UPDATE` on the contribution.
2. Status validation (`PENDING` or `IN_REVIEW`).
3. Place create/update with SRID 4326 coordinates and version increment.
4. Primary category update.
5. Menu, facility and operating-hours upserts.
6. Makan Murah main-item invariant validation.
7. Place history and audit insertion.
8. Contribution status/version update to `APPROVED`.
9. Commit.

An invalid related FK integration test fails after earlier writes and proves that the place, related
rows, history, audit and status transition all roll back.

## Apply report

`applyReportTransaction` locks report and place, validates report status, checks the expected place
version, updates the place, appends history/audit, changes the report to `APPLIED`, and commits. A
failed audit/history FK proves the preceding place update rolls back. A separate test proves stale
versions are rejected before mutation.

## Revoke refresh-token family

`revokeRefreshTokenFamilyTransaction` locks all tokens for `(user_id, token_family_id)` and marks
every active token revoked in one transaction. Existing revocations are preserved, making repeated
calls idempotent.

These helpers are database foundations only. They were not exposed through API endpoints in
Phase 1.

## Phase 8 moderation and publication

The active admin workflow intentionally supersedes the foundation helper at the API boundary:
approval only stores canonical review output, a verified SRID 4326 location, and an explicit
create/merge target. It does **not** write a Place.

`AdminModerationRepository.merge` uses a dedicated connection, locks the approved contribution and
optional target Place, maps canonical category/menu/facility/hour data, appends Place governance
and moderation audit rows, transitions the contribution to `MERGED`, completes the idempotency
record, and commits. Every exception rolls the full unit back. Cache invalidation is a post-commit
side effect and cannot create a partially published database state.
