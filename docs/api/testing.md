# API Testing

Run:

```bash
pnpm --filter @pitstop/api test
pnpm db:test
pnpm test:api:integration
pnpm test:e2e
```

Unit coverage includes strict query parsing, cursor encoding/validation, cache-key normalization,
Asia/Jakarta overnight/24-hour opening state, score/ranking, and response mapping.

Database integration uses real MySQL 8.4 via Testcontainers. It covers eligibility, SRID/axis order,
radius, category, Makan Murah/Ngopi budget, main/available/deleted menus, stable keyset pages, safe
detail, fallback diagnostics, and injection-like input.

API integration uses real NestJS/Fastify, MySQL 8.4, and Redis containers. It covers all public
routes, Problem Details, validation/security regressions, OpenAPI, cache malformed/miss/hit/TTL,
rate-limit 429, unique request IDs, secure headers, and Redis-down fail-open.

Browser Playwright remains the Phase 2 design-system suite; Phase 4 guest screens are intentionally
not introduced.
