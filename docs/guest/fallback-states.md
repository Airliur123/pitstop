# Fallback and error states

Mapping mengikuti enum kontrak API, tanpa inferensi ranking di frontend:

| API reason          | Judul UI                     |
| ------------------- | ---------------------------- |
| `BUDGET_TOO_LOW`    | Belum ada yang sesuai budget |
| `OUTSIDE_RADIUS`    | Hasil berada di luar radius  |
| `ALL_PLACES_CLOSED` | Semua tempat sedang tutup    |
| `NO_CATEGORY_MATCH` | Kategori belum tersedia      |
| `NO_VERIFIED_MATCH` | Belum ada data terverifikasi |

Nilai tambahan seperti minimum budget dan jarak terdekat hanya ditampilkan bila diberikan API.
Network/5xx memakai retry terbatas. 400/404 tidak di-retry, sedangkan 429 dapat di-retry maksimal
dua kali dan menghormati `Retry-After` sampai 30 detik. Request ID hanya muncul pada error UI untuk
dukungan operasional.

Loading awal, load-more, empty, not-found, dan error memiliki treatment terpisah.
