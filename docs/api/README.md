# PitStop Public API v1

Phase 3 exposes guest-readable REST resources under `/api/v1/public`:

| Method | Route                     | Purpose                                 |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/public/categories`      | MVP category master data                |
| GET    | `/public/places`          | Spatial, category, and budget search    |
| GET    | `/public/places/:slug`    | Canonical public detail                 |
| GET    | `/public/recommendations` | One primary plus at most 3 alternatives |

Health remains at `/health/live` and `/health/ready`. Swagger UI is `/api/docs` and JSON is
`/api/openapi.json` when `API_SWAGGER_ENABLED=true`.

Success responses keep the specification envelope and add consistent metadata:

```json
{
  "success": true,
  "data": {},
  "requestId": "8e6c...",
  "meta": {
    "requestId": "8e6c...",
    "generatedAt": "2026-07-23T00:00:00.000Z"
  }
}
```

All sample names are Data Simulasi. Public queries expose only `ACTIVE`, `ADMIN_VERIFIED`,
non-deleted places. No Phase 4 UI, authentication, mutation, upload, or asset URL is implemented.

The Product Specification table uses `/categories`, `/places`, and `/places/recommendations`.
The accepted Phase 3 execution definition requires the explicit `/public/*` namespace, which is
used here to keep the guest security/rate-limit boundary unambiguous. This route difference is
documented rather than silently treated as equivalent.

See the endpoint, error, pagination, cache, rate-limit, OpenAPI, testing, and security documents in
this directory.
