# Development component catalog

Catalog routes:

- Web: `http://localhost:3000/dev/ui`
- Admin: `http://localhost:3001/dev/ui`

They return 404 unless the explicit public development flag is enabled:

```bash
NEXT_PUBLIC_ENABLE_UI_CATALOG=true pnpm --filter @pitstop/web dev
NEXT_PUBLIC_ENABLE_UI_CATALOG=true pnpm --filter @pitstop/admin dev
```

The default in `.env.example` is `false`. The routes are absent from production navigation, need no
API or database, persist nothing, and display no secrets. All business-looking content is marked
**UI Preview** or **Data Simulasi**.

The web catalog demonstrates actions, form states, React Hook Form with Zod validation, display/status
variants, loading/empty/error feedback, overlays, and Tabs. The admin catalog demonstrates responsive
navigation, stat tones, and contribution list states.
