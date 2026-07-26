# Place detail and directions

Detail continues to render only the verified public place contract. The photo treatment remains a
safe fallback because Phase 3 exposes no public media URL.

**Arahkan Sekarang** is now an external Google Maps action. Both Place Detail and place cards use
the same helper, which:

- validates the destination coordinates supplied by the verified place response;
- constructs an HTTPS Google Maps directions URL with `URL`/`URLSearchParams`;
- does not add current-user coordinates;
- opens a new tab with `rel="noopener noreferrer"`.

Google Maps is not an internal PitStop route and no navigation event logs precise user location.
