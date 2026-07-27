# Security engineering notes

See the root `SECURITY.md`. Phase 0 establishes environment isolation, redacted structured logging,
CORS allowlisting, secure headers, parameterized database access, and non-public local service binds.

Phase 6 adds passwordless one-time links, server-side session revocation, HttpOnly SameSite cookies,
Origin/Referer CSRF checks for authenticated mutations, keyed token/IP/email hashes, auth-specific
Redis fail-closed limits, no-store responses, and expanded structured-log redaction. See
[the authentication security and lifecycle guide](../authentication/README.md).
