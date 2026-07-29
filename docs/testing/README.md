# Testing foundation

Vitest validates environment parsing, contracts, API liveness/error shape, worker lifecycle, and
database configuration. Testcontainers, Playwright, axe-core, and k6 are foundations for later phase-
specific integration, E2E, accessibility, and load suites. k6 is an external CLI and is not an npm
runtime dependency.

Phase 6-7 use MySQL, Redis, and Mailpit Testcontainers for API integration and the local Compose
services for Playwright authentication and contribution flows. Run `pnpm db:test`,
`pnpm test:api:integration`, and `pnpm test:e2e`; authentication cases tagged `@auth-core` and the
full contribution case tagged `@contribution-core` run once in the 390px project. See
[the authentication test matrix](../authentication/README.md#tests) and
[the contribution guide](../contributions/README.md#local-run-and-tests).

Phase 9 adds `pnpm test:worker:integration` with isolated MySQL/Redis containers. The API suite
checks signed ingestion, key rotation, replay/body conflicts, admin RBAC/CSRF and OpenAPI. The
`@admin-core` Playwright integration case uses a local HMAC client, the deterministic geocoder, and
the real reconciliation worker to cover inbox-to-moderation flow, duplicate delivery, low
confidence, duplicate hints, USER denial, and axe. It does not call Google Cloud or the internet.
