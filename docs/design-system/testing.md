# Design-system testing

## Commands

```bash
pnpm exec playwright install chromium
sudo pnpm exec playwright install-deps chromium
pnpm --filter @pitstop/ui test
pnpm test:e2e
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level critical
```

The two Playwright installation commands are machine prerequisites, not workspace dependencies.
Install the Chromium browser once per Playwright version. Install the Linux system libraries when
the browser reports a missing shared library; the second command may require administrator access.

## Coverage

Vitest and React Testing Library cover variants, disabled/loading state, accessible names, label and
error association, checkbox/select keyboard behavior, Dialog and Sheet Escape/focus restoration,
Tabs arrow navigation, live regions, status labels, skeleton exposure, mobile current navigation, and
admin keyboard access.

`axe-core` runs against representative component composition. Its jsdom run disables only
`color-contrast` because jsdom cannot render canvas; pure token-ratio tests and Playwright's real
Chromium axe run cover contrast without suppression.

Playwright starts web on port 3000 and admin on 3001 with the catalog flag enabled. Projects cover:

- 360 x 800
- 390 x 844
- 1280 x 800
- 1440 x 900

Smoke tests verify both shells and catalogs, horizontal overflow, focus visibility, mobile/admin
keyboard navigation, dialog behavior, browser console/page errors, hydration warnings, and serious or
critical axe violations. Screenshots and traces are retained only on failure and remain ignored.
