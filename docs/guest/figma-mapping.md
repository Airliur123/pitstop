# Figma mapping

Sumber: **PitStop Mobile PWA & Admin MVP — PitStop Design v1.0**, file
`ULbSs8WJIfXZxqo0g5QUPA`, read-only.

| Runtime                | Figma node utama              |
| ---------------------- | ----------------------------- |
| Home                   | `18:3 Mobile/Home`            |
| Recommendations        | `18:4 Mobile/Recommendations` |
| Place Detail           | `18:5 Mobile/Place Detail`    |
| Loading                | `62:325 Mobile/Loading`       |
| Network Error          | `62:350 Mobile/Network Error` |
| Budget sheet reference | `18:9 Mobile/Budget Sheet`    |
| Outside radius         | `18:10 Mobile/Out of Radius`  |
| Budget too low         | `18:11 Mobile/Above Budget`   |
| No verified data       | `18:13 Mobile/No Verified`    |
| All closed             | `18:14 Mobile/All Closed`     |

Shared references: Mobile Header `14:15`, Bottom Navigation `14:69`, Category Card `14:105`,
Budget Chip `14:110`, Facility Chip `14:148`, Status Badge `14:176`, Place Card `15:133`, Empty
State `15:209`, Error State `15:210`, Loading Skeleton `15:225`.

## UX-flow technical debt

- Figma prototype menyebarkan koneksi flow pada beberapa section; Phase 4 mengunci vertical slice
  yang tercantum di README.
- Referensi Figma menyediakan budget “Bebas”, tetapi hotfix Phase 4 mengunci Guest Home pada empat
  preset resmi: Rp10.000, Rp15.000, Rp20.000, dan Rp25.000. “Bebas” dan nominal manual tidak
  diekspos.
- Budget sheet dipakai untuk memilih budget pada kategori yang memerlukannya. Sheet menggunakan
  focus trap, Escape, dan focus restoration dari primitive `Sheet` Design System.
- `MAKAN_MURAH` dan `NGOPI` selalu mengirim salah satu preset resmi. Kategori lain tidak menampilkan
  Budget Sheet dan tidak mengirim `budgetAmount`, walaupun preset terakhir masih tersimpan lokal.
- Navigation map/external direction, activity, contribution, dan login sengaja tidak diaktifkan.

Hierarchy, semantic token, radius, target 48 px, padding 16 px, gap 12 px, dan treatment state
mengikuti Figma/Design System. Foto asli dan motion tidak dapat diverifikasi karena API Phase 3
belum menyediakan media URL atau contract motion.
