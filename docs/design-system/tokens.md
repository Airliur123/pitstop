# Design tokens

Tokens have two layers in `packages/ui/src/styles/tokens.css`.

1. Primitive tokens preserve literal Figma values.
2. Semantic tokens describe usage and are consumed by Tailwind through `@theme inline`.

| Figma variable/style     | Code token          | CSS variable                          | Tailwind usage           |
| ------------------------ | ------------------- | ------------------------------------- | ------------------------ |
| `brand/green`            | brand green         | `--pitstop-color-brand-green`         | semantic source only     |
| `color/bg/app`           | app background      | `--pitstop-color-bg-app`              | `bg-app`                 |
| `color/surface/default`  | default surface     | `--pitstop-color-surface-default`     | `bg-surface`             |
| `color/text/primary`     | primary text        | `--pitstop-color-text-primary`        | `text-foreground`        |
| `color/text/secondary`   | secondary text      | `--pitstop-color-text-secondary`      | `text-muted`             |
| `color/border/default`   | default border      | `--pitstop-color-border-default`      | `border-border`          |
| accessibility adjustment | primary interaction | `--pitstop-color-interactive-primary` | `bg-interactive`         |
| `spacing/4`              | 16 px               | `--pitstop-space-4`                   | `var(--pitstop-space-4)` |
| `radius/button`          | 12 px               | `--pitstop-radius-button`             | `rounded-button`         |
| `radius/card`            | 18 px               | `--pitstop-radius-card`               | `rounded-card`           |
| `radius/modal`           | 24 px               | `--pitstop-radius-modal`              | `rounded-modal`          |
| `Elevation/Card`         | card shadow         | `--pitstop-shadow-card`               | `shadow-card`            |
| `Elevation/Floating`     | floating shadow     | `--pitstop-shadow-floating`           | `shadow-floating`        |
| `Elevation/Overlay`      | overlay shadow      | `--pitstop-shadow-overlay`            | `shadow-overlay`         |

## Figma primitives

- Green `#16A34A`, green dark `#166534`, orange `#F97316`, night navy `#0F2742`.
- Slate 950/500/300/200/100/50 and white follow the Figma variable collection exactly.
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64 px.
- Radius: 0, 8, 12, 18, 24, and 999 px.
- Icon sizes: 16, 20, and 24 px. Minimum target: 48 px.

## Typography

Inter is preferred with system UI fallbacks. No font is fetched at build/test time.

| Style            | Size / line height | Weight |
| ---------------- | ------------------ | ------ |
| Display/XL       | 40 / 48            | 700    |
| Heading/H1       | 28 / 36            | 700    |
| Heading/H2       | 22 / 28            | 600    |
| Heading/H3       | 18 / 24            | 600    |
| Body/Large       | 16 / 24            | 400    |
| Body/Medium      | 14 / 20            | 400    |
| Body/Small       | 13 / 18            | 400    |
| Label/Large      | 15 / 20            | 600    |
| Label/Medium     | 13 / 18            | 600    |
| Numeric/Emphasis | 18 / 24            | 700    |

## Accessibility adjustments

Figma's white 15 px label on `#16A34A` and orange text `#F97316` on `#FFF7ED` do not reach 4.5:1.
Primitive values remain unchanged for traceability. Components use `#15803D` for the primary
interactive background and `#9A3412` for warning text. Muted labels on warning surfaces use primary
text because the Figma pairing reaches only 4.48:1. Automated contrast tests require 4.5:1.

Motion and z-index are implementation foundation tokens because Figma does not publish variables for
them. They are deliberately small, have no alternate theme, and respect `prefers-reduced-motion`.
