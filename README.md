# KLM Cut v1.1 — Editor Video (PWA + Windows .exe + Android APK)

Editor video lengkap yang berjalan di browser, bisa dipasang sebagai aplikasi di **HP (Android/iPhone)** dan **PC**, plus **Windows `.exe`** dan **APK Android**. Semua proyek & media tersimpan di perangkat (offline, tanpa server).

## Isi paket

| Berkas | Fungsi |
|---|---|
| `KLM-Cut.exe` | Aplikasi Windows (64-bit). Klik dua kali untuk membuka. |
| `KLM-Cut.apk` | Aplikasi Android (dibangun GitHub Actions, lihat bagian Android). |
| `web/` | Aplikasi web/PWA — unggah isi folder ini ke hosting (GitHub Pages, dll). |
| `launcher/` | Kode sumber `.exe` (Go) + pembuat ikon, jika ingin build ulang. |
| `android/` | Proyek Android (WebView) + `.github/workflows/build.yml` pembuat APK. |

## Versi Windows (.exe)

1. Klik dua kali `KLM-Cut.exe` → terbuka jendela aplikasi KLM Cut (memakai Microsoft Edge/Chrome yang sudah ada di Windows 10/11, tanpa bilah alamat).
2. Kalau muncul **"Windows melindungi PC Anda"** (SmartScreen): klik **Info selengkapnya → Tetap jalankan**. Ini muncul karena file belum ditandatangani sertifikat.
3. Bisa dipakai sebagai **"Buka dengan"**: klik kanan video/foto/`.klmcut` → Buka dengan → pilih `KLM-Cut.exe`; file langsung masuk ke proyek baru.
4. Data proyek tersimpan di profil aplikasi (`%LOCALAPPDATA%\KLMCut`). Tidak perlu internet.

## Versi Android (APK)

Unduh `KLM-Cut.apk` dari halaman **Releases** repo (`github.com/klmthebest10/klm-cut/releases`), buka di HP, izinkan *"Pasang dari sumber tidak dikenal"*, lalu pasang.

- Hasil ekspor otomatis tersimpan ke **Galeri** (folder `Movies/KLM Cut`) dan ada tombol **Bagikan**.
- Muncul di menu **Bagikan / Buka dengan** dari galeri untuk video, foto, dan audio.
- Layar tetap menyala selama ekspor; tombol Kembali menutup panel dulu sebelum keluar.
- Setiap `git push` ke `main` membangun APK baru otomatis (tab **Actions**) dan menayangkan versi web ke GitHub Pages.
- APK ditandatangani dengan kunci `android/klmcut-release.jks` di repo; pakai kunci yang sama agar pembaruan bisa menimpa versi lama. Untuk dipublikasikan di Play Store, buat kunci pribadi dan simpan sebagai secret.

## Pasang sebagai PWA (HP & PC)

PWA butuh alamat **HTTPS**. Cara termudah dengan GitHub Pages:

1. Buat repo baru (mis. `klm-cut`) → unggah **isi** folder `web/` (index.html harus di akar repo).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `root` → Save.
3. Buka `https://<username>.github.io/klm-cut/`
   - **Android (Chrome):** menu ⋮ → *Instal aplikasi*. Bisa menerima video lewat menu **Bagikan** di galeri.
   - **iPhone (Safari):** Bagikan → *Tambah ke Layar Utama*.
   - **PC (Chrome/Edge):** ikon instal di bilah alamat, atau tombol **Pasang aplikasi** di beranda KLM Cut.

## Fitur

**Tata letak**: panel aset (kiri), pemutar (tengah), inspektor properti (kanan), timeline multi-track (bawah). Di HP: toolbar bawah + lembar (bottom sheet) + timeline dengan playhead di tengah, tekan-tahan klip untuk memindah, cubit untuk zoom.

**Timeline**: trek utama (magnet tanpa celah), hamparan/overlay tak terbatas, trek teks, efek, audio · seret/pindah antar trek · pangkas tepi · potong (Ctrl+B) · hapus kiri/kanan playhead (Q/W) · duplikat, salin, tempel · snap otomatis · penanda (marker) · zoom & muat semua · kunci/sembunyikan/bisukan trek · urungkan/ulangi tanpa batas praktis · thumbnail filmstrip & waveform.

**Video & foto**: posisi, skala, rotasi, opasitas dengan **keyframe** (linear/halus) · seret, perbesar, putar langsung di pratinjau · muat/penuhi · cermin & putar 90° · crop + rasio cepat · 13 mode blend · **masker** (linear, cermin, lingkaran, persegi, hati, bintang + lembutkan & balik) · **kunci warna/layar hijau** dengan pengambil warna · bekukan frame · ganti media · kecepatan 0.1×–10× (jaga nada) · 40 animasi masuk/keluar/berulang.

**Warna**: 41 filter dengan intensitas · 13 penyesuaian (kecerahan, kontras, saturasi, eksposur, suhu, rona, hue, sorotan, bayangan, pudar, vinyet, ketajaman, butiran) · lapisan filter & penyesuaian untuk semua klip di bawahnya.

**Efek**: 69 efek shader GPU (guncang, gempa, glitch, VHS, RGB, zoom hentak, buram zoom, mata ikan, kaleidoskop, layar 2/3/4/9, bar sinematik, buka/tutup lingkaran, neon, sketsa, termal, kilau, bokeh, salju, hujan, konfeti, dll) — sebagai lapisan timeline atau khusus satu klip.

**Transisi**: 44 transisi (larut, celup hitam/putih, dorong, geser, sapu, tirai, pintu, jarum jam, lingkaran, berlian, hati, kotak acak, zoom, putar, buram, glitch, piksel, pusaran, riak, kubus) + durasi + terapkan ke semua.

**Teks**: 20 gaya siap pakai, 47 font (Google Fonts + sistem + **Arab**: Amiri, Cairo, Reem Kufi, dll) + impor font sendiri (.ttf/.otf) · garis tepi, bayangan, latar, gradasi, glow · spasi huruf/baris · rata kiri/tengah/kanan · animasi termasuk mesin ketik · teks cepat (judul, lower third, basmalah, hitung mundur…).

**Subtitle**: **teks otomatis AI (Whisper, di perangkat)** untuk Indonesia/Inggris/Arab/Jawa/Sunda/Korea dll · impor & ekspor SRT · ubah gaya semua subtitle sekaligus · daftar subtitle untuk mengedit cepat.

**Stiker**: 27 grafis vektor (panah, balon kata, LIVE, DISKON, bulan bintang, lentera, ketupat…), 12 bentuk yang bisa diwarnai (bar lower-third, bingkai…), ratusan emoji, impor PNG/GIF.

**Audio**: impor musik · ambil audio dari file video · **rekam suara** (voice-over sambil video diputar) · 26 efek suara & 4 musik latar bawaan (dibuat otomatis, bebas pakai) · volume 0–200% dengan keyframe · fade in/out · pisahkan audio dari video · normalisasi · deteksi ketukan (beat → penanda) · 11 pengubah suara (gema, ruangan, aula, telepon, radio, megafon, bawah air, robot, bas, jernih, lo-fi).

**Kanvas**: rasio Asli/16:9/9:16/1:1/4:5/4:3/3:4/21:9/2.35:1/2:1 · resolusi 480p–4K · 24–60 fps · latar warna, buram (otomatis dari video), atau gambar · latar warna & gradasi siap pakai.

**Ekspor**: **MP4 (H.264)** frame-akurat lewat WebCodecs (kecepatan menyesuaikan perangkat, tidak ada frame hilang) · WebM · 480p–4K · 24/25/30/50/60 fps · 4 tingkat kualitas · audio saja (WAV) · foto frame (PNG) · subtitle (SRT) · file proyek `.klmcut` (backup/pindah perangkat) · bagikan langsung di HP.

**Fitur Pro (v1.1)**
- **AI**: potong latar orang tanpa layar hijau (hapus latar, ganti dengan warna/gambar, atau buramkan) · reframe otomatis ke 9:16/1:1 · stabilisasi video · warna otomatis & samakan warna dengan klip lain · sensor wajah/area (mosaik/buram) · retouch kulit/halus.
- **Kurva kecepatan** (speed ramp): 8 preset (dramatis, lompatan, bullet time, dll) + 5 titik yang bisa diatur; pemotongan dan ekspor mengikuti kurva. **Video mundur** (reverse).
- **Teks**: animasi per kata/huruf, **karaoke** (sorot kata saat diucapkan, warna bisa diatur), teks bergelombang · **teks ke suara** (TTS di perangkat, banyak bahasa).
- **Audio Pro**: peredam bising · hapus vokal · fokus vokal · duck musik otomatis saat bicara · pengubah suara "Tingkatkan Suara" · deteksi ketukan.
- **Tata letak multi-klip**: layar terbagi 2/3/4, picture-in-picture, dll dari klip terpilih · sinkron ke ketukan.
- **Templat**: 8 templat siap pakai (promo, vlog, kutipan, dll) yang terisi otomatis dari media Anda.
- **14 efek Pro** (lukisan minyak, retouch, dll) dan **9 transisi Pro** tambahan.

**Proyek**: beranda dengan daftar proyek, cari, ganti nama, duplikat, hapus · simpan otomatis · buka/simpan `.klmcut` · seret & lepas file ke mana saja.

## Pintasan keyboard

Spasi putar/jeda · Ctrl+B / S potong · Q / W hapus kiri/kanan · Delete hapus · Ctrl+Z / Ctrl+Y · Ctrl+C / V / X / D · Ctrl+A · ← → frame · Shift+← → 1 detik · ↑ ↓ ke potongan · Home/End · M penanda · K keyframe · + / − zoom · Shift+Z muat · Ctrl+I impor · Ctrl+E ekspor · Ctrl+S simpan · Ctrl+scroll zoom timeline · Alt+scroll skala objek.

## Catatan

- Paling lancar di **Chrome / Edge** (PC & Android). Di iPhone (Safari) semua fitur edit jalan; ekspor memakai jalur cadangan sehingga bisa lebih lambat.
- Audio MP4 memakai **AAC** bila browser mendukung (umumnya Windows/Android); jika tidak, memakai **Opus** (diputar normal di Chrome, VLC, Android, YouTube).
- Teks otomatis AI & Google Fonts butuh internet **sekali** untuk mengunduh; setelah itu tersimpan dan bisa offline.
- Fitur AI (potong latar, teks otomatis, TTS) mengunduh model kecil dari internet sekali; setelah itu tersimpan.
- Belum ada: sinkron cloud antar perangkat (pakai file `.klmcut` untuk memindahkan proyek). Tidak ada konten/fitur berbayar milik CapCut; semua aset bawaan orisinal.

## Build ulang .exe (opsional)

```bash
cd launcher
cp -r ../web ./web
python3 mkrsrc.py ../web/icons/icon-512.png rsrc_windows_amd64.syso klmcut.ico   # perlu Pillow
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o KLM-Cut.exe .
```
