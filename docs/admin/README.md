# Admin Moderation

Phase 8 turns `apps/admin` into a private moderation application backed by the NestJS REST API. It
does not trust role state in the browser: every page reads the HttpOnly session on the server, and
every `/admin/*` API route independently applies `SessionAuthGuard` and the `ADMIN` role guard.

## Routes

| UI route                    | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `/login`                    | Request a one-time administrator magic link                        |
| `/auth/verify`              | Consume the token server-side and forward only the HttpOnly cookie |
| `/`                         | Queue totals and recent append-only moderation activity            |
| `/contributions`            | Filtered moderation queue with signed keyset pagination            |
| `/contributions/:id`        | Canonical payload, reviewer lease, verified location, and history  |
| `/integrations/google-form` | Redacted durable inbox and worker sync status                      |

The admin application uses `no-store` server reads and Zod-validates every successful API response.
Unauthenticated users are redirected to `/login`; authenticated `USER` accounts receive a safe
access-denied state and still receive a true `403` from the API if they call it directly.

Phase 9 adds duplicate-place hints to contribution detail and the Google Form sync page. Both are
additive moderation aids: they do not approve, reject, merge, or publish automatically. See the
[Google Form integration runbook](../integrations/google-form.md).

## Deliberate Phase 8 boundaries

- Approval and publication are separate. `APPROVED` stores a verified location and publication
  target but creates no public `Place`.
- `MERGE` is the only action that creates or updates an active, admin-verified `Place`.
- Place management, reports, bulk moderation, photos, geocoding, and contributor revision UI remain
  outside Phase 8.
- The connected Figma v1.1 file currently exposes only Cover and Design System Foundations. No
  admin moderation frames were available, so the accepted Phase 8 brief and existing semantic
  tokens/components define this implementation.

See [moderation-workflow.md](moderation-workflow.md), [security.md](security.md), and
[testing.md](testing.md).
