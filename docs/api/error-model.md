# Error Model

Errors use `application/problem+json` and are a compatibility superset of RFC 7807 and the Product
Specification envelope:

```json
{
  "success": false,
  "error": { "code": "INVALID_RADIUS", "message": "One or more request values are invalid." },
  "requestId": "8e6c...",
  "type": "https://pitstop.local/problems/invalid-radius",
  "title": "Invalid request",
  "status": 400,
  "code": "INVALID_RADIUS",
  "detail": "One or more request values are invalid.",
  "instance": "/api/v1/public/places",
  "validationErrors": [{ "field": "radiusMeters", "message": "..." }]
}
```

Codes include `VALIDATION_ERROR`, `INVALID_COORDINATE`, `INVALID_RADIUS`, `INVALID_BUDGET`,
`INVALID_CURSOR`, `CATEGORY_NOT_FOUND`, `PLACE_NOT_FOUND`, `RATE_LIMITED`,
`DATABASE_UNAVAILABLE`, and `INTERNAL_ERROR`. Validation is 400, missing public detail 404, rate
limit 429, dependency outage 503, and unexpected failure 500. Responses never contain stack traces,
SQL, parameters, or credentials. `instance` excludes the query string so precise location is not
reflected.
