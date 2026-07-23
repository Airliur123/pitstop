# Coding agent rules

These rules apply to Codex and every other coding agent working in this repository.

1. Read the product specification in `docs/product` and the active phase definition before editing.
2. Preserve the locked stack and modular-monolith boundaries. Do not introduce Prisma, GraphQL,
   PostgreSQL, microservices, Bun, npm workspaces, or Yarn.
3. Keep TypeScript strict. Do not weaken compiler, lint, or test settings to make a change pass.
4. Do not add a dependency without a concrete, documented need and compatibility check.
5. Do not implement work from a later phase or reproduce final Figma screens early.
6. Never skip, delete, or trivialize a test to hide a failure.
7. Never commit secrets, `.env`, production data, tokens, or credentials.
8. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before handoff.
9. Use Drizzle migrations for every database change beginning in Phase 1. Never mutate shared
   environments manually.
10. Parameterize every raw SQL value. String interpolation in SQL is prohibited.
11. Do not modify the source-of-truth PDF or silently reinterpret accepted ADRs.
12. Report changed files, decisions, validation results, warnings, and intentionally deferred work.
