# Contribution API

All routes use `/api/v1`, require a valid session, return the standard success envelope or
`application/problem+json`, and set private no-store cache headers.

| Method  | Route                       | Purpose                                 |
| ------- | --------------------------- | --------------------------------------- |
| `POST`  | `/contributions`            | Create an owned server-side `DRAFT`     |
| `GET`   | `/contributions/:id`        | Read the canonical owned contribution   |
| `PATCH` | `/contributions/:id`        | Replace an owned `DRAFT` payload        |
| `POST`  | `/contributions/:id/submit` | Idempotently transition it to `PENDING` |

Create accepts `{ "payload": <optional draft> }`. Update accepts
`{ "expectedVersion": 1, "payload": <draft> }`. Submit accepts `{ "expectedVersion": 2 }`. Create
and submit require `Idempotency-Key`; every mutation requires an allowlisted Origin or Referer.

The response `data` contains `id`, `status`, `payload`, `version`, `createdAt`, `updatedAt`, and
nullable `submittedAt`. OpenAPI is served at `/api/openapi.json` and Swagger UI at `/api/docs` when
enabled.

Expected domain errors include:

| Status | Code                                  | Meaning                                     |
| ------ | ------------------------------------- | ------------------------------------------- |
| 400    | `VALIDATION_ERROR`                    | Request or strict payload validation failed |
| 400    | `IDEMPOTENCY_KEY_INVALID`             | Required key is absent or malformed         |
| 400    | `CONTRIBUTION_INCOMPLETE`             | Final submission fields are incomplete      |
| 401    | `AUTH_REQUIRED`                       | No active session                           |
| 403    | `CSRF_ORIGIN_INVALID`                 | Mutation origin cannot be trusted           |
| 404    | `CONTRIBUTION_NOT_FOUND`              | Missing or not owned                        |
| 409    | `CONTRIBUTION_INVALID_STATE`          | Contributor attempted a post-draft mutation |
| 409    | `CONTRIBUTION_VERSION_CONFLICT`       | Optimistic version is stale                 |
| 409    | `IDEMPOTENCY_KEY_REUSED`              | Same key was used for different input       |
| 429    | `CONTRIBUTION_RATE_LIMITED`           | Per-user operation limit was exceeded       |
| 503    | `CONTRIBUTION_RATE_LIMIT_UNAVAILABLE` | Redis could not enforce a mutation limit    |

See [the Phase 7 guide](../contributions/README.md) for payload rules, state transitions,
concurrency, storage, local testing, and deferred work.
