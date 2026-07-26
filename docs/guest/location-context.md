# Location context

`apps/web/lib/location.ts` defines a discriminated state machine instead of independent booleans.
It covers permission not requested/granted/denied, requesting, unavailable, timeout, retrying,
manual selection, manual invalid, and active current/manual locations.

An active context contains:

- source `CURRENT` or `MANUAL`;
- latitude and longitude;
- a human-readable label;
- active status;
- browser accuracy when supplied;
- an internal timestamp and stable query key.

The provider requests `navigator.geolocation` only after a visible user action. Requests have a
bounded timeout and monotonically increasing attempt ID. Callbacks from an older attempt are
ignored, and recommendation/place queries are cancelled when location becomes inactive or
changes.

Manual location uses a provider-neutral `ManualLocationResolver`. The Phase 5 adapter is a local,
deterministic catalogue matching the approved Figma areas: Tambora, Grogol Petamburan, Kalideres,
and Cengkareng. It performs no third-party browser request and contains no secret. Search supports
typed `NOT_FOUND`, `TOO_BROAD`, `INVALID_FORMAT`, and `UNUSABLE_RESULT` errors. An invalid result is
never activated or sent to recommendations.

The old development fixture remains available only when its explicit environment flag is enabled
outside production. It is not a production fallback.
