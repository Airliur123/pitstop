# Contributing

Use short-lived branches named `feature/<topic>`, `fix/<topic>`, `chore/<topic>`, or `docs/<topic>`.
Conventional Commit-style messages such as `feat(api): ...`, `fix(config): ...`, and `chore(ci): ...`
are recommended.

Pull requests should be focused and include:

- scope and active development phase;
- implementation and architecture decisions;
- documentation changes;
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` results;
- security, rollback, and compatibility notes where relevant;
- screenshots only when UI changes are in phase.

Database changes require a reviewed Drizzle migration, backward-compatibility analysis, rollback or
forward-fix plan, and integration coverage. Never edit an already-applied migration.
