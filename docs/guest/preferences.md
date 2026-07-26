# Guest preferences

Budget terakhir disimpan dalam satu record versioned:

```text
pitstop.guest.preferences.v1
```

Payload hanya berisi `version: 1` dan `budgetAmount` integer rupiah. Batas maksimum mengikuti
kontrak frontend 10.000.000. JSON korup, shape tidak sah, dan versi yang tidak didukung dihapus
secara aman. Jika localStorage ditolak browser, aplikasi tetap berjalan dengan default konservatif
Rp15.000.

Hook memakai external-store subscription agar SSR/hydration stabil dan perubahan antar-tab dapat
terbaca melalui event storage. Kategori dan koordinat tidak dipersistenkan.
