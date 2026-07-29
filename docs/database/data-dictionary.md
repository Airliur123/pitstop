# Data Dictionary

All IDs below are ULID `CHAR(26)` unless noted. Every foreign key declares explicit delete/update
behavior in the Drizzle schema and migration.

## Identity

- `users`: `id`, `email`, `normalized_email`, generated `active_normalized_email`, `display_name`,
  nullable `password_hash`, `status`, verification/login timestamps, `version`, timestamps, and
  `deleted_at`. Active normalized email is unique; OAuth-only users may have no password hash.
- `roles`: role master with unique `code`, name, description, and creation timestamp. Seeded codes are
  `USER` and `ADMIN`; guest is not persisted.
- `user_roles`: composite primary key `(user_id, role_id)`, assignment timestamp and nullable
  `assigned_by`.
- `auth_accounts`: links a user to `PASSWORD` or `GOOGLE`; `(provider, provider_account_id)` is
  unique.
- `refresh_tokens`: stores only `token_hash`, family ID, expiry/revocation/replacement metadata,
  user-agent and IP hash. Token plaintext is never persisted.

## Places

- `places`: descriptive address fields; `location POINT NOT NULL SRID 4326`; locked place and
  verification enums; verifier/freshness metadata; `version`; timestamps and `deleted_at`.
- `categories`: unique code, display fields, `is_primary`, and sort order. Seeded codes:
  `MAKAN_MURAH`, `NGOPI`, `TOILET`, `MUSALA`, `ISTIRAHAT`.
- `place_categories`: composite place/category key. A generated nullable `primary_place_id` unique
  key enforces at most one primary category per place.
- `menus`: place menu with integer `price_amount`, `is_main_item`, availability, sort order,
  `version`, timestamps and soft delete. `(place_id, name)` is unique for idempotent updates.
- `facilities`: unique facility code and display fields.
- `place_facilities`: composite place/facility key, locked facility status and confirmation time.
- `operating_hours`: weekday `0` (Sunday) through `6` (Saturday), nonnegative `sequence`, nullable
  open/close times and explicit 24-hour flag. The unique key supports split schedules.
- `operating_hour_exceptions`: per-place/date/sequence overrides. Closed entries have no times;
  open entries require both times.
- `place_photos`: object metadata, nonnegative file size, positive optional dimensions, ordering,
  primary marker, and soft delete. A generated unique key limits active primary photos to one/place.

## Contribution and moderation

- `contributions`: submitter, source, locked status, nullable target place and revision parent,
  submission/review timestamps and `version`.
- `contribution_payloads`: one versioned JSON payload per contribution. It is moderation input, not
  public canonical place data.
- `contribution_photos`: contribution media metadata with unique object key and nonnegative size.
- `moderation_reviews`: immutable reviewer decision, reason/note, optional duplicate place and
  creation timestamp.

## Community reports

- `place_confirmations`: one row per `(user_id, place_id)` with confirmation type and timestamps.
- `place_reports`: place, reporter, type, proposed JSON, locked status, reviewer metadata,
  `version`, and timestamps.
- `report_evidence`: report media metadata with unique object key and nonnegative size.

## Integration

- `integration_sources`: unique integration code, activation flag, current/previous key identifiers,
  replay/rate-limit policy and timestamps. It never stores HMAC key material.
- `google_form_submissions`: durable source/external identity, canonical JSON and schema version,
  request hash, accepted key identifier, correlation/timestamps, processing and downstream stage
  states, safe errors, attempts, and nullable contribution link. Source plus external ID is unique.
- `geocoding_results`: exactly one contribution/place subject, provider, nullable SRID 4326 result,
  normalized address, confidence/status, bounded raw summary, verification flag and timestamps. A
  contribution has at most one current geocoding result.
- `duplicate_place_hints`: unique contribution/candidate pair with inbox relation, distance,
  deterministic matched signals/score and creation timestamp. Hints never mutate a Place.
- `idempotency_keys`: scope/key uniqueness, request hash, optional response, lock and expiry
  timestamps. Expiry must follow creation.

## Governance

- `audit_logs`: append-only policy record with actor/role/action, generic target, request ID,
  previous/new JSON, reason and creation timestamp.
- `place_change_history`: immutable place history with actor, generic source, change type,
  previous/new JSON, reason and creation timestamp.
