# Phase 0 toolchain

Versions were checked against the npm registry and official upstream image/release listings on
2026-07-23. Stable releases were selected without alpha, beta, canary, RC, or nightly builds.

| Tool or dependency   | Version                                            |
| -------------------- | -------------------------------------------------- |
| Node.js LTS          | 24.x (validation runtime: 24.14.0)                 |
| pnpm                 | 11.9.0                                             |
| Turborepo            | 2.10.6                                             |
| TypeScript           | 6.0.3 (latest supported by TypeScript ESLint 8.65) |
| ESLint / Prettier    | 9.39.5 / 3.9.6                                     |
| Next.js / React      | 16.2.11 / 19.2.8                                   |
| Tailwind CSS         | 4.3.3                                              |
| NestJS / Fastify     | 11.1.28 / 5.10.0                                   |
| Validation runtime   | class-validator 0.15.1 / class-transformer 0.5.1   |
| Zod                  | 4.4.3                                              |
| Drizzle ORM / mysql2 | 0.45.2 / 3.23.1                                    |
| BullMQ / ioredis     | 5.80.10 / 5.11.1                                   |
| Vitest / Playwright  | 4.1.10 / 1.61.1                                    |
| YAML parser          | 2.9.0 (Compose syntax test only)                   |
| MySQL container      | 8.4.10                                             |
| Redis container      | 8.2.7-alpine                                       |
| Mailpit container    | 1.30.0                                             |
| MinIO container      | RELEASE.2025-09-07T16-13-09Z                       |

One pnpm override pins PostCSS 8.5.22 across Next/Tailwind because it patches
GHSA-qx2v-qp2m-jg93 while staying on the same PostCSS major. Full tests and both Next production builds
verify compatibility. Shared dependency versions are identical across workspace manifests.

MinIO upstream archived the community repository in April 2026. Its latest source-only security
release is newer than the final published community container used here. The service is bound only to
localhost for development. Before Phase 1, decide whether to build the security release from source or
approve a maintained S3-compatible MinIO distribution while preserving the locked MinIO/S3 contract.
