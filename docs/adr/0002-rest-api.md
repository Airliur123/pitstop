# REST API

- **Status:** Accepted
- **Context:** Web, admin, worker, and future integrations need one observable contract.
- **Decision:** Provide versioned REST resources under `/api/v1` with OpenAPI documentation.
- **Consequences:** Resource semantics and caching are straightforward; aggregate queries require care.
- **Review conditions:** Review if required aggregate workflows cannot be served efficiently.
