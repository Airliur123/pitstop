# Security policy

## Reporting

This project has not yet published a public disclosure address. Do not open a public issue containing
an exploitable vulnerability or secret. Contact the project owner privately and include affected
versions, impact, reproduction steps, and a proposed mitigation when available.

## Secrets and development data

- Store secrets in environment variables or an approved secret manager; never commit `.env`.
- Rotate a credential immediately if it appears in source, logs, screenshots, or CI output.
- Use only synthetic/local data in development. Production personal data is prohibited locally.
- Pino redaction must cover authorization, cookies, passwords, tokens, and integration signatures.

## Dependency reports

Report critical dependency or container findings promptly with package/image version, advisory, and a
compatible remediation. Do not apply unrelated major upgrades solely to silence a warning.

## Administration expectations

Future admin routes require explicit ADMIN authorization, least privilege, secure sessions, CSRF
defense for cookie mutations, rate limiting, and auditable decisions. Phase 0 deliberately implements
none of the authentication or administration domain.
