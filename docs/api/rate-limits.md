# Public Rate Limits

Rate limiting uses a Redis fixed window keyed by SHA-256 of the direct client IP. The default window
is 60 seconds, with 60 public reads and 30 recommendation reads. Configure with
`PUBLIC_RATE_LIMIT_WINDOW_SECONDS`, `PUBLIC_RATE_LIMIT_MAX`, and
`RECOMMENDATION_RATE_LIMIT_MAX`.

`TRUST_PROXY=false` by default, so forwarded IP headers are not trusted without explicit deployment
configuration. Health endpoints are excluded. Successful responses include limit, remaining, and
reset headers. Exceeded limits return 429 Problem Details and `Retry-After`.

Redis outage is fail-open so a cache/rate-limit dependency cannot turn public reads into 500s. This
is not authentication or a substitute for upstream abuse protection.
