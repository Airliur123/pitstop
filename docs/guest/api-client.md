# Public API client

`apps/web/lib/api/client.ts` memakai native `fetch` dan tipe dari `@pitstop/contracts` untuk:

- `GET /public/categories`;
- `GET /public/recommendations`;
- `GET /public/places`;
- `GET /public/places/:slug`.

Setiap respons diperiksa content type, JSON, dan runtime Zod schema sebelum dipakai UI. Respons
non-2xx dipetakan dari Problem Details ke `ApiProblem`, termasuk status, code, request ID, dan
`Retry-After`. Timeout dibatasi delapan detik dan `AbortSignal` dari TanStack Query diteruskan ke
fetch.

Base URL berasal dari `NEXT_PUBLIC_API_BASE_URL`, dinormalisasi tanpa trailing slash, dan tidak
boleh menunjuk localhost pada production. Client tidak mengimpor database/NestJS, tidak mencatat
koordinat, dan tidak melakukan ranking ulang. Guest Phase 5 mengunci request normal pada radius
5.000 meter. Accuracy browser dan label/alamat manual tidak dikirim. List dan map memakai cache
response recommendation yang sama.
