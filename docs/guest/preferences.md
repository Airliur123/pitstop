# Guest preferences

Budget terakhir disimpan dalam satu record versioned:

```text
pitstop.guest.preferences.v1
```

Payload hanya berisi `version: 1` dan `budgetAmount`, yang harus bernilai `null` atau salah satu
preset resmi: 10.000, 15.000, 20.000, dan 25.000. JSON korup, nominal custom/lama, shape tidak sah,
dan versi yang tidak didukung dinormalisasi secara aman menjadi `budgetAmount: null`; nilai tersebut
tidak berubah diam-diam menjadi Rp15.000. Jika record belum ada atau localStorage ditolak browser,
aplikasi tetap berjalan dengan default konservatif Rp15.000.

Hook memakai external-store subscription agar SSR/hydration stabil dan perubahan antar-tab dapat
terbaca melalui event storage. Kategori dan koordinat tidak dipersistenkan.
