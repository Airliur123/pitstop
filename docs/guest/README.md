# Guest mobile vertical slice

Phase 4 menghubungkan Design System Phase 2 dan Public API Phase 3 untuk alur tamu:

`Home → kategori → budget bila didukung → satu preview → Recommendations → Place Detail`.

Implementasi berada di `apps/web`, tanpa login. Data kategori, rekomendasi, daftar tempat, dan
detail selalu berasal dari Public API. Koordinat yang dipakai untuk development/E2E adalah fixture
berlabel **Data Simulasi** dan tidak disimpan.

## Batas Phase 4

- Radius tetap 5 km.
- Tidak ada geolocation browser production, input lokasi manual, peta, kontribusi, aktivitas,
  login, moderasi, atau navigasi eksternal.
- Tombol arah pada detail sengaja nonaktif sampai Phase 5.
- Bottom navigation hanya foundation visual dari Design System; flow selain Home belum
  diimplementasikan.

Dokumen lain di folder ini menjelaskan route, kontrak, state, privacy, testing, dan handoff Phase 5.
