# Progressive Web App

- **Status:** Accepted
- **Context:** The driver experience is mobile-first and networks can be unreliable.
- **Decision:** Use Serwist for the PWA implementation in its scheduled later phase.
- **Consequences:** Cache rules must exclude tokens, admin data, personal data, and presigned URLs.
- **Review conditions:** Review if browser support or service-worker safety requirements change.
