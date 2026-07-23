# Environment configuration

Copy the template once from the repository root:

```bash
cp .env.example .env
```

All listed keys are required. `NEXT_PUBLIC_API_BASE_URL` is the only browser-exposed key. Database,
Redis, object-storage credentials, internal endpoints, and mail configuration are server-only and
must never be prefixed with `NEXT_PUBLIC_` or imported into browser modules.

`packages/config` validates each application separately with Zod and fails startup/build with field-
specific errors. `.env` is ignored by Git. Confirm this with `git status --ignored` after setup.

`PUBLIC_CURSOR_SIGNING_SECRET` is required in production and must contain at least 32 UTF-8 bytes.
Store it in the deployment secret manager, not Git. Development may omit the variable; the API then
uses a process-local random secret, so public search cursors are intentionally invalid after restart.

For shared development, replace template passwords with unique local credentials. Rotate a credential
by stopping dependent services, changing `.env`, updating or recreating the local service credential,
then restarting applications. If a credential is disclosed or committed, revoke it first and remove it
from history using the repository owner's approved incident process.
