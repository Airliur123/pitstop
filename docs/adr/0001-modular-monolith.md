# Modular Monolith

- **Status:** Accepted
- **Context:** MVP domains are evolving and need simple cross-domain transactions.
- **Decision:** Use a domain-oriented modular monolith plus one dedicated background worker.
- **Consequences:** Delivery and transactions stay simple; module dependencies must remain explicit.
- **Review conditions:** Review when a module demonstrably needs independent deployment or scaling.
