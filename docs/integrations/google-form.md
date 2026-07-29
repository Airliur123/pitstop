# Google Form ingestion

Phase 9 connects a manually managed Google Form to PitStop without granting Google access to the
database or Redis:

```text
Google Form -> Google Sheets -> Apps Script -> signed POST
            -> google_form_submissions -> BullMQ reconciliation
            -> PENDING contribution -> geocoding -> duplicate hints -> moderation
```

`202 Accepted` means the submission is committed to the MySQL inbox. It does not mean geocoding,
moderation, approval, merge, or publication has completed.

## Form and Sheet mapping

The Form does not ask for latitude or longitude.

| Canonical field       | Form answer                                                | Required  |
| --------------------- | ---------------------------------------------------------- | --------- |
| `placeName`           | Nama tempat                                                | yes       |
| `address`             | Alamat                                                     | yes       |
| `area`                | Wilayah/area                                               | yes       |
| `category`            | `MAKAN_MURAH`, `NGOPI`, `TOILET`, `MUSALA`, or `ISTIRAHAT` | yes       |
| `landmark`            | Patokan                                                    | no        |
| `mapUrl`              | Full allowlisted Google Maps URL                           | no        |
| `facilities`          | Facility answers mapped to explicit statuses               | no        |
| `openingHours`        | Structured operating-hour answers                          | no        |
| `notes`               | Catatan                                                    | no        |
| `submitterEmail`      | Email pengisi                                              | no        |
| `cheapestMenuName`    | Nama menu utama/termurah                                   | food only |
| `cheapestMenuPrice`   | Harga integer rupiah                                       | food only |
| `priceRange`          | Kisaran harga                                              | no        |
| `maximumUsefulBudget` | Budget maksimum relevan                                    | food only |

“Food only” means `MAKAN_MURAH` and `NGOPI`. Pricing fields are rejected for `TOILET`, `MUSALA`,
and `ISTIRAHAT`. Empty Sheet cells become absent optional values. Formula-like text, unsafe control
characters, unknown fields, floats used as rupiah, and non-allowlisted Maps URLs are rejected.
Source metadata and contribution status are server-generated; a submitter email never creates or
links an account.

The template and detailed column mapping live in
[`integrations/google-apps-script`](../../integrations/google-apps-script/README.md).

## Apps Script configuration

Install `Code.gs` and `appsscript.json` in a script bound to the response Sheet. Configure Script
Properties; never paste secrets into source or cells:

- `PITSTOP_ENDPOINT`
- `PITSTOP_SOURCE_ID`
- `PITSTOP_CURRENT_KEY_ID`
- `PITSTOP_HMAC_SECRET`
- `PITSTOP_STATUS_COLUMN`
- optional mapping and retry properties described by the template README

Create the installable form-submit trigger after saving the properties. The template persists a UUID
in a protected control column as the external submission ID, never the mutable row number. Retries
and manual replay reuse that UUID, apply exponential backoff, respect a bounded deadline, and write
formula-safe status text only.

## Signed endpoint

`POST /api/v1/integrations/google-form/submissions` is intentionally not session or
cookie-authenticated. It requires `application/json` and:

- `X-PitStop-Source`
- `X-PitStop-Submission-Id`
- `X-PitStop-Timestamp`
- `X-PitStop-Signature`
- optional `X-PitStop-Key-Id`

The HMAC message is UTF-8 text with newline separators:

```text
pitstop-google-form-v1
{source id}
{external submission id}
{UTC timestamp}
{canonical JSON body}
```

Canonical JSON recursively sorts object keys, preserves array order, omits JavaScript `undefined`,
and uses JSON scalar encoding without extra whitespace. The signature is lowercase hex
HMAC-SHA256. The API validates header shapes, known/enabled source, replay window, body size, media
type, and the signature using a constant-time byte comparison before accepting the business
payload.

Current and optional previous secrets come only from environment variables or the deployment secret
manager. Database rows retain key identifiers and policies, never key material. During rotation:

1. configure the new current key and retain the old key as previous;
2. deploy the API;
3. update Apps Script properties to the new current key;
4. observe that the old key is no longer used;
5. remove the previous key after the maximum retry and replay window has passed.

Requests outside `GOOGLE_FORM_REPLAY_WINDOW_SECONDS` are rejected. A retry with the same source,
external ID, and body returns a safe accepted duplicate result. Reusing the identity with a changed
body returns `409` and does not replace the stored record.

## Durable inbox and queue recovery

MySQL is the source of truth. The API commits `google_form_submissions` before returning 202 and
does not depend on Redis admission. The unique key `(integration_source_id,
external_submission_id)` provides inbox idempotency.

The worker periodically reconciles durable states with `pitstop-integration`. A Redis outage delays
work but cannot lose an accepted submission. Deterministic BullMQ job IDs make enqueue retries safe.
Stale `QUEUED` rows and unfinished downstream stages are rediscovered. Delivery is at least once;
database locks, status transitions, the inbox-to-contribution link, and unique geocoding/hint keys
make effects idempotent.

Inbox states are `RECEIVED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `RETRYABLE_FAILURE`,
`DEAD_LETTER`, and `REJECTED_INVALID`. Geocoding and duplicate detection each have a stage status.
Attempts and safe error class/code are retained without raw exceptions or credentials.

## Worker jobs

Jobs carry inbox/correlation/request identifiers and an idempotency key; payload and optional email
remain in MySQL.

1. `process-google-form-submission` locks and revalidates the canonical inbox row, creates at most
   one `GOOGLE_FORM` contribution with `submitted_by = NULL` and `PENDING`, links it, commits, and
   schedules geocoding.
2. `geocode-contribution` sends address, area, and optional landmark through `GeocodingPort`. A full
   allowlisted Maps URL may be parsed locally; arbitrary Maps URLs are never fetched. Low confidence
   and failure leave the contribution pending and unpublished.
3. `detect-duplicate-place` performs a category- and distance-bounded spatial query and scores
   normalized name/address signals. Results are moderator hints only; no automatic reject, merge,
   approval, or Place mutation occurs.

Production may use the configured Nominatim adapter with its required User-Agent and timeout.
Development and tests use the deterministic adapter and never access the internet.

Jobs use five attempts, exponential backoff, and a 30-second configured timeout. Permanent
validation errors are not retried. Exhausted work is `DEAD_LETTER` and copied to
`pitstop-integration-dlq` with identifiers and safe error metadata only.

## Replay and administration

The ADMIN-only page `/integrations/google-form` displays recent received, pending, completed, and
dead-letter counts, last successful sync, redacted rows, and safe error codes. Its API resources are:

- `GET /api/v1/admin/integrations/google-form/status`
- `GET /api/v1/admin/integrations/google-form/submissions`
- `GET /api/v1/admin/integrations/google-form/submissions/:id`
- `POST /api/v1/admin/integrations/google-form/submissions/:id/replay`

Reads require an authenticated ADMIN and are private/no-store. Replay additionally requires
same-origin CSRF and is rate limited. It resets an eligible failed inbox for the reconciler, records
an audit event, and never clears `contribution_id`; replay cannot create a second contribution.
There is no endpoint or UI for reading or replacing secrets.

## Security, privacy, retention, and observability

Inbound limits are scoped by source and IP; admin limits are scoped by administrator. Logs redact
signature/key headers and submitter email and never include canonical payloads, precise coordinates,
provider credentials, or raw signatures. Structured worker events include request/correlation IDs,
inbox ID, job, attempt, transition/status, duration, safe error class, and contribution ID.

The optional email is contact data, not identity. Admin lists mask it and detail exposes only a
bounded canonical summary. Production operations must:

- delete or irreversibly redact completed/rejected inbox payloads and optional email after 90 days
  unless an active moderation or legal hold applies;
- retain safe status, identifiers, request hash, processing timestamps, and audit events for 365
  days for reliability analysis;
- retain only the bounded geocoder summary and purge it with the inbox payload;
- follow the existing contribution/moderation policy for the linked contribution;
- never copy spreadsheet credentials, secrets, or signatures into retention stores.

Status counts and structured events provide received, signature/replay rejection, processing
success/failure, pending/retry/DLQ depth, geocoding outcome, and duplicate-hint observability.
Deployment monitoring should derive counters and alerts from these events and the admin status.

## Local validation

Start the existing MySQL, Redis, Mailpit, API, admin, and worker services, configure placeholder
secrets in an untracked `.env`, and use
`integrations/google-apps-script/fixtures/hmac-v1.json`.

```bash
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm db:test
pnpm test:api:integration
pnpm test:worker:integration
pnpm test:e2e
```

The API and Playwright suites include a local signed client. Fixtures use no Google Cloud project,
production Sheet, or internet geocoder.

## Production checklist

- provision current HMAC material in the API secret manager and matching Script Properties;
- use a stable source/key ID, enable the source explicitly, and document the rotation owner;
- set a public HTTPS endpoint, replay window, source/IP rate limits, and body limit;
- run migrations before API/worker rollout and verify the reconciliation interval;
- configure a compliant geocoder, User-Agent, timeout, confidence threshold, and egress policy;
- alert on signature/replay rejection, growing pending/retry depth, and DLQ entries;
- verify log redaction and the payload/geocoder retention job in the deployment platform;
- install the Apps Script trigger and test one non-production row plus duplicate retry;
- confirm the admin status page and moderation hint are ADMIN-only.

Phase 9 does not create Forms through an API, deploy Apps Script into production, create contributor
accounts, approve/publish/merge automatically, expose general Place CRUD, or implement later-phase
notifications, reports, photos, or bulk moderation.
