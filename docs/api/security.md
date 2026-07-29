# Public API Security and Privacy

- Zod strict objects allowlist query fields and reject duplicates represented as arrays.
- Decimal/integer parsers reject NaN, Infinity, exponent notation, floats for money, and extreme
  coordinate/radius/budget/limit values.
- Category and sort are enums. Cursor contents are HMAC-SHA256 authenticated, query-bound, validated,
  and never become SQL fragments. Signature verification uses constant-time comparison.
- All SQL values use mysql2 placeholder bindings. Dynamic order clauses come only from server
  allowlists.
- Public projection requires active, admin-verified, non-deleted rows and omits internal fields.
- Helmet supplies secure headers. CORS is a validated allowlist; wildcard credential reflection is
  not used.
- Request body and URL length are bounded. Client request IDs accept only a 128-character safe
  alphabet.
- Logs redact authorization, cookies, tokens, passwords, and integration signatures. Request
  serialization removes query strings, so precise coordinates are not logged.
- Cache keys hash normalized location input. Application responses do not retain location history.
- Error responses omit stacks, SQL, and database details.

Public GET access is Guest First, not an authorization bypass for mutation. Phase 7 contribution
routes use session ownership filters, Origin/Referer CSRF checks, optimistic versions, idempotency,
strict payload validation, private no-store responses, contributor-data log redaction, and
fail-closed Redis mutation limits. See [contributions.md](./contributions.md).

The Google Form ingress is a non-cookie integration boundary: HMAC-SHA256 authenticates canonical
body, UTC timestamp, external submission ID, and source ID. It has a bounded replay window,
current/previous source-scoped keys, constant-time comparison, JSON/body limits, and source/IP
fail-closed rate limiting. It neither uses Origin as authentication nor applies session CSRF.
ADMIN integration reads/replay remain cookie-authenticated with RBAC, and replay additionally uses
the existing Origin/Referer CSRF guard. Secrets, signatures, payloads, optional email, and precise
geocoding results are excluded or redacted from logs. See
[the integration runbook](../integrations/google-form.md).
