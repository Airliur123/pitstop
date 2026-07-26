# Guest location, map, radius, and directions

Phase 5 extends the guest vertical slice into:

`Location consent/manual area → Home → Recommendations list/map → Place Detail → Google Maps`.

The browser location context lives only in the client provider. It is never copied into a guest
navigation/share URL, local storage, logs, or a guest server profile. A refresh therefore returns
honestly to the permission-not-requested state. Manual area selection uses the deterministic
supported-area resolver described in `location-context.md`.

The normal recommendation radius is always 5,000 metres. List and map share the same API response
and filters. A candidate beyond five kilometres remains fallback metadata until the guest chooses
the explicit **Lihat kandidat di luar radius** action.

Phase 5 does not add authentication, contribution, activity, admin workflows, background
geolocation, location history, or deployment work.
