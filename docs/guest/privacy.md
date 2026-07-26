# Privacy

Phase 4 tidak meminta permission lokasi dan tidak membaca GPS. Koordinat Data Simulasi hanya
berasal dari build environment development/E2E dan dipakai langsung untuk query API.

Koordinat tidak:

- masuk localStorage;
- masuk URL;
- ditampilkan mentah;
- dicatat oleh frontend;
- dikirim ke analytics/error reporting;
- dikaitkan dengan user/tracking identifier.

Budget lokal bukan secret dan hanya dikirim saat category contract memerlukannya. Tidak ada login,
fingerprinting, background tracking, atau persistence data pengguna.
