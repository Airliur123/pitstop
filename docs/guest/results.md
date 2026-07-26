# Recommendations, list, and map

`/places` restores only public state from the URL: category, an allowed budget, sort, and
`view=list|map`. Location comes from the in-memory provider. A refresh without provider state asks
for location again and never assumes GPS is active.

The recommendation request returns one primary and at most three alternatives. Normal list and
map results always use the same response, filters, active location, and 5,000 metre radius.
Switching views changes only the safe `view` URL value.

List is the primary and accessible presentation. Map is loaded client-side and integrates Leaflet
directly through imperative effects and refs. It exposes keyboard-capable pins and is accompanied by
the result list and selected-place summary. Center/radius, tile, marker, popup, and event-listener
lifecycles clean up before replacement and the map instance is removed on unmount. Tile loading can
fail or be disabled without removing the list. CI disables external tiles and still exercises map
selection deterministically.

“Lihat semua” remains an explicit public-place search with cursor pagination. An `OUTSIDE_RADIUS`
candidate is never inserted into normal results; the fallback shows actual distance and requires
**Lihat kandidat di luar radius** before opening the candidate.
