# Testing

## Unit dan component

Vitest/React Testing Library mencakup format rupiah/jarak, URL/query-key normalization, storage
valid dan rusak, storage denied, hydration preference, API response validation, Problem Details,
Retry-After, seluruh typed fallback, serta network retry action.

## Integration

Test database dan API Phase 1–3 tetap menjadi regression suite. Guest E2E menjalankan MySQL/Redis,
migration, seed existing, API, dan web. Full E2E tidak mengganti API dengan hardcoded response.
Network interruption hanya disimulasikan untuk memverifikasi recovery UI.

Viewport regression: 320×568, 360×800, 390×844, 430×932, 768×1024, dan 1280×800. Skenario inti
guest berjalan pada project 390 px dengan fixture Kalideres yang memakai tempat seed 24 jam;
matriks lain menjalankan shell, accessibility, dan overflow suite.
