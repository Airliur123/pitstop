# Privacy

Precise current coordinates are runtime input to the public recommendation/search request only.
They are not:

- stored in localStorage, cookies, IndexedDB, a guest server profile, or Redis;
- included in guest navigation/share URLs, Google Maps direction origins, analytics, telemetry, or
  application logs;
- shown as raw latitude/longitude;
- reused after refresh as proof that GPS is active.

Browser accuracy is retained only inside the active in-memory context and is not sent to the public
API. Manual search text is not logged. Manual results are visibly labelled as manual rather than
real-time GPS.

The TanStack Query cache is memory-only and short lived. Changing or retrying location cancels
active recommendation/place observers so a stale response cannot replace the new context.
Public place search and recommendation responses report `cache: BYPASS`; coordinate-derived
lookups never read or write the server-side Redis cache. Non-coordinate public reads such as
categories and place detail retain their normal cache behavior.

When the optional OpenStreetMap base layer is enabled, the browser necessarily exposes its IP,
referrer, and requested tile coordinates to that tile provider. PitStop sends no telemetry or
application location fields with the tile request. CI and privacy-sensitive environments can set
`NEXT_PUBLIC_MAP_TILES_DISABLED=true`; pins, the radius, and the accessible list remain available.
