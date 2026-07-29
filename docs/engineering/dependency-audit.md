# Dependency audit - 2026-07-23

## Phase 2 UI additions

Radix UI packages are MIT licensed and support React 19. Releases were pinned to the latest mutually
installable stable family after the registry's newer Dialog release referenced unpublished
`@radix-ui/react-slot@1.3.1`. No override was added. Lucide React is ISC licensed and matches Figma's
single 24 px outline icon family.

Testing Library and jsdom are development-only. `axe-core` matches the Playwright axe version already
used by the workspace. These packages support component interaction and WCAG regression tests without
adding a production design framework.

At the Phase 2 audit snapshot, `pnpm audit --audit-level critical` exited successfully with no
critical findings and these two transitive findings remained. See the current snapshot below for
the registry's later additions:

- **High - sharp/libvips (GHSA-f88m-g3jw-g9cj):** Next.js 16.2.11 declares `sharp ^0.34.5`, while
  the patched line begins at 0.35.0. A forced override would be outside Next's supported range. Track
  the next compatible Next.js release and update promptly.
- **Moderate - esbuild (GHSA-67mh-4wv8-2f99):** Drizzle Kit's deprecated esbuild-kit loader pulls an
  old esbuild for local migration tooling. It is not an application runtime dependency. Track a
  Drizzle Kit release that removes esbuild-kit rather than forcing an unverified major override.

The PostCSS advisory GHSA-qx2v-qp2m-jg93 was remediated with the documented workspace override to
8.5.22. Full lint, typecheck, tests, and both Next production builds pass with the override.

Deprecated transitive notices remain for `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, and
`glob@10.5.0`; all arrive through current direct dependencies and are not changed independently.

## Phase 5 map additions

The optional guest-results map needs a browser map renderer that can display the same verified place
dataset as the primary list, a fixed 5 km radius, selectable pins, and place-detail summaries. The
following exact versions are installed only in `@pitstop/web`:

- `leaflet@1.9.4` (BSD-2-Clause) is the stable renderer named by the product specification.
- `@types/leaflet@1.9.21` (MIT) is development-only and provides strict TypeScript coverage.

Next.js App Router never server-renders the Leaflet module: a small client wrapper loads it with
`next/dynamic` and `ssr: false`. The client component integrates Leaflet directly through imperative
`useEffect`/ref lifecycles. Center/radius, tile, marker, popup, selection, and error concerns have
separate cleanup paths; every registered handler and layer is removed before dependency replacement,
and `map.remove()` runs during unmount, including React development Strict Mode remounts. This avoids
DOM access during SSR and keeps Leaflet out of the initial list-results server path without another
production mapping abstraction. Leaflet's CSS is global because its controls, panes, and popups rely
on those selectors; PitStop-specific styles use existing design tokens.

OpenStreetMap's public HTTPS tile endpoint is the default token-free base layer and retains visible
attribution. A browser tile request necessarily exposes the visitor IP address, requested tile
coordinates, and referrer to the tile provider. It does not include PitStop's precise location in a
URL, log, telemetry event, or application persistence. Set
`NEXT_PUBLIC_MAP_TILES_DISABLED=true` to omit the tile layer entirely in CI, deterministic E2E, or
privacy-sensitive environments; pins, summaries, and the 5 km circle still render over a neutral
background. Tests must not call the public tile endpoint.

The accessible result list remains the primary experience and the map is an optional enhancement.
Map load or tile failures cannot remove the list. Removing React Leaflet also removes its transitive
`@react-leaflet/core` package and Hippocratic-2.1 license from the production dependency graph.

## Current audit snapshot - 2026-07-29

`pnpm audit --audit-level critical` passes with **zero critical** advisories. The registry currently
reports seven pre-existing transitive advisories: two moderate and five high. None is introduced by
the Phase 9 worker testing addition or through Leaflet and `@types/leaflet`.

- **Moderate:** esbuild in Drizzle Kit's development-only esbuild-kit loader
  (`GHSA-67mh-4wv8-2f99`).
- **Moderate:** `@fastify/static` non-canonical-path authorization bypass
  (`GHSA-8pvw-jcv7-9cmj`).
- **High:** optional Sharp/libvips below 0.35 through Next.js (`GHSA-f88m-g3jw-g9cj`).
- **High:** `find-my-way` HTTP/2 denial of service through Nest Fastify
  (`GHSA-c96f-x56v-gq3h`).
- **High:** js-yaml exponential parsing through Nest Swagger (`GHSA-pm4m-ph32-ghv5`).
- **High:** `@fastify/static` path traversal/route-guard bypass (`GHSA-83w8-p2f5-377r`).
- **High:** brace-expansion unbounded expansion through several existing build/runtime dependency
  paths (`GHSA-mh99-v99m-4gvg`).

Remediating these safely requires compatible parent-package updates and full API/build regression
testing; forcing unrelated transitive versions was intentionally not folded into Phase 5. They
remain release warnings despite the requested critical-threshold gate passing.

## Phase 1 temporary risk acceptance

The high `sharp` finding is accepted only for Phase 1 local-development database work. It must be
remediated before production deployment, user-controlled image processing, or Phase 2 media work.
This records the technical basis and does not substitute for release-owner approval.

# Phase 6 authentication additions

- `nodemailer@9.0.3` is the SMTP adapter for Mailpit and deployment SMTP providers. It supports the
  locked Node.js 24 runtime, has no runtime dependencies, and avoids coupling the domain service to
  a provider-specific HTTP SDK.
- `@types/nodemailer@8.0.1` supplies TypeScript declarations compatible with the Nodemailer 9 API
  surface used here.
- `vitest@4.1.10` was added to `@pitstop/validation` development dependencies so the new shared auth
  schemas are tested in their owning package. This is the same pinned test version already used by
  the workspace and adds no production runtime code.

The additions were checked against the locked Node/pnpm toolchain. No framework, database, workspace,
or architecture dependency changed.

## Phase 8 admin testing additions

`@pitstop/admin` now declares the existing `@pitstop/validation` workspace package because its
server callback must apply the same safe magic-link token/return validation as web and API. This
adds no third-party runtime package.

The admin package also declares `vitest@4.1.10`, `@testing-library/react@16.3.2`, and
`@testing-library/jest-dom@7.0.0` as development-only dependencies. These exact versions were
already pinned, installed, and proven compatible with React 19, TypeScript 6, jsdom, and Node 24 in
`@pitstop/web`; Phase 8 reuses them to test accessible decision dialogs and status-valid actions in
their owning app. No new version, production dependency, or package-manager override was
introduced.

## Phase 9 worker testing additions

`@pitstop/worker` now declares the existing contracts, validation, and database workspace packages
because job payloads, canonical validation, and transactional inbox effects are shared boundaries.
It also declares the already pinned `testcontainers@12.0.4` as development-only so worker
integration tests run against isolated MySQL 8.4 and Redis without relying on the internet.

No new third-party production dependency, database client, queue implementation, geocoder SDK, or
secret-management library was introduced. The implementation reuses BullMQ, ioredis, mysql2,
NestJS, native `fetch`, and Node's crypto primitives already in the locked stack.
