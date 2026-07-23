# Separate Web and Admin Applications

- **Status:** Accepted
- **Context:** Public driver workflows and privileged moderation have different security boundaries.
- **Decision:** Keep `apps/web` and `apps/admin` as independently built applications.
- **Consequences:** Shared packages reduce duplication; configuration and role isolation remain explicit.
- **Review conditions:** Review only if independent applications create proven unsustainable overhead.
