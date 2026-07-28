# PitStop API v1

Phase 3 exposes guest-readable REST resources under `/api/v1/public`:

| Method | Route                     | Purpose                                 |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/public/categories`      | MVP category master data                |
| GET    | `/public/places`          | Spatial, category, and budget search    |
| GET    | `/public/places/:slug`    | Canonical public detail                 |
| GET    | `/public/recommendations` | One primary plus at most 3 alternatives |

Phase 6 adds optional passwordless authentication under `/api/v1/auth`:

| Method | Route                 | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| POST   | `/auth/email/request` | Send a generic one-time-link response    |
| POST   | `/auth/email/verify`  | Atomically consume a link and set cookie |
| GET    | `/auth/session`       | Read minimal current session state       |
| POST   | `/auth/logout`        | Revoke and clear the current session     |

Phase 7 adds authenticated contribution drafts under `/api/v1/contributions`:

| Method | Route                       | Purpose                                |
| ------ | --------------------------- | -------------------------------------- |
| POST   | `/contributions`            | Create an owned idempotent draft       |
| GET    | `/contributions/:id`        | Read canonical owned state             |
| PATCH  | `/contributions/:id`        | Update a draft with optimistic version |
| POST   | `/contributions/:id/submit` | Idempotently transition to `PENDING`   |

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
non-deleted places. Authentication is optional and does not gate these reads. Contributions are
private proposals and never become public places in Phase 7. Upload, moderation, and asset URL
workflows are not implemented.

The Product Specification table uses `/categories`, `/places`, and `/places/recommendations`.
The accepted Phase 3 execution definition requires the explicit `/public/*` namespace, which is
used here to keep the guest security/rate-limit boundary unambiguous. This route difference is
documented rather than silently treated as equivalent.

See the endpoint, error, pagination, cache, rate-limit, OpenAPI, testing, and security documents in
this directory, plus [the Phase 6 authentication guide](../authentication/README.md) and
[contribution API guide](./contributions.md).
