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

## Current audit snapshot - 2026-07-31

`pnpm audit --audit-level critical` passes. The full registry result is **zero critical, five high,
and two moderate advisories**. Passing the critical threshold is not evidence that the remaining
findings are safe; each one remains a release warning. Phase 11 removed the unused direct
`@fastify/static` declaration from the API, but did not force vulnerable transitive packages outside
their parent packages' supported ranges.

| Severity | Advisory and affected path                                                                                                                                                                                                                               | Runtime exposure and exploitability                                                                                                                                                                                                                                                                                                                                                     | Current mitigation                                                                                                                                                | Follow-up                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Sharp/libvips below `0.35.0` (`GHSA-f88m-g3jw-g9cj`): `@pitstop/web` and `@pitstop/admin` → `next@16.2.11` → `sharp@0.34.5`; Serwist also reaches the same Next package.                                                                                 | Sharp is an optional production image-optimizer path. The repository does not currently send user uploads or remote images through `next/image`, so the vulnerable native decoder is not reachable from a current request flow. Exposure would change immediately if untrusted image processing were added.                                                                             | Both Next applications set `images.unoptimized=true`, contain no `next/image` request flow, and must not accept user-controlled image processing on this version. | Upgrade Next to a compatible release whose declared Sharp range includes `>=0.35.0`, then run both application builds and image regression tests. Do not override Sharp beyond Next's supported range. |
| High     | `find-my-way<=9.6.0` HTTP/2 denial of service (`GHSA-c96f-x56v-gq3h`): `@pitstop/api` → `@nestjs/platform-fastify@11.1.28` → `find-my-way@9.6.0`. A separate direct Fastify resolution is `9.7.0`, but it does not remove Nest's vulnerable nested copy. | This is a production API router dependency. The application Fastify listener is HTTP/1 on loopback and Phase 11 does not expose it directly or enable Fastify HTTP/2, which blocks the advisory's current trigger. A future reverse-proxy or listener change must not be assumed safe.                                                                                                  | Keep the API bound to the configured internal host, enforce URL/body/rate limits, and terminate public traffic at the Phase 12 proxy boundary.                    | Upgrade `@nestjs/platform-fastify` to a compatible release resolving a patched router, then regression-test routing, proxy trust, CORS, health, and rate limiting.                                     |
| High     | `js-yaml>=5.0.0 <=5.2.1` exponential parsing (`GHSA-pm4m-ph32-ghv5`): `@pitstop/api` → `@nestjs/swagger@11.4.6` → `js-yaml@5.2.1`.                                                                                                                       | The package is in the API dependency graph, but PitStop creates OpenAPI metadata in code and does not parse request-supplied YAML. Swagger is development/test-only: production configuration rejects `API_SWAGGER_ENABLED=true`, and bootstrap does not create the OpenAPI document while disabled.                                                                                    | Keep Swagger limited to intentional local/test environments and never pass request bodies/files to this parser.                                                   | Upgrade `@nestjs/swagger` when it adopts patched `js-yaml>=5.2.2`; regenerate and inspect OpenAPI output and rerun API integration tests.                                                              |
| High     | `@fastify/static<=10.1.0` path traversal/route-guard bypass (`GHSA-83w8-p2f5-377r`): `@pitstop/api` → `@nestjs/platform-fastify@11.1.28` and `@nestjs/swagger@11.4.6` → `@fastify/static@9.3.0`.                                                         | The package remains transitive, but the API no longer declares or registers a general static-file plugin. Its only plausible current activation is Swagger UI, which production configuration rejects. No request-controlled filesystem root is configured.                                                                                                                             | Keep the direct dependency absent, Swagger development/test-only, and static content served by the Next applications rather than the API.                         | Upgrade the compatible Nest platform/Swagger parents to resolve `@fastify/static>=10.1.1`; if Swagger UI is enabled, add encoded traversal and route-guard regression cases before deployment.         |
| Moderate | `@fastify/static<=10.1.1` non-canonical-path authorization bypass (`GHSA-8pvw-jcv7-9cmj`) through the same Nest platform and Swagger paths, currently `@fastify/static@9.3.0`.                                                                           | Exposure is the same disabled-by-default Swagger/static path above. PitStop does not use static-path shape as an authorization decision.                                                                                                                                                                                                                                                | Do not enable a public API static root or protect resources solely by raw pathname comparison.                                                                    | Resolve `@fastify/static>=10.1.2` through compatible Nest/Swagger parent releases and test percent-encoded, duplicate-separator, and other non-canonical paths.                                        |
| High     | `brace-expansion<=5.0.7` denial of service (`GHSA-mh99-v99m-4gvg`), including root ESLint → minimatch → `brace-expansion@1.1.16`; worker/API testcontainers → archiver/glob/minimatch → `2.1.2`; and web Serwist build → glob/minimatch → `5.0.7`.       | Current brace/glob patterns are developer-controlled build, lint, test, and startup inputs; no public request field is converted into a glob or brace expression. The transitive Fastify static path also reaches `5.0.7`, but the plugin is not registered as a general API file server. Current remote exploitability is low; untrusted local/CI patterns could still exhaust memory. | Keep glob/brace patterns constant and never forward request values to filesystem matching. Bound CI inputs and retain the absent direct API static dependency.    | Upgrade the owning toolchain packages as compatible releases adopt patched generations. Do not use one workspace override across incompatible `brace-expansion` major versions.                        |
| Moderate | `esbuild@0.18.20` development-server cross-origin request issue (`GHSA-67mh-4wv8-2f99`): `@pitstop/database` → `drizzle-kit@0.31.10` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20`.                                        | This path is development-only migration tooling. PitStop does not start esbuild's development server, and the package is absent from the deployed API, worker, web, and admin runtime bundles.                                                                                                                                                                                          | Run Drizzle Kit as a local/CI CLI only; do not expose an esbuild dev server or its port.                                                                          | Upgrade Drizzle Kit when its supported dependency chain removes the deprecated esbuild-kit loader, then verify migration generation/check workflows.                                                   |

The accepted remediation strategy is to update the owning parent package, confirm its compatibility
with Node 24 and the locked stack, and run the complete quality gates. There are no blind resolution
overrides, dependency downgrades, audit suppression flags, or claims that a transitive advisory is
fixed merely because the corresponding feature is currently disabled.

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
