# Home

Home mengambil kategori dari API, memilih kategori primary dari respons (fallback pertama bila
tidak ada primary), lalu menerapkan `supportsBudget`.

- Kategori budget hanya menampilkan preset ≤ Rp10.000, ≤ Rp15.000, ≤ Rp20.000, dan ≤ Rp25.000.
  Tidak ada budget bebas atau input nominal manual.
- Kategori non-budget tidak menampilkan Budget Sheet, tidak mengirim budget, dan tidak terblokir
  oleh budget yang masih tersimpan.
- CTA aktif hanya setelah kategori, input wajib, dan location context siap.
- Preview memakai recommendation endpoint dengan radius 5.000 meter dan `limit=1`.
- Perubahan kategori/budget menghasilkan query key baru dan membatalkan request lama.

Home memiliki skeleton, retry network, typed fallback, dan maksimal satu place card. Tidak ada
daftar penuh atau client-side ranking.
