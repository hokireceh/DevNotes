# Audit Extension — DevNotes Pro

**Sesi:** 2026-04-22
**Scope sesi ini:** `chrome-extension/background.js`, `chrome-extension/content.js`, `chrome-extension/page-inject.js`, `chrome-extension/popup.js`, `chrome-extension/manifest.json`, `chrome-extension/chrome-mock.js`
**Mode:** Bulk-approval (user otorisasi semua fix sekaligus)

---

## Ringkasan Status

| ID | Severity | File | Status |
|----|----------|------|--------|
| E1 | Critical | `chrome-extension/page-inject.js` | ✅ Fixed |
| E2 | High     | `chrome-extension/content.js`     | ✅ Fixed |
| E3 | High     | `chrome-extension/background.js`  | ✅ Fixed |
| E4 | Medium   | `chrome-extension/content.js`     | ✅ Fixed (digabung dengan E2) |
| E5 | Medium   | `chrome-extension/page-inject.js` | ✅ Fixed (digabung dengan E1) |

Semua issue Extension yang tercatat di sesi ini sudah di-fix. Semua file lulus `node -c`.

---

## E1 — Telemetri ter-hardcode ke server pihak ketiga (Critical) ✅

- **File:** `chrome-extension/page-inject.js` (sebelumnya baris 12–35)
- **Masalah:**
  `LOG_SERVER` di-hardcode ke domain dev pribadi:
  ```
  https://3ad0dca7-26d1-40a2-aff8-7a37215e559e-00-3omd1bk0wgcd2.pike.replit.dev/log
  ```
  `dbg()` dipanggil dari berbagai event (init di setiap page-load, tiap blob/MSE/fetch/XHR yang menarik), lalu setiap 300 ms batch di-`POST` ke URL itu. Karena `page-inject.js` di-inject ke **semua** halaman web yang dikunjungi user (`<all_urls>` + `host_permissions: <all_urls>`), extension ini secara diam-diam mem-broadcast metadata browsing user (URL CDN, hostname, MIME, size) ke server developer. Ini kebocoran privasi serius dan tidak diumumkan di deskripsi extension.
  
  Referensi: [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/user-data) — extension wajib disclose & opt-in untuk pengumpulan data.
- **Fix:**
  - Remote logging di-ubah jadi **opt-in eksplisit** via `localStorage`:
    ```js
    const LOG_SERVER = (() => {
      try { return localStorage.getItem("__devnotes_log_server") || ""; }
      catch { return ""; }
    })();
    const REMOTE_LOG_ENABLED = !!LOG_SERVER;
    ```
  - Console logging tetap jalan normal.
  - Bila tidak opt-in: tidak ada `fetch()` ke server manapun.
  - Cara aktif (developer di mesin sendiri):
    `localStorage.setItem("__devnotes_log_server", "https://my-host/log")`.

---

## E5 — `logQueue` tidak dibatasi (Medium → digabung E1) ✅

- **File:** `chrome-extension/page-inject.js` (di dalam `dbg()`)
- **Masalah:**
  Bila network ke `LOG_SERVER` lambat / down dan halaman trigger banyak event (mis. Telegram dengan banyak MSE chunk), `logQueue` bertumbuh tanpa batas → memory bloat di tab user.
- **Fix:**
  - `MAX_QUEUE = 200`. Bila lebih, `splice(0, len-MAX)` untuk drop entry tertua.
  - Otomatis hanya berlaku saat `REMOTE_LOG_ENABLED`.

---

## E2 — `RegExp /g` dipakai dengan `.test()` di `findEmailsOnPage` (High) ✅

- **File:** `chrome-extension/content.js` (sebelumnya baris 56–63)
- **Masalah:**
  `emailRegex` dideklarasi dengan flag `g`. `RegExp.prototype.test()` dengan flag `g` mempertahankan `lastIndex` antar pemanggilan ([MDN: RegExp.prototype.lastIndex](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RegExp/lastIndex)). Akibatnya pemanggilan berurutan di dalam `forEach` menghasilkan `true`/`false` bergantian walau input valid → email valid bisa tidak ter-deteksi secara non-deterministik.
- **Fix:**
  - Selalu pakai `String.prototype.match(regex)` (yang tidak terpengaruh `lastIndex` saat regex di-buang setelah call).
  - Dibungkus helper `matchAll(str)` yang return array (kosong bila null).

---

## E4 — Scan email pakai `document.documentElement.innerHTML` (Medium → digabung E2) ✅

- **File:** `chrome-extension/content.js` (sebelumnya baris 58, 71)
- **Masalah:**
  Serialize seluruh DOM ke string tiap scan: mahal di halaman besar (puluhan MB string), juga menangkap teks dalam `<script>`/`<style>`/atribut tersembunyi yang bukan email user-facing.
- **Fix:**
  - Ganti ke `document.body?.innerText || ""` — jauh lebih kecil dan hanya teks visible.
  - Tetap kombinasi dengan scan input field & meta tag (input value tidak tercermin di innerText).

---

## E3 — Logika `scheduleResetAlarm` salah untuk timezone non-WIB (High) ✅

- **File:** `chrome-extension/background.js` (sebelumnya baris 14–34)
- **Masalah:**
  Aritmatika `wibOffset + utcOffset` lalu `setMinutes(... + totalOffset)` dan `setHours(7, 0, 0, 0)` (yang dievaluasi di **local time** perangkat) menghasilkan target jam yang **bukan 07:00 WIB** untuk user di luar Asia/Jakarta. Service worker MV3 berjalan di mesin user — jadi user di UTC, EST, JST, dll dapat alarm yang waktunya off berjam-jam.
- **Fix:**
  Hitung target di UTC murni. Karena Indonesia (WIB / Asia/Jakarta) **UTC+7 tanpa DST**, maka:
  ```
  07:00 WIB ≡ 00:00 UTC, setiap hari
  ```
  Implementasi:
  ```js
  const nowMs = Date.now();
  const nowUtc = new Date(nowMs);
  let nextResetMs = Date.UTC(
    nowUtc.getUTCFullYear(),
    nowUtc.getUTCMonth(),
    nowUtc.getUTCDate(),
    0, 0, 0, 0
  );
  if (nextResetMs <= nowMs) nextResetMs += 24 * 60 * 60 * 1000;
  const delayInMinutes = Math.max(0.5, (nextResetMs - nowMs) / 60000);
  chrome.alarms.create(RESET_ALARM, { delayInMinutes });
  ```
  - `Math.max(0.5, ...)` memenuhi minimum [`chrome.alarms`](https://developer.chrome.com/docs/extensions/reference/api/alarms) di production build (30 detik).

---

## Carry-over untuk sesi berikutnya

Issue advisory yang DIIDENTIFIKASI tapi BELUM di-propose karena di luar top-10 sesi ini:

| ID | Sev | File | Catatan |
|----|-----|------|---------|
| E6 | Low | `chrome-extension/page-inject.js` (`URL.createObjectURL` hook) | Filter `tooSmall` hanya berlaku untuk image (<10 KB) & audio (<50 KB). Video/octet-stream blob kecil ikut tertangkap → daftar blob di popup bisa berisik. Pertimbangkan ambang minimum untuk semua kind. Hati-hati: jangan kelewat agresif, blob video Telegram pertama sering kecil. |
| E7 | Low | `chrome-extension/popup.js` (`renderMediaList`) | Re-render full innerHTML setiap interaksi → handler lama tidak otomatis di-detach. Saat ini OK karena `data-*` listener di-rewire setiap render, tapi worth meninjau performa pada list besar. |
| E8 | Low | `chrome-extension/popup.js` (l. 17) | Pemanggilan `localStorage.setItem("devnotes_lasttab", ...)` langsung di popup context — belum di-try-ulang. Sudah dibungkus try/catch → OK. Catatan saja. |
| E9 | Low | `chrome-extension/background.js` (handler `ADD_EMAILS`) | Dedup email O(n²) (`history.find`). Dataset diharapkan kecil, tapi pada usage berat bisa diganti `Set`. |
| E10| Low | `chrome-extension/page-inject.js` (`isMediaUrl`) | Regex heuristic — false-positive untuk URL halaman yang kebetulan mengandung kata "video" / "stream". Sudah di-mitigasi di `smartDownload` via cek looksLikeMedia, tapi bisa lebih ketat. |

Belum dibaca / belum diaudit:
- `chrome-extension/popup.html`, `chrome-extension/popup.css` — review HTML/CSS.
- `preview.html` — halaman preview server.
- (Tidak ada layer Database di proyek ini.)
