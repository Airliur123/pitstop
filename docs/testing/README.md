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
