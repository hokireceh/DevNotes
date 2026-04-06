# DevNotes Pro — Chrome Extension

Chrome extension dengan fitur catatan, deteksi email, dan snippet coding.

## Cara Run Preview
Server preview berjalan di port 5000 via `node server.js`.
Buka preview di browser untuk melihat tampilan popup extension.

## Struktur Proyek
```
chrome-extension/    ← Folder extension yang di-load ke Chrome
  manifest.json      ← Manifest V3
  popup.html         ← UI popup extension
  popup.css          ← Styling dark purple theme
  popup.js           ← Logic: catatan, email, snippet
  background.js      ← Service worker: alarm reset jam 7 WIB
  content.js         ← Content script: scan email di halaman web
  chrome-mock.js     ← Mock chrome API untuk preview di browser
  icons/             ← Icon 16, 48, 128 px

server.js            ← Preview server (Node.js, port 5000)
preview.html         ← Halaman preview + panduan install
```

## Fitur Extension
1. **Catatan** — Simpan catatan dengan judul, isi, tag, dan URL sumber
2. **Email Tracker** — Scan email di halaman web, riwayat harian, reset jam 07:00 WIB
3. **Snippet** — Simpan kode dengan highlight bahasa (JS, Python, Bash, dll)
4. **Jam WIB** — Clock realtime di footer

## Cara Install di Chrome
1. Buka `chrome://extensions`
2. Aktifkan Developer Mode
3. Klik "Load unpacked"
4. Pilih folder `chrome-extension/`

## Tech Stack
- Manifest V3
- chrome.storage.local (penyimpanan)
- chrome.alarms (reset harian)
- Content Script (deteksi email)
- Vanilla JS, CSS dark theme


# Fitur tambahan di browser console (F12)
### Ketik di console untuk melihat status saat ini:

```
window.__devnotesStatus()
```

### Ini menampilkan tabel MSE chunks dan blob yang sudah terkumpul.