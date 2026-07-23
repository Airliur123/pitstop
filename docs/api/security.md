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

Public GET access is Guest First, not an authorization bypass for mutation. Phase 3 exposes no
write, auth, admin, contribution, report, upload, or integration routes.
