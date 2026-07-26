# Location context

Phase 4 menyediakan abstraction bertipe `UNAVAILABLE` atau `READY`. State `READY` saat ini hanya
berasal dari source `DEVELOPMENT_PREVIEW`.

Fixture diaktifkan dengan:

- `NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED`;
- `NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE`;
- `NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE`;
- `NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL`.

Preview default-nya nonaktif dan konfigurasi menolak pengaktifannya pada production. UI selalu
menandainya sebagai **Data Simulasi**, tidak menampilkan koordinat mentah, dan tidak menyimpannya ke
storage atau URL. Browser permission dan `navigator.geolocation` sengaja belum digunakan.

Phase 5 dapat mengganti adapter ini dengan location provider resmi tanpa mengubah kontrak query UI.
