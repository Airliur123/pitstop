# Dependency audit - 2026-07-23

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
