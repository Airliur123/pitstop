# Dependency audit - 2026-07-23

## Phase 2 UI additions

Radix UI packages are MIT licensed and support React 19. Releases were pinned to the latest mutually
installable stable family after the registry's newer Dialog release referenced unpublished
`@radix-ui/react-slot@1.3.1`. No override was added. Lucide React is ISC licensed and matches Figma's
single 24 px outline icon family.

Testing Library and jsdom are development-only. `axe-core` matches the Playwright axe version already
used by the workspace. These packages support component interaction and WCAG regression tests without
adding a production design framework.

`pnpm audit --audit-level critical` exits successfully with no critical findings. Two transitive
findings remain:

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

## Phase 1 temporary risk acceptance

The high `sharp` finding is accepted only for Phase 1 local-development database work. It must be
remediated before production deployment, user-controlled image processing, or Phase 2 media work.
This records the technical basis and does not substitute for release-owner approval.
