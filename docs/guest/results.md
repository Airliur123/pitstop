# Recommendations and results

`/places` memulihkan kategori, budget, dan sort dari URL yang sudah dinormalisasi. Request awal
memakai recommendation endpoint (`limit=4`) untuk primary, alternatif, atau typed fallback.

“Lihat semua” secara eksplisit membuka public places search dengan keyset pagination. Cursor
berikutnya berasal dari metadata API, tombol load-more terkunci saat request berlangsung, dan row
dideduplikasi berdasarkan ID sebagai pertahanan UI.

Query key mencakup endpoint, koordinat yang dinormalisasi lima desimal, radius, kategori, budget,
sort, limit, dan slug/cursor yang relevan. Request ID tidak menjadi cache key.

Jika fallback menyediakan `nearestPlace`, CTA dapat membuka detail tempat terdekat sambil tetap
menjelaskan bahwa hasil berada di luar radius normal.
