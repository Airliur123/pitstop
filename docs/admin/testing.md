# Admin Testing

Phase 8 coverage is split by boundary:

- validation tests cover strict filters, dates, reason bounds/markup, verified coordinates,
  publication targets, and accepted state transitions;
- API unit tests cover cursor signing/tampering, conflict-to-Problem-Details mapping, canonical
  payload rejection, idempotent inputs, and post-commit cache invalidation;
- admin component tests cover status-valid actions, reviewer protection, accessible reason errors,
  optimistic version submission, idempotency keys, and explicit publication confirmation;
- MySQL/Redis/Mailpit API integration covers 401/403, admin CSRF, queue search, claim/reclaim,
  optimistic conflict, approval without Place creation, transactional merge, audit history,
  exact replay, double merge, and public Place visibility;
- Playwright covers the administrator magic-link session, queue/detail workflow, Escape/focus
  restoration, approval, explicit publish warning, and serious/critical axe findings.

Run:

```bash
pnpm test
pnpm db:test
pnpm test:api:integration
pnpm test:e2e --project=admin-desktop-1280
```

The browser and integration suites require the local MySQL, Redis, and Mailpit services.
