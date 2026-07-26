# Testing

Unit/component coverage includes:

- every location state and active source;
- timeout, retry, and stale geolocation callback rejection;
- deterministic manual resolver results and typed invalid errors;
- no recommendation before active location;
- fixed 5,000 metre requests and stable query keys;
- URL privacy and invalid-budget rejection;
- outside-radius separation and explicit action;
- list/map state preservation and map failure with list fallback;
- imperative Leaflet instance/layer/listener cleanup, Strict Mode remounts, and popup reselection;
- shared Google Maps destination helper without user-origin coordinates.

Playwright uses browser-context geolocation/permissions for granted and denied flows. Retry uses a
deterministic browser adapter so an old callback can be delivered after the successful retry.
Manual resolution and map rendering never depend on external geocoding, GPS, or map tiles in CI.

The Phase 5 browser matrix covers granted, denied, retry, manual valid, manual invalid, list/map,
outside-radius, directions, keyboard/focus, and serious/critical axe violations.
