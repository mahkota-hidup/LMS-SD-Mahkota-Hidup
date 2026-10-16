# LMS SD Mahkota Hidup — starter aplikasi

Starter full-stack dengan tampilan futuristik biru navy, biru elektrik, putih, dan ungu. Memiliki login berbasis peran (NISN siswa, NUPTK guru, NPSN admin), materi, tugas, pengumpulan, nilai, pengumuman, dan pembuatan akun oleh admin.

## Menjalankan secara lokal

Persyaratan: Node.js 20 atau lebih baru.

1. Salin `.env.example` menjadi `.env`.
2. Isi `INITIAL_ADMIN_NPSN` dengan NPSN sekolah dan `INITIAL_ADMIN_PASSWORD` dengan kata sandi admin yang kuat (minimal 10 karakter).
3. Isi `SESSION_SECRET` dengan nilai acak panjang.
4. Jalankan `npm install`.
5. Jalankan `npm start`.
6. Buka `http://localhost:3000`.

Akun admin pertama dibuat ketika server mulai berjalan jika variabel admin di `.env` valid. Simpan kredensial secara aman.

## Deployment

Deploy sebagai **Node.js web service** pada hosting yang mendukung Node.js. Atur environment variables berdasarkan `.env.example`. Pastikan hosting menyediakan disk persisten dan atur `DB_PATH` serta `DATA_DIR` ke lokasi pada disk persisten; tanpa itu, database SQLite dapat hilang saat redeploy/restart. Aktifkan HTTPS. Jangan memasukkan file `.env` atau database berisi data siswa ke repositori publik.

## Sebelum dipakai sehari-hari

- Uji login semua peran, pembatasan akses, backup dan pemulihan database.
- Gunakan kata sandi unik dan jangan bagikan akun bersama.
- Buat kebijakan privasi, persetujuan sekolah/orang tua yang sesuai, dan proses reset kata sandi.
- Untuk skala produksi, pertimbangkan PostgreSQL terkelola, backup otomatis, rate limiting, pencatatan audit, pemulihan akun, dan pemeriksaan keamanan independen.
- Pengguna dan data siswa belum diisi; admin harus membuat akun dari dashboard.
- Fitur unggah file, jadwal kalender, ekspor laporan, dan reset kata sandi belum termasuk starter ini.
