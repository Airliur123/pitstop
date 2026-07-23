# PitStop Design System

Phase 2 implements the shared visual and accessibility foundation for `apps/web` and `apps/admin`.
Figma file **PitStop Mobile PWA & Admin MVP**, design version **PitStop Design v1.0**, is the visual
source of truth. The product specification and accepted ADRs define scope and architecture.

## Package structure

```text
packages/ui/src/
  components/  actions, display, feedback, forms, navigation, overlays
  layout/      mobile/admin shells and small layout primitives
  styles/      primitive and semantic tokens
  testing/     component-test setup
  index.ts     public, tree-shakable exports
```

Import components from `@pitstop/ui` and load `@pitstop/ui/styles.css` once through each application's
global CSS. The applications currently use the source stylesheet directly so Tailwind v4 can process
its `@theme` block.

## Component API conventions

- Components use semantic tokens; shared component files do not hardcode product colors.
- Native HTML is preferred. Radix is used where focus management or composite keyboard behavior is
  required.
- Refs and `className` are forwarded on low-level controls.
- Product data, routing policy, API calls, and database access do not belong in this package.
- Files without interactive state remain Server Component compatible.
- `"use client"` is limited to Radix-based form, navigation, and overlay modules.
- Add CVA variants only for variants represented by Figma or an accepted accessibility adjustment.

## Scope

Phase 2 includes tokens, reusable components, mobile/admin shells, development catalogs, and UI tests.
It intentionally excludes recommendations, locations, maps, authentication, contribution/moderation
workflows, service workers, and real admin data.

See [tokens.md](./tokens.md), [components.md](./components.md),
[accessibility.md](./accessibility.md), and [figma-mapping.md](./figma-mapping.md).
