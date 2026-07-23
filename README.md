# PitStop Mobile PWA & Admin MVP

PitStop is a mobile-first PWA foundation for helping Indonesian ride-hailing drivers find practical
stops. This repository currently contains **Phase 0 - Repository and Engineering Foundation** only:
tooling, application shells, shared packages, local infrastructure, tests, CI, and documentation.
No PitStop business feature or final Figma UI is implemented.

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

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `pnpm dev`              | Run application development tasks through Turborepo |
| `pnpm build`            | Build or compile-check every workspace              |
| `pnpm lint`             | Lint all applications and packages                  |
| `pnpm typecheck`        | Run strict TypeScript checks                        |
| `pnpm test`             | Run Phase 0 behavior tests                          |
| `pnpm test:integration` | Run API integration suite foundation                |
| `pnpm test:e2e`         | Run Playwright suite when Phase E2E tests exist     |
| `pnpm format`           | Apply Prettier formatting                           |
| `pnpm format:check`     | Check formatting without changes                    |
| `pnpm clean`            | Remove generated build/test output                  |
| `pnpm docker:up`        | Start local infrastructure                          |
| `pnpm docker:down`      | Stop infrastructure without deleting volumes        |
| `pnpm docker:logs`      | Follow infrastructure logs                          |
| `pnpm docker:reset`     | Stop infrastructure and delete local named volumes  |

## Repository map

- `apps/web` - user PWA shell
- `apps/admin` - separate administration shell
- `apps/api` - NestJS/Fastify REST API and health endpoints
- `apps/worker` - dedicated BullMQ worker
- `packages/*` - shared UI, database, contract, validation, configuration, and testing foundations
- `infrastructure/*` - local infrastructure notes and future assets
- `docs/*` - ADRs and engineering/product/security/testing documentation

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

The product source of truth is
[`docs/product/PitStop-MVP-Product-Technical-Specification-v1.0.pdf`](docs/product/PitStop-MVP-Product-Technical-Specification-v1.0.pdf).
The visual reference is
[PitStop Design v1.0 in Figma](https://www.figma.com/design/ULbSs8WJIfXZxqo0g5QUPA/PitStop-Mobile-PWA---Admin-MVP).
Figma is documentation-only in Phase 0. Phase 1 adds reviewed Drizzle schema, migrations, development
seed data, and MySQL spatial integration tests.
