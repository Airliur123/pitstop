# Place detail

Detail mengambil satu resource dari `/public/places/:slug` dan hanya menampilkan field publik:
nama/kategori, menu tersedia, fasilitas, jam operasional, alamat, dan status verifikasi publik.

Foto memakai treatment fallback karena API Phase 3 belum memberikan media URL publik. UI tidak
membuat URL object storage palsu dan tidak menampilkan key internal. Slug malformed memakai Next.js
not-found; 404 API memakai state publik yang tidak membocorkan alasan internal.

CTA “Arahkan Sekarang” terlihat untuk kesetiaan hierarchy Figma tetapi nonaktif dan dijelaskan
untuk screen reader sebagai handoff Phase 5. Tidak ada peta atau Google Maps.
