# PitStop Mobile PWA & Admin MVP

PitStop is a mobile-first PWA for helping Indonesian ride-hailing drivers find practical stops.
The repository has completed the engineering foundation through the Phase 4 guest mobile vertical
slice.

## Current status

- **Phase 0 - Engineering foundation:** Turborepo, pnpm workspaces, application foundations, local
  infrastructure, testing, CI, and documentation.
- **Phase 1 - Data layer:** MySQL 8.4 Spatial, Drizzle schema and migrations, seed data, and spatial
  integration tests.
- **Phase 2 - Shared design system:** semantic tokens, accessible shared UI components, and web/admin
  shells.
- **Phase 3 - Public places API:** guest-readable categories, place search and detail,
  recommendations, caching, rate limiting, and API integration tests.
- **Phase 4 - Guest mobile vertical slice:** Home, Recommendations, and Place Detail connected to the
  public API, with browser E2E and accessibility coverage.

Phase 5 is next: browser geolocation, permission and location states, manual location and its invalid
state, radius behavior, an optional map, and Google Maps directions. These Phase 5 capabilities are
not implemented yet; Phase 4 uses an explicitly labelled development/E2E location fixture.

### Milestones

The repository contains the verified milestone tags `phase-1-complete`, `phase-2-complete`,
`phase-3-complete`, and `phase-4-complete`.

## Implemented features

- Guest Home with the five MVP categories: Makan Murah, Ngopi, Toilet, Musala, and Istirahat.
- Budget presets for Makan Murah and Ngopi, plus at most one recommendation preview on Home.
- Recommendations and Place Detail backed by the public places API.
- A typed API client with runtime response validation and opaque keyset pagination.
- Loading, empty, network error, rate-limit, not-found, and recommendation fallback states.
- MySQL Spatial and the Drizzle data layer, plus Redis-backed public caching and rate limiting.
- Shared accessible UI components used by the web and admin application foundations.
- Unit and component tests, MySQL/API integration tests, browser E2E tests, and axe accessibility
  checks.

Authentication, contribution, activity, admin moderation, browser geolocation, maps, and external
directions are not active features on this branch.

## Prerequisites

- Windows 11 with WSL 2 and an Ubuntu LTS distribution
- Node.js 24 LTS (use a version manager inside WSL)
- Corepack and pnpm 11.9.0
- Docker Desktop with WSL integration, or Docker Engine plus Compose v2 inside WSL
- Git

For reliable file watching and faster installs, clone or copy the repository to the WSL filesystem
(for example `~/src/pitstop`) instead of developing under `/mnt/c`.

## Setup

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d
pnpm dev
```

The values in `.env.example` are local-only examples. Change the local passwords before sharing a
development environment. Never commit `.env`.

## Run one application

```bash
pnpm --filter @pitstop/web dev
pnpm --filter @pitstop/admin dev
pnpm --filter @pitstop/api dev
pnpm --filter @pitstop/worker dev
```

## Local ports

| Service        | URL or port                       |
| -------------- | --------------------------------- |
| Web            | http://localhost:3000             |
| Admin          | http://localhost:3001             |
| API health     | http://localhost:3002/health/live |
| API OpenAPI UI | http://localhost:3002/api/docs    |
| MySQL          | localhost:3306                    |
| Redis          | localhost:6379                    |
| MinIO API      | http://localhost:9000             |
| MinIO console  | http://localhost:9001             |
| Mailpit SMTP   | localhost:1025                    |
| Mailpit UI     | http://localhost:8025             |

## Workspace commands

| Command                     | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `pnpm dev`                  | Run application development tasks through Turborepo    |
| `pnpm build`                | Build or compile-check every workspace                 |
| `pnpm lint`                 | Lint all applications and packages                     |
| `pnpm typecheck`            | Run strict TypeScript checks                           |
| `pnpm test`                 | Run workspace unit and component test tasks            |
| `pnpm db:test`              | Run MySQL Spatial and database integration tests       |
| `pnpm test:api:integration` | Run the public API integration suite                   |
| `pnpm test:integration`     | Alias for the public API integration suite             |
| `pnpm test:e2e`             | Run Playwright browser E2E and axe accessibility tests |
| `pnpm format`               | Apply Prettier formatting                              |
| `pnpm format:check`         | Check formatting without changes                       |
| `pnpm clean`                | Remove generated build/test output                     |
| `pnpm docker:up`            | Start local infrastructure                             |
| `pnpm docker:down`          | Stop infrastructure without deleting volumes           |
| `pnpm docker:logs`          | Follow infrastructure logs                             |
| `pnpm docker:reset`         | Stop infrastructure and delete local named volumes     |

## Repository map

- `apps/web` - Phase 4 guest Home, Recommendations, Place Detail, typed API client, and resilient
  guest states
- `apps/admin` - separate administration shell and shared UI catalog; moderation is not implemented
- `apps/api` - NestJS/Fastify public categories, places, detail, and recommendations REST API with
  Redis cache/rate limiting
- `apps/worker` - BullMQ/Redis worker bootstrap and lifecycle foundation
- `packages/database` - Drizzle schema, migrations, seed, MySQL Spatial queries, and integration tests
- `packages/ui` - shared semantic tokens, accessible components, and web/admin layout primitives
- `packages/contracts` and `packages/validation` - shared public API types and request validation
- `packages/config` and `packages/testing` - environment validation and shared Vitest, Playwright,
  Testcontainers, and axe tooling
- `infrastructure/*` - local infrastructure notes and assets
- `docs/*` - ADRs plus database, API, design-system, guest, engineering, security, and testing
  documentation

## Troubleshooting

- **`wsl --list --verbose` shows no distribution:** install Ubuntu with `wsl --install -d Ubuntu`,
  reboot if requested, then complete the first-run user setup.
- **`docker` is unavailable in WSL:** enable the distribution under Docker Desktop > Settings >
  Resources > WSL Integration, then restart the WSL shell.
- **Environment validation fails:** compare `.env` with `.env.example`; the error names every invalid
  or missing key.
- **Ports are already in use:** stop the conflicting process or adjust both `.env` and the relevant
  development command/Compose binding.
- **Next.js file watching is slow under `/mnt/c`:** move the repository to `~/src/pitstop`.

## Sources and next phase

The editable product source of truth is
[PitStop MVP Product & Technical Specification v1.1](https://docs.google.com/document/d/1HFYhRsE89F4ru4JSfhQOPTs9RiaPDVVxawZgB3ROLNQ/edit).
The repository still retains the
[v1.0 PDF](docs/product/PitStop-MVP-Product-Technical-Specification-v1.0.pdf) as the Phase 4 baseline;
there is no local v1.1 PDF on this branch.

The visual source of truth is
[PitStop Design v1.1 - Flow Clarification Update](https://www.figma.com/design/ULbSs8WJIfXZxqo0g5QUPA/PitStop-Mobile-PWA---Admin-MVP).
The current delivery status is **Ready for Phase 5**. Phase 5 remains the next implementation stage
for browser geolocation, permission and location states, manual and invalid manual location, radius
behavior, the optional map, and Google Maps directions.
