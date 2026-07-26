# Accessibility

Phase 5 continues to target WCAG 2.2 AA:

- location progress and transitions use understandable live status;
- denied, unavailable, timeout, invalid, and map-error states have headings and actions;
- permission starts only from a visible native button;
- manual results are keyboard navigable and selection is not communicated by colour alone;
- focus moves to the manual search field or invalid-state heading after the view transition;
- retry and change-location controls have explicit accessible names;
- map pins are keyboard enabled, but the result list remains the authoritative alternative;
- all controls retain the Design System 48 px target, focus ring, contrast tokens, and
  reduced-motion behaviour.

Browser E2E runs axe against the new granted/manual/map flows and asserts that the map does not
remove list access.
