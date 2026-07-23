# Testing foundation

Vitest validates environment parsing, contracts, API liveness/error shape, worker lifecycle, and
database configuration. Testcontainers, Playwright, axe-core, and k6 are foundations for later phase-
specific integration, E2E, accessibility, and load suites. k6 is an external CLI and is not an npm
runtime dependency.
