# PitStop Mobile PWA & Admin MVP

PitStop is a mobile-first PWA for helping Indonesian ride-hailing drivers find practical stops.
The repository now implements the product and engineering foundation through Phase 9, including
signed Google Form ingestion and asynchronous contribution enrichment.

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
- **Phase 5 - Location, radius, map, and directions:** browser/manual location, fixed-radius
  behavior, synchronized list/map, and safe Google Maps directions.
- **Phase 6 - Guest-first authentication:** optional email magic links, HttpOnly revocable sessions,
  USER/ADMIN authorization foundations, Mailpit delivery, and protected routes.
- **Phase 7 - Contribution flow:** owned resumable drafts, a three-step mobile wizard, canonical
  review/detail, idempotent `DRAFT -> PENDING` submission, and private API/database enforcement.
- **Phase 8 - Admin moderation:** private dashboard and queue, reviewer leases, explicit
  needs-revision/reject/approve decisions, verified publication location, transactional
  `APPROVED -> MERGED` publication, audit history, and accessible confirmation dialogs.
- **Phase 9 - Google Form integration:** HMAC-authenticated durable ingestion, idempotent
  `PENDING` contribution creation, asynchronous geocoding and duplicate hints, retry/DLQ/replay
  foundations, an Apps Script template, and ADMIN-only sync status.

Activity data, profile management, contributor revision handling, Place management, reports, and
bulk moderation remain deferred to their own phases.

### Milestones

The repository contains verified milestone tags through `phase-8-complete`. Phase 9 work remains
uncommitted on the active implementation branch for review.

## Implemented features

- Guest Home with the five MVP categories: Makan Murah, Ngopi, Toilet, Musala, and Istirahat.
- Budget presets for Makan Murah and Ngopi, plus at most one recommendation preview on Home.
- Recommendations and Place Detail backed by the public places API.
- A typed API client with runtime response validation and opaque keyset pagination.
- Loading, empty, network error, rate-limit, not-found, and recommendation fallback states.
- MySQL Spatial and the Drizzle data layer, plus Redis-backed public caching and rate limiting.
- Optional passwordless email sign-in, revocable sessions, safe return routing, and auth-specific
  fail-closed rate limiting.
- Authenticated three-step contribution drafts with category-specific pricing, explicit facility
  states, structured opening hours, server review, idempotent submission, and private detail.
- An ADMIN-only moderation dashboard, signed-cursor queue, claim/reclaim lease, canonical detail,
  append-only decisions, verified locations, and atomic Place publication.
- A signed Google Form endpoint backed by a durable inbox, source-scoped secret rotation and replay
  protection, BullMQ reconciliation, deterministic/local or Nominatim geocoding, moderator-only
  duplicate hints, and safe integration status.
- A production-oriented Google Apps Script template with stable submission IDs, canonical HMAC
  parity, exponential retry, formula-safe sheet status, and manual row replay.
- Shared accessible UI components used by the web and admin application foundations.
- Unit and component tests, MySQL/API integration tests, browser E2E tests, and axe accessibility
  checks.

Activity data, profile editing, OAuth/password flows, contributor revision responses, report
moderation, and general Place CRUD are not active features on this branch.

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

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                     | Run application development tasks through Turborepo            |
| `pnpm build`                   | Build or compile-check every workspace                         |
| `pnpm lint`                    | Lint all applications and packages                             |
| `pnpm typecheck`               | Run strict TypeScript checks                                   |
| `pnpm test`                    | Run workspace unit and component test tasks                    |
| `pnpm db:test`                 | Run MySQL Spatial and database integration tests               |
| `pnpm test:api:integration`    | Run public, auth, contribution, and moderation API integration |
| `pnpm test:worker:integration` | Run MySQL/Redis/BullMQ worker integration tests                |
| `pnpm test:integration`        | Alias for the API integration suite                            |
| `pnpm test:e2e`                | Run Playwright browser E2E and axe accessibility tests         |
| `pnpm format`                  | Apply Prettier formatting                                      |
| `pnpm format:check`            | Check formatting without changes                               |
| `pnpm clean`                   | Remove generated build/test output                             |
| `pnpm docker:up`               | Start local infrastructure                                     |
| `pnpm docker:down`             | Stop infrastructure without deleting volumes                   |
| `pnpm docker:logs`             | Follow infrastructure logs                                     |
| `pnpm docker:reset`            | Stop infrastructure and delete local named volumes             |

## Repository map

- `apps/web` - guest Home/search/detail, optional login/session, and authenticated contribution flow
- `apps/admin` - authenticated moderation dashboard, contribution decisions/publication, and Google
  Form sync status
- `apps/api` - NestJS/Fastify public, authentication, contribution, moderation, and signed
  integration resources with Redis cache/rate limiting
- `apps/worker` - BullMQ ingestion, geocoding, duplicate-hint, reconciliation, and DLQ processors
- `packages/database` - Drizzle schema, migrations, seed, MySQL Spatial queries, and integration tests
- `packages/ui` - shared semantic tokens, accessible components, and web/admin layout primitives
- `packages/contracts` and `packages/validation` - shared public API types and request validation
- `packages/config` and `packages/testing` - environment validation and shared Vitest, Playwright,
  Testcontainers, and axe tooling
- `integrations/google-apps-script` - deployable Apps Script template, field mapping, and signature
  parity fixture
- `infrastructure/*` - local infrastructure notes and assets
- `docs/*` - ADRs plus database, API, admin, authentication, contribution, design-system, guest,
  engineering, security, and testing documentation

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

## Sources

The editable product source of truth is
[PitStop MVP Product & Technical Specification v1.1](https://docs.google.com/document/d/1HFYhRsE89F4ru4JSfhQOPTs9RiaPDVVxawZgB3ROLNQ/edit).
The repository still retains the
[v1.0 PDF](docs/product/PitStop-MVP-Product-Technical-Specification-v1.0.pdf) as the Phase 4 baseline;
there is no local v1.1 PDF on this branch.

The visual source of truth is
[PitStop Design v1.1 - Flow Clarification Update](https://www.figma.com/design/ULbSs8WJIfXZxqo0g5QUPA/PitStop-Mobile-PWA---Admin-MVP).
The connected file contains only Cover and Design System Foundations; it has no Phase 6
authentication, Phase 7 Mobile Contribution Flow, Phase 8 Admin Moderation, or Phase 9 integration
frames. Those flows therefore follow the accepted phase briefs and existing design-system
foundations. Missing product frames remain an explicit design follow-up rather than being silently
treated as complete.
