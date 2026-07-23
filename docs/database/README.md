# PitStop Phase 1 Database

Phase 1 implements the relational and spatial foundation for PitStop on MySQL 8.4, InnoDB,
UTF8MB4, Drizzle ORM, and `mysql2`. It does not expose business endpoints or implement Phase 2+
features.

## Design invariants

- Domain identifiers are application-generated ULIDs stored as `CHAR(26)`.
- Mutable timestamps use UTC `TIMESTAMP(3)`; Jakarta time is applied only when evaluating business
  operating hours.
- Places are soft-deleted with `deleted_at`; there is no place hard-delete workflow.
- Mutable domain aggregates use a positive integer `version` for optimistic concurrency.
- Money is stored as integer rupiah in columns ending `_amount`.
- Place coordinates are a non-null geographic `POINT` constrained to SRID 4326 and indexed with an
  InnoDB spatial index.
- Raw values are always bound parameters. Dynamic user values are never interpolated into SQL.
- `publicUserColumns` is the safe user projection and intentionally omits `password_hash`.

## Domain groups

| Group         | Tables                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | `users`, `roles`, `user_roles`, `auth_accounts`, `refresh_tokens`                                                                                     |
| Places        | `places`, `categories`, `place_categories`, `menus`, `facilities`, `place_facilities`, `operating_hours`, `operating_hour_exceptions`, `place_photos` |
| Contributions | `contributions`, `contribution_payloads`, `contribution_photos`, `moderation_reviews`                                                                 |
| Reports       | `place_confirmations`, `place_reports`, `report_evidence`                                                                                             |
| Integrations  | `integration_sources`, `google_form_submissions`, `geocoding_results`, `idempotency_keys`                                                             |
| Governance    | `audit_logs`, `place_change_history`                                                                                                                  |

## Commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @pitstop/database db:check
pnpm db:test
```

`db:reset` is intentionally guarded. It rejects production, restricts the database host to local
development/test values, and requires `PITSTOP_ALLOW_DB_RESET=true`.

`db:studio` is restricted to `NODE_ENV=development` and a local MySQL host before it starts the
Drizzle Studio process.

See [migrations.md](./migrations.md), [seeding.md](./seeding.md), [spatial.md](./spatial.md), and
[transactions.md](./transactions.md) for operational details.
