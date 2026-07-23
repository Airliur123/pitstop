# Public Recommendations

`GET /api/v1/public/recommendations`

Required coordinates use the same constraints as search. Category defaults to `MAKAN_MURAH`.
`budgetAmount` is required for `MAKAN_MURAH` and `NGOPI`. Radius defaults to 5000 m and cannot
exceed 5000 m. `limit` is 1-4 because the product contract is one primary plus at most three
alternatives.

Pipeline: active -> admin verified -> non-deleted -> category -> valid main item -> budget hard
filter -> opening status -> radius -> score -> deterministic ordering.

The Product Specification defines:

`score = .35 budgetFit + .30 distance + .20 open + .10 freshness + .05 community`.

It specifies distance and opening normalization but leaves the other component normalization
undefined. Phase 3 makes the missing definitions explicit:

- `budgetFit = max(0, 1 - qualifyingPrice / budget)`; non-budget categories receive a constant 1.
- `distance = max(0, 1 - distanceMeters / radiusMeters)`.
- `open`: open 1, closing within 60 minutes .55, unknown .35; closed is excluded.
- `freshness = max(0, 1 - ageDays / 90)`.
- `community = min(1, STILL_VALID confirmations / 5)`.

Scores are rounded to six decimals. Tie-breakers are distance ascending, qualifying price
ascending, freshness descending, then place ID ascending. Reasons are typed, not generated text.
Hours use Asia/Jakarta, split schedules, overnight intervals, 24-hour mode, and date exceptions.

Fallback precedence is `ALL_PLACES_CLOSED`, `BUDGET_TOO_LOW`, `OUTSIDE_RADIUS`,
`NO_CATEGORY_MATCH`, then `NO_VERIFIED_MATCH`. Fallback candidates never enter `data`.
Outside-radius lookup is bounded by `PUBLIC_FALLBACK_RADIUS_METERS` (default 10 km).
