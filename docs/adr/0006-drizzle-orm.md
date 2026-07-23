# Drizzle ORM

- **Status:** Accepted
- **Context:** Strict TypeScript and explicit spatial SQL are required.
- **Decision:** Use Drizzle ORM with mysql2; parameterize every raw SQL value.
- **Consequences:** Queries remain close to SQL and migrations require careful review.
- **Review conditions:** Review if a documented capability cannot be implemented safely.
