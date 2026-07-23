# Geocoding Provider Abstraction

- **Status:** Accepted
- **Context:** Development and production providers may differ in limits, cost, and quality.
- **Decision:** Introduce a provider-neutral geocoding port in the relevant later phase.
- **Consequences:** Confidence, caching, throttling, and error semantics must be normalized.
- **Review conditions:** Review when the production provider and SLA are selected.
