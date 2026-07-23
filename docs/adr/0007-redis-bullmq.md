# Redis and BullMQ

- **Status:** Accepted
- **Context:** Slow and retryable work must not block API requests.
- **Decision:** Use Redis, BullMQ, and a dedicated worker application.
- **Consequences:** Queue health, retry, dead-letter, idempotency, and replay policies are required later.
- **Review conditions:** Review if workload guarantees outgrow BullMQ or independent scaling is required.
