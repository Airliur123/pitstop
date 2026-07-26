# Routes

| Route            | State yang dapat dibagikan   | Keterangan                                                |
| ---------------- | ---------------------------- | --------------------------------------------------------- |
| `/`              | Tidak ada                    | Home kontekstual, kategori, budget, maksimal satu preview |
| `/places`        | `category`, `budget`, `sort` | Rekomendasi utama, alternatif, dan opt-in daftar lengkap  |
| `/places/[slug]` | Slug publik                  | Detail tempat aktif dan terverifikasi                     |

Koordinat tidak pernah dimasukkan ke URL. Query malformed dinormalisasi konservatif:
`MAKAN_MURAH`, `NEAREST`, dan budget Rp15.000 untuk kategori yang memerlukan budget. Slug dengan
format tidak sah menuju not-found; 404 API mendapat state “Tempat tidak ditemukan”.

Deep link dan refresh didukung. Cursor pagination hanya berada di state TanStack Query karena
bukan state UX yang perlu dibagikan pada Phase 4.
