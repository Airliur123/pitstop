# Guest-first Authentication

- **Status:** Accepted
- **Context:** Search and navigation must not be blocked by account friction.
- **Decision:** Keep reads guest-accessible; require identity only for mutations and activity history.
- **Consequences:** Mutation endpoints need abuse controls, ownership checks, and secure sessions.
- **Review conditions:** Review if legal or abuse evidence requires a narrower guest surface.
