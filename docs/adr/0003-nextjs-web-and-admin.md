# Next.js for Web and Admin

- **Status:** Accepted
- **Context:** Driver and moderator experiences have distinct UX and delivery needs.
- **Decision:** Use Next.js App Router for both applications in the monorepo.
- **Consequences:** Framework knowledge and packages are shared while builds remain independent.
- **Review conditions:** Review if either application no longer benefits from server-capable React.
