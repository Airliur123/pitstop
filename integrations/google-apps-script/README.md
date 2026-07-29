# PitStop Google Form integration

This spreadsheet-bound Apps Script forwards a Google Form response to PitStop's durable signed
integration endpoint. A `202 Accepted` response means only that PitStop committed the submission to
its MySQL inbox; it does not mean moderation, approval, merge, or publication has completed.

## Sheet columns

Use these exact Form/Sheet headings:

- Required: `Nama Tempat`, `Alamat`, `Wilayah/Area`, `Kategori`.
- Required only for `MAKAN_MURAH` and `NGOPI`: `Menu Utama/Termurah`, `Harga Termurah`,
  `Budget Maksimum`.
- Optional: `Patokan`, `Google Maps URL`, `Fasilitas`, `Jam Operasional`, `Catatan`,
  `Email Pengisi`, `Kisaran Harga Minimum`, `Kisaran Harga Maksimum`.
- The standard Form response `Timestamp` is used as `submittedAt`.

Do not add food-price questions for `TOILET`, `MUSALA`, or `ISTIRAHAT`. `Fasilitas` uses comma
separated `CODE:STATUS` values such as `PARKING:AVAILABLE,TOILET:UNKNOWN`. `Jam Operasional` is an
optional JSON array matching the canonical `dayOfWeek/isClosed/is24Hours/opensAt/closesAt` shape.

Rupiah cells accept only an integer number or the unambiguous text forms `12000`, `12.000`, and
`Rp 12.000` (case-insensitive). Negative values, decimals, commas or mixed separators, arbitrary
suffixes, spreadsheet formulas, and values above the backend limit are rejected instead of having
characters silently stripped. The shared accepted/rejected cases are in
`fixtures/rupiah-v1.json`; run `runPitStopRupiahParserSelfTest()` from the Apps Script editor after
copying a template update.

The script creates and owns three control columns:

- `PitStop Submission ID` stores a UUID once. This immutable value moves with the row and remains
  stable across retries; row number is never used as identity.
- `PitStop Sync Status` contains a formula-safe, non-sensitive transport status.
- `PitStop Sync At` records the last attempt time.

## Script Properties

In **Project Settings > Script Properties**, configure:

| Property                      | Example                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `PITSTOP_ENDPOINT`            | `https://api.example.com/api/v1/integrations/google-form/submissions` |
| `PITSTOP_SOURCE_ID`           | `google-form-main`                                                    |
| `PITSTOP_CURRENT_KEY_ID`      | `2026-07-v1`                                                          |
| `PITSTOP_HMAC_SECRET`         | Secret value from the deployment secret manager                       |
| `PITSTOP_MAX_ATTEMPTS`        | `5`                                                                   |
| `PITSTOP_INITIAL_BACKOFF_MS`  | `1000`                                                                |
| `PITSTOP_REQUEST_DEADLINE_MS` | `90000`                                                               |

Never paste the secret into `Code.gs`, a cell, documentation, source control, or logs.

Create an installable trigger for `onFormSubmit` using event source **From spreadsheet** and event
type **On form submit**. Authorize only the current spreadsheet and external-request scopes declared
by `appsscript.json`.

## Signature

Headers carry source ID, immutable submission ID, UTC ISO timestamp, lowercase hex HMAC, and key ID.
The signed message is:

```text
pitstop-google-form-v1
<source-id>
<external-submission-id>
<UTC timestamp>
<canonical JSON body>
```

Canonical JSON recursively sorts object keys, preserves array order, omits `undefined`, uses compact
JSON, and joins the five message parts with LF (`\n`). The HMAC algorithm is SHA-256.

For rotation, deploy the new API current key and old previous key first, then change both Script
Properties to the new key. Remove the API previous key after at least the configured replay window
and retry budget. The repository and database store key IDs only, never either secret or signatures.

## Retry and replay

Retry uses exponential backoff within a bounded execution deadline. Retryable HTTP/network failures
reuse the stable submission ID; the API accepts the same request hash without creating a second inbox
record or contribution. A changed body under the same ID is rejected.

Run `replayFailedRows()` manually for rows whose safe status starts with `GAGAL` or `RETRY`. Manual
replay is transport recovery, not moderation. Apps Script's URL Fetch timeout is platform-managed;
the template bounds the complete attempt sequence with `PITSTOP_REQUEST_DEADLINE_MS`.
