# Accessibility

Foundation menargetkan WCAG 2.2 AA:

- skip link dan landmark `main`;
- hierarchy heading yang stabil;
- native fieldset/legend untuk kategori dan budget;
- `aria-pressed` pada pilihan;
- target interaksi sekitar 48 px;
- focus-visible dari Design System;
- loading memakai `aria-busy` dan teks screen-reader;
- error memakai live alert dan retry yang dapat dioperasikan keyboard;
- status tidak bergantung pada warna;
- nama panjang, alamat, dan nilai rupiah dapat wrap.

Playwright memeriksa serious/critical axe violations, keyboard focus, overflow, console error, dan
hydration warning. Reduced-motion dan semantic tokens diwarisi dari `packages/ui`.
