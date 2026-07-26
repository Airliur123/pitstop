# Fallback and error states

Recommendation fallback mapping remains typed and server-authored:

| API reason          | UI behaviour                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `BUDGET_TOO_LOW`    | Explain the minimum valid main-meal price when provided              |
| `OUTSIDE_RADIUS`    | Show actual distance, keep the candidate separate, require opt-in    |
| `ALL_PLACES_CLOSED` | Explain closed matches and offer an explicit next action             |
| `NO_CATEGORY_MATCH` | Explain that the category has no verified match in the normal radius |
| `NO_VERIFIED_MATCH` | Explain that verified data is not available                          |

Location fallbacks are separate from API fallbacks: permission denied, position unavailable,
bounded timeout, retrying, and manual invalid each have a heading, live status, and keyboard
accessible recovery actions. A stale or invalid location is never silently replaced with the old
development fixture.
