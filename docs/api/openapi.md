# OpenAPI

Controllers are the runtime source for OpenAPI operation IDs, tags, query constraints, descriptions,
success responses, and documented error statuses.

Set `API_SWAGGER_ENABLED=true` to expose:

- Swagger UI: `/api/docs`;
- JSON: `/api/openapi.json`.

The default is disabled unless explicitly configured; `.env.example` enables it for local
development. Production must opt in. No secret is required.

The API integration contract test asserts that JSON contains categories, places search, slug detail,
and recommendation routes. The document is generated deterministically from the current controllers;
no generated artifact is tracked.
