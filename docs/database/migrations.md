# Migration Workflow

Drizzle schema source is `packages/database/src/schema.ts`, which re-exports the modular files under
`src/schema/`. Generated SQL and metadata live in `packages/database/migrations`.

## Workflow

1. Change the appropriate modular schema file.
2. Run `pnpm db:generate` and review SQL plus snapshot metadata.
3. For Drizzle gaps, add narrowly scoped SQL to the generated migration and document why.
4. Apply with `pnpm db:migrate` to a clean development database.
5. Run `db:check`, `db:seed`, and `db:test`.
6. Run `db:generate` again; no new migration must be emitted when schema has not changed.

The Phase 1 baseline includes controlled SQL additions for:

- `POINT ... SRID 4326` on place and geocoding coordinates;
- `SPATIAL INDEX idx_places_location`;
- explicit InnoDB/UTF8MB4 table conversion;
- UTC session time;
- matching `CURRENT_TIMESTAMP(3)` precision for MySQL 8.4 update clauses;
- shortened FK naming where Drizzle's generated name exceeds MySQL's 64-character limit.

Phase 7 migration `0006_perpetual_lorna_dane.sql` is generated from the modular Drizzle schema and
adds only the contributor ownership and submitted-activity indexes. Its operational and rollback
notes are in [the contribution guide](../contributions/README.md#persistence-and-migration).

Phase 10 migration `0010_stale_queen_noir.sql` is additive to Phase 9. It completes reports,
confirmations, verification metadata, Place history, and generic audit columns; backfills existing
rows before enforcing non-null constraints; adds queue/recency indexes; and installs database
triggers that reject updates or deletes of `place_change_history` and `audit_logs`. Its data-safety,
foreign-key, and event-store boundaries are documented in the
[Phase 10 governance guide](../governance/phase-10.md#migration-0010).
With MySQL binary logging enabled, the database must set `log_bin_trust_function_creators=1` before
a non-`SUPER` migration user applies 0010. Local Compose already supplies this server option.

MySQL DDL auto-commits, so a failed initial migration may leave partial tables. The guarded local
`db:reset` exists only for development/test recovery. Applied shared-environment migrations must
never be edited; corrections require a forward migration.

## Reset safeguard

```bash
PITSTOP_ALLOW_DB_RESET=true pnpm --filter @pitstop/database db:reset
```

The command refuses production and non-local database hosts. It is never part of application
startup or CI deployment.
