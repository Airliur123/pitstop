# Shared components

Public exports are defined in `packages/ui/src/index.ts`.

## Actions

- `Button`: primary, secondary, ghost/text, destructive; disabled and width-stable loading states.
- `IconButton`: requires an accessible `aria-label`.
- `LinkButton`: anchor semantics with button presentation.

## Forms

- `Label`, `Input`, `Textarea`, `SearchField`, `FormField`, `FieldDescription`, `FieldError`.
- Radix-based `Checkbox`, `RadioGroup`, `Switch`, and `Select`.
- Controls are at least 48 px tall. Inputs use 16 px text to avoid mobile browser auto-zoom.
- `FormField` connects label, description, error, `aria-invalid`, and `aria-describedby`.

## Display and feedback

- `Badge`, `StatusBadge`, `FacilityChip`, `Chip`, `Avatar`, `Divider`, `Surface`, `Card`.
- `AdminStatCard`, `ContributionListItem`, and `PlaceCard` are reusable presentation patterns.
- `Alert`, `InlineMessage`, `Toast`, `Spinner`, `Progress`, `Skeleton`, `EmptyState`, `ErrorState`.
- Status always includes text; skeletons are removed from the accessibility tree.

## Overlays and navigation

- `Dialog`, `AlertDialog`, `Sheet`, and `Tooltip` use Radix focus/keyboard primitives.
- `AppHeader`, `MobileBottomNavigation`, `AdminSidebar`, `AdminTopbar`, `Tabs`, `Breadcrumb`, and
  `Pagination`.
- Mobile and admin links use native anchors. Current items expose `aria-current="page"`.

## Layout

- `MobilePageShell` supports safe-area bottom clearance and a maximum 430 px content width.
- `AdminPageShell` switches from stacked navigation to the Figma 260 px sidebar at desktop width.
- `PageContainer`, `Stack`, `Inline`, `Grid`, `VisuallyHidden`, and `SkipLink` are intentionally small
  abstractions.

Do not add a component solely because a future phase might need it. Add it when a current Figma node
or accepted product requirement demonstrates a reusable pattern.
