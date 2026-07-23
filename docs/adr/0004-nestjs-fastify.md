# NestJS with Fastify

- **Status:** Accepted
- **Context:** The API needs module boundaries, dependency injection, and efficient HTTP handling.
- **Decision:** Use NestJS with the Fastify adapter and avoid Express-only middleware.
- **Consequences:** Nest modules provide structure; plugins must be Fastify compatible.
- **Review conditions:** Review only on a measured compatibility or performance blocker.
