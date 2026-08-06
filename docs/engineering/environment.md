# Environment configuration

Copy the template once from the repository root:

```bash
cp .env.example .env
```

Keys with defaults remain listed so local behavior is explicit. Every `NEXT_PUBLIC_*` value is
browser-visible: API base URL, non-sensitive map/PWA flags and allowlists, UI-catalog/preview
controls, and the disabled-by-default client-observability adapter path. Database, Redis,
object-storage credentials, trusted-proxy configuration, release controls, internal endpoints, and
mail configuration are server-only and must never be prefixed with `NEXT_PUBLIC_` or imported into
browser modules.

`packages/config` validates each application separately with Zod and fails startup/build with field-
specific errors. `.env` is ignored by Git. Confirm this with `git status --ignored` after setup.

The root `pnpm build` command loads `.env` before Next.js sets its compilation environment. A local
development profile builds with HTTPS `.invalid` web, admin, and API origins so the result can check
production compilation and headers without producing a deployable localhost artifact. A production
build must set `NODE_ENV=production` and the real validated public origins externally; those values
take precedence and are never replaced by the local-build fallback.

Normal development keeps `NEXT_PUBLIC_PWA_ENABLED=false`. Controlled local PWA tests set both
`NEXT_PUBLIC_PWA_ENABLED=true` and `NEXT_PUBLIC_PWA_TEST_MODE=true`; production enables the PWA
without test mode. `METRICS_ENABLED=false` keeps the ADMIN metrics endpoint absent, while worker
heartbeat remains enabled and expires from Redis according to its bounded interval/TTL.

`TRUST_PROXY=false` is the safe local default. Production may enable it only together with an
explicit `TRUST_PROXY_CIDRS` list for the directly connected reverse proxy. Never use an unbounded
boolean trust setting or copy public client networks into this list.

`PUBLIC_CURSOR_SIGNING_SECRET` is required in production and must contain at least 32 UTF-8 bytes.
Store it in the deployment secret manager, not Git. Development may omit the variable; the API then
uses a process-local random secret, so public search cursors are intentionally invalid after restart.

For shared development, replace template passwords with unique local credentials. Rotate a credential
by stopping dependent services, changing `.env`, updating or recreating the local service credential,
then restarting applications. If a credential is disclosed or committed, revoke it first and remove it
from history using the repository owner's approved incident process.
