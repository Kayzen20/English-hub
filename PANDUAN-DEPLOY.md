# Panduan Deploy untuk Pemula

Target: aplikasi EnglishHub bisa dibuka siapa saja lewat alamat website, misalnya `https://englishhub.onrender.com`.
Total waktu sekitar 20–30 menit. Tidak perlu mengetik perintah Git.

## Tahap 0 — Coba dulu di komputer sendiri (5 menit)

1. Instal **Node.js versi 22 atau lebih baru** dari https://nodejs.org (pilih versi LTS terbaru, klik Next sampai selesai).
2. Ekstrak `englishhub-app.zip`.
3. Buka Terminal (Mac/Linux) atau Command Prompt (Windows) di dalam folder `englishhub-app`.
   Windows: buka folder itu di File Explorer, ketik `cmd` di kolom alamat, tekan Enter.
4. Ketik `node -v` → pastikan angkanya 22 atau lebih.
5. Ketik `node server.js`, lalu buka http://localhost:3000 di browser.
6. Coba daftar, simpan kode pemulihan, main kuis, lihat leaderboard.
   Tekan `Ctrl + C` di terminal untuk menghentikan.

Kalau tahap ini belum jalan, jangan lanjut deploy dulu.

## Tahap 1 — Taruh kode di GitHub (5 menit)

1. Buat akun gratis di https://github.com.
2. Klik **+ → New repository**. Nama: `englishhub`. Pilih **Public** (atau Private, keduanya bisa). Klik **Create repository**.
3. Di halaman repository yang kosong, klik link **uploading an existing file**.
4. Buka folder `englishhub-app` yang sudah diekstrak, pilih **semua isinya** (`server.js`, `public`, `package.json`, dst.), lalu seret ke halaman GitHub.
5. Tunggu unggahan selesai, tulis pesan "first commit", klik **Commit changes**.
6. Pastikan di GitHub terlihat `server.js` dan folder `public` di bagian paling atas (bukan terbungkus folder `englishhub-app`).

## Tahap 2 — Deploy di Render.com (10 menit)

1. Buat akun di https://render.com, pilih **Sign in with GitHub**.
2. Klik **New + → Web Service**, lalu pilih repository `englishhub` (izinkan Render mengakses GitHub jika diminta).
3. Isi formulir:
   - **Name**: `englishhub` (ini jadi bagian alamat websitemu)
   - **Language/Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: pilih sesuai kebutuhan (lihat bagian "Gratis atau berbayar?" di bawah)
4. Buka bagian **Environment Variables**, tambahkan:

   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `SECRET` | teks acak panjang, mis. 40 karakter campuran huruf dan angka (jangan dibagikan) |
   | `TRUST_PROXY` | `1` |

5. Klik **Create Web Service**. Tunggu beberapa menit sampai statusnya **Live**.
6. Klik alamat `https://....onrender.com` di bagian atas. Itu websitemu.

Label tombol di Render bisa sedikit berbeda dari tulisan di sini karena tampilannya sering diperbarui; pilih yang artinya sama.

## Gratis atau berbayar?

Menurut dokumentasi Render, web service di paket **Free**:
- memiliki penyimpanan sementara, jadi database SQLite (semua akun dan XP) **hilang** setiap kali service restart, redeploy, atau tidur;
- tidur setelah 15 menit tanpa pengunjung, dan butuh sekitar satu menit untuk bangun lagi.

Artinya paket Free cocok untuk **demo atau presentasi tugas**, bukan untuk pengguna sungguhan.

Untuk data yang awet, pakai instance berbayar dengan **Persistent Disk**:
1. Di halaman service → **Disks → Add Disk**. Mount path: `/var/data`, ukuran 1 GB.
2. Tambahkan environment variable `DB_PATH` = `/var/data/englishhub.db`.
3. Simpan, tunggu deploy ulang.

Cek harga terbaru di https://render.com/pricing sebelum memilih.

## Tahap 3 — Setelah live

- Daftar akun pertamamu dan **simpan kode pemulihannya**.
- Setiap kamu mengubah kode di GitHub (edit file → Commit), Render otomatis deploy ulang.
- Domain sendiri (misalnya `englishhub.id`) bisa dipasang di **Settings → Custom Domains**, setelah kamu membeli domainnya.
- HTTPS sudah otomatis.

## Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| Deploy gagal, ada tulisan `node:sqlite` | Versi Node terlalu lama. Pastikan `NODE_VERSION` = `22`. |
| Website "Not Found" | File terunggah di dalam folder tambahan. `server.js` harus ada di root repository. |
| Akun hilang setelah beberapa waktu | Kamu memakai paket Free tanpa disk. |
| Pesan "Terlalu banyak percobaan" untuk semua orang | `TRUST_PROXY` belum diisi `1`. |
| Lama sekali saat pertama dibuka | Paket Free sedang bangun dari tidur (±1 menit). |
