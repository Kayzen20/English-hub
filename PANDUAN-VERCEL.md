# Deploy ke Vercel lewat GitHub (untuk pemula)

Vercel tidak punya disk permanen, jadi database tidak bisa berupa file SQLite. Proyek ini otomatis memakai **PostgreSQL** (Neon, tersedia gratis lewat Vercel) saat variabel `DATABASE_URL` ada. Frontend dilayani dari folder `public/`, backend berjalan sebagai Vercel Function di `api/[...path].js`.

## 1. Taruh kode di GitHub
1. Ekstrak `englishhub-app.zip`.
2. Buat repository baru di GitHub, lalu **uploading an existing file** dan seret **semua isi** folder `englishhub-app` (termasuk folder `api`, `lib`, `public`, serta `package.json`, `vercel.json`).
3. Pastikan di halaman utama repository terlihat folder `api`, `lib`, `public` dan file `package.json`, `vercel.json` (bukan terbungkus folder lain).
4. Cek `api/[...path].js` ikut terunggah (nama file memakai tanda kurung siku, itu memang disengaja).

## 2. Impor ke Vercel
1. Buka https://vercel.com, **Sign Up** dengan GitHub.
2. **Add New → Project**, pilih repository `englishhub` → **Import**.
3. **Framework Preset: Other**. Biarkan Build Command dan Output Directory kosong (sudah diatur `vercel.json`).
4. Buka **Environment Variables**, tambahkan:
   - `SECRET` = teks acak panjang, minimal 32 karakter (jangan dibagikan).
5. Klik **Deploy**.

## 3. Sambungkan database
1. Di dashboard proyek, buka tab **Storage**.
2. Pilih **Neon** (Serverless Postgres) dari Marketplace, tambahkan, dan hubungkan ke proyek ini. Pilih paket gratis.
3. Vercel otomatis menambahkan variabel `DATABASE_URL` ke proyekmu. Kamu tidak perlu menyalinnya.
4. Buka tab **Deployments**, klik titik tiga pada deployment terbaru, pilih **Redeploy**. (Variabel baru hanya terbaca oleh deployment baru.)

## 4. Coba
Buka alamat `https://namaproyek.vercel.app`, daftar akun, simpan kode pemulihan, lalu coba Vocabulary. Tabel database dibuat otomatis saat permintaan pertama.

## Cek pengucapan
- Fitur ini memakai pengenalan suara bawaan browser dan membutuhkan HTTPS, yang sudah otomatis di Vercel.
- Berfungsi di Chrome, Edge, dan Safari. Di browser yang tidak mendukung (mis. Firefox), kata bisa dilanjutkan manual dengan XP lebih kecil.
- Level **Intermediate** terbuka setelah semua kata **Beginner** dikuasai (lolos cek pengucapan, atau ditandai manual).

## Masalah umum
| Gejala | Solusi |
|---|---|
| Pesan "Server belum dikonfigurasi: Variabel SECRET wajib diisi" | Tambah `SECRET` di Settings → Environment Variables, lalu Redeploy. |
| Daftar/login gagal dengan "Kesalahan server" | Buka **Logs** di dashboard Vercel. Biasanya `DATABASE_URL` belum ada: ulangi langkah 3 dan Redeploy. |
| Halaman 404 | Pastikan `public/index.html` ada di repository dan Output Directory tidak diubah. |
| Data terasa hilang | Pastikan `DATABASE_URL` aktif. Tanpa itu fungsi memakai penyimpanan sementara. |

## Catatan jujur
- Pembatas percobaan login disimpan di memori tiap instance, jadi di Vercel perlindungannya hanya "sebisanya". Untuk perlindungan penuh, aktifkan fitur firewall/rate limit milik Vercel.
- Cek batas paket gratis Vercel dan Neon terbaru sebelum membagikan aplikasi ke banyak orang.
- Kode Postgres belum dijalankan terhadap database sungguhan di lingkunganku. Jika ada error saat pertama kali, kirim pesan dari tab Logs.
