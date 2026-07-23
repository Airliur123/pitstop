# Public Categories

`GET /api/v1/public/categories`

No query parameters are accepted. Results are ordered by `sortOrder ASC, id ASC`.

Fields: `id`, `code`, `name`, `description`, `isPrimary`, `sortOrder`, and derived
`supportsBudget`. `supportsBudget` is `true` only for `MAKAN_MURAH` and `NGOPI`; it is a typed
domain projection and does not require a database column.

The five allowed codes are `MAKAN_MURAH`, `NGOPI`, `TOILET`, `MUSALA`, and `ISTIRAHAT`.
Successful payloads use the common envelope. `meta.cache` is `MISS`, `HIT`, or `BYPASS`.

The endpoint uses the long category cache TTL (`CACHE_CATEGORIES_TTL_SECONDS`, default 300).
