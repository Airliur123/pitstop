# Accessibility foundation

Target: WCAG 2.2 Level AA.

## Implemented rules

- Semantic page landmarks and a visible-on-focus skip link.
- Visible `focus-visible` rings using the blue focus token.
- 48 x 48 px action, navigation, checkbox, radio, and switch targets.
- Native labels and described-by relationships for help and error text.
- Radix focus trap, Escape handling, focus restoration, and composite keyboard navigation.
- `aria-current` on navigation, text labels on status, and names on icon-only controls.
- Polite live regions for non-destructive feedback and assertive alerts for failures.
- Skeletons are `aria-hidden`; loading controls expose `aria-busy`.
- `prefers-reduced-motion` reduces animation and transition duration globally.
- Safe-area handling and responsive layouts avoid horizontal overflow at required viewports.

## Contrast

The original Figma primitives are preserved. Primary action and warning text semantic roles use the
documented minimum adjustments in `tokens.md`. Unit tests calculate their ratios, and browser axe
tests run without suppressing color contrast.

The jsdom component axe test disables only `color-contrast` because jsdom has no canvas renderer.
That gap is covered by token ratio tests and unsuppressed Playwright axe in Chromium.

## Consumer requirements

- Keep visible labels; placeholders are not labels.
- Provide a title and meaningful description for overlays.
- Use native disabled state for buttons. Use `aria-disabled` only when native disabling is unavailable.
- Do not use color, an icon, or map position as the only carrier of status.
- Preserve DOM focus order and avoid positive `tabIndex`.
