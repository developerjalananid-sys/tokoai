# Developer Jalanan POS (PWA)

Frontend statis (GitHub Pages) + backend Google Apps Script sebagai API JSON.

## Struktur
- `Code.gs` → backend, ditempel di project Apps Script (TIDAK di-upload ke GitHub Pages)
- `index.html`, `config.js`, `api.js`, `manifest.json`, `sw.js`, `icons/` → frontend, di-upload ke GitHub

## Langkah 1 - Deploy backend
1. Buka script.google.com → project lama Anda (atau baru). Ganti isi `Code.gs` dengan file ini.
   Hapus file `Index.html` lama dari project Apps Script (tidak dipakai lagi).
2. Deploy → New deployment → tipe **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Setujui izin (Spreadsheet, Drive, UrlFetch), lalu salin **Web app URL** (berakhiran `/exec`).
4. Setiap kali `Code.gs` diubah: Deploy → Manage deployments → Edit → Version: New version.

## Langkah 2 - Hubungkan frontend
Edit `config.js`, isi `API_URL` dengan URL `/exec` tadi.

## Langkah 3 - Deploy ke GitHub Pages
1. Buat repo baru, upload isi folder ini kecuali `Code.gs` dan `README.md` (boleh tetap diupload, tidak berbahaya).
2. Settings → Pages → Source: branch `main`, folder `/ (root)`.
3. Buka `https://USERNAME.github.io/NAMA-REPO/` di HP.
4. Android Chrome: menu ⋮ → *Install app* / tombol "Pasang Aplikasi". iPhone Safari: Share → *Add to Home Screen*.

Login awal: `admin` / `admin123` (segera ganti password).

## Catatan
- Aplikasi butuh internet untuk transaksi; saat offline hanya tampilan yang terbuka dan muncul banner offline.
- Setelah update file frontend, naikkan `CACHE_VERSION` di `sw.js` agar HP memuat versi baru.
- Token login disimpan di `localStorage` perangkat (sesi server 6 jam).
