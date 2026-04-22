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

---

## Sesi 2 (lanjutan) — 2026-04-22

Scope: review file frontend yang belum diaudit (`popup.html`, `popup.css`, `preview.html`) + carry-over E6–E10 + temuan baru saat re-scan extension code. Mode: bulk-approval.

### Ringkasan Status Sesi 2

| ID | Severity | File | Status |
|----|----------|------|--------|
| F1 | Medium | `chrome-extension/popup.js` | ✅ Fixed |
| F2 | Medium | `chrome-extension/page-inject.js` | ✅ Fixed |
| F3 | Low    | `chrome-extension/page-inject.js` | ✅ Fixed |
| F5 (≡E9) | Low | `chrome-extension/background.js` | ✅ Fixed |

`popup.html`, `popup.css`, `preview.html` direview manual — tidak ada Critical/High/Medium. Detail review tersimpan di `docs/audit/audit-frontend.md`.

---

### F1 — Inline `onerror=` di template diblok CSP MV3 (Medium) ✅

- **File:** `chrome-extension/popup.js` (`renderMediaList`, sebelumnya l. 377)
- **Masalah:**
  Template berisi:
  ```html
  <img class="media-thumb" src="${safeUrl}"
       onerror="this.parentElement.innerHTML='🖼️'" loading="lazy"/>
  ```
  Default Manifest V3 extension CSP (`script-src 'self'; object-src 'self'`) memblok semua **inline event handler attribute** karena setara dengan inline script. Akibatnya saat thumbnail gagal load (404 / CORS / network), fallback emoji `🖼️` **tidak pernah muncul** dan card menampilkan broken-image placeholder bawaan Chrome.

  Referensi resmi: [Content Security Policy for extensions](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — default policy memblok `script-src 'unsafe-inline'`, dan inline handler dianggap inline script.
- **Fix:**
  - Ganti atribut inline jadi marker: `data-img-fallback="1"`.
  - Setelah `list.innerHTML = html;`, attach listener via `addEventListener("error", ..., { once: true })` ke semua `img[data-img-fallback="1"]`.
- **Risiko:** nihil — listener dipasang di render pass yang sama dengan elemen target.

---

### F2 — `mseChunks` tumbuh tanpa batas (Medium) ✅

- **File:** `chrome-extension/page-inject.js` (`SourceBuffer.prototype.appendBuffer` hook)
- **Masalah:**
  Setiap `appendBuffer` mendorong `Uint8Array` ke `entry.chunks` tanpa batas. Pada streaming jangka panjang (mis. user nonton playlist Telegram berjam-jam atau live audio room), array bisa membesar hingga GB-scale, sementara `URL.createObjectURL` hook juga menahan referensi blob via `captured` map. Tab dapat OOM atau di-suspend Chrome.
- **Fix:**
  - Tambah `MAX_MSE_BYTES_PER_ENTRY = 500 MB`.
  - Track `entry.totalSize` incremental (hindari `reduce` setiap chunk → O(n²) sebelumnya).
  - Saat cap tercapai: log warning sekali (`entry.capped` flag), chunk baru tidak disimpan, **tetapi `origAppend.call(this, chunk)` tetap dijalankan** sehingga playback live tidak rusak.
  - Bonus: `post("mse_progress", ...)` hanya dikirim saat chunk benar-benar masuk (mengurangi spam event).
- **Referensi:** [MSE: SourceBuffer.appendBuffer()](https://developer.mozilla.org/docs/Web/API/SourceBuffer/appendBuffer) — appendBuffer tetap async dan mengubah `updating`; kita tidak menyentuh signature.
- **Risiko:** untuk file > 500 MB, MSE-download yang dihasilkan akan terpotong di 500 MB. Trade-off sengaja: mencegah crash tab > kelengkapan rekaman ekstrem.

---

### F3 — `extractFilename` salah stringify array (Low) ✅

- **File:** `chrome-extension/page-inject.js` (l. 172–175 sebelumnya)
- **Masalah:**
  ```js
  const parts = url.split("document").slice(1);
  return parts + "." + ext;
  ```
  `parts` adalah array. `+` mengkonversi via `Array.prototype.toString` → comma-join. URL dengan beberapa kemunculan `"document"` menghasilkan filename seperti `"123/abc,xyz.mp4"` (mengandung `,` dan `/`, illegal/aneh untuk download attribute).
- **Fix:**
  - Ambil `parts[0]`, strip query string, ganti `/` dan `\` jadi `_`.
  - Fallback ke `telegram_video_${Date.now()}.${ext}` bila kosong.
- **Risiko:** nihil — output sebelumnya juga "ad-hoc string", sekarang lebih deterministik.

---

### F5 (≡ E9) — Dedup email O(n*m) di `ADD_EMAILS` handler (Low) ✅

- **File:** `chrome-extension/background.js` (l. 76–81 sebelumnya)
- **Masalah:**
  ```js
  emails.forEach((email) => {
    const exists = history.find((e) => e.email === email);
    ...
  });
  ```
  `Array#find` linear → total O(n*m) untuk batch besar (mis. import dump email).
- **Fix:**
  - `const seen = new Set(history.map(e => e.email))` sekali, lalu `seen.has` + `seen.add` per email → O(n+m).
- **Risiko:** nihil — semantik identik, hanya struktur data berubah.

---

### Carry-over yang tetap advisory (tidak di-fix)

| ID  | Sev | File | Alasan tidak di-fix sekarang |
|-----|-----|------|------------------------------|
| E6  | Low | `page-inject.js` (`URL.createObjectURL` hook, filter `tooSmall`) | Threshold yang tepat untuk video/octet-stream butuh data lapangan. Salah set → blob legit Telegram (chunk pertama sering <50 KB) hilang. Biarkan sampai user lapor noise konkret. |
| E7  | Low | `popup.js` (`renderMediaList` full innerHTML re-render) | Hanya impact perf di list >100 item. Ganti ke incremental DOM patch berarti refactor non-trivial → di luar scope audit ini. |
| E8  | Low | `popup.js` (l. 17, `localStorage.setItem`) | Sudah dibungkus try/catch — sebenarnya tidak ada bug. Murni catatan, tidak perlu aksi. |
| E10 | Low | `page-inject.js` (`isMediaUrl` heuristic) | Sudah di-mitigasi di `smartDownload`. Memperketat regex bisa merusak deteksi CDN custom. Pertahankan dulu. |

### File yang BELUM diaudit setelah sesi ini

- Tidak ada di scope extension/backend/frontend. Project tidak punya layer Database.

---

## E11 — CORS `Failed to fetch` saat Segmented Download di CDN cross-origin

**Severity:** High
**Status:** Fixed
**File:** `chrome-extension/page-inject.js`, `chrome-extension/content.js`, `chrome-extension/background.js`, `chrome-extension/manifest.json`

### Findings

Log produksi menunjukkan:
```
[OK]    SMART HTTP URL → Segmented Parallel
[INFO]  DOWNLOAD Strategi: Segmented Parallel {"url":"https://vid.klikbokep.com/..."}
[ERROR] DOWNLOAD Segmented gagal: Failed to fetch
```

### Reasoning

`downloadSegmented` melakukan `fetch()` di **MAIN world** halaman web (lewat `page-inject.js`).
Untuk URL yang berbeda origin dari halaman host (subdomain CDN seperti `vid.klikbokep.com`
saat halaman host adalah `klikbokep.com`), browser tunduk pada CORS halaman.
Server CDN tidak mengirim header `Access-Control-Allow-Origin`, sehingga fetch
ditolak dengan `TypeError: Failed to fetch`. Tidak ada fallback — user lihat
"❌ Gagal: Failed to fetch" tanpa solusi.

### Fix

Sesuai dokumentasi resmi
[chrome.downloads.download()](https://developer.chrome.com/docs/extensions/reference/api/downloads#method-download):
"Downloads a file, given its URL and other optional preferences." API ini berjalan
di service worker dan menggunakan **network stack browser**, bukan fetch context
halaman → otomatis bypass CORS halaman host.

Implementasi:

1. **manifest.json** — tambah permission `"downloads"` (mandatory untuk API).
2. **background.js** — handler `EXT_DOWNLOAD`:
   - Validasi URL `^https?://` only.
   - Sanitasi filename: strip `\\/:*?"<>|\r\n\t`, strip leading `.`, cap 180 char
     (mencegah path traversal di filesystem user — chrome.downloads sendiri juga
     reject `..` segments).
   - `chrome.downloads.download({ url, filename, conflictAction: "uniquify" })`.
   - Async `sendResponse` (`return true`) + tangani `chrome.runtime.lastError`.
3. **content.js** — bridge listener `__devnotes_ext_download` (page event) →
   `chrome.runtime.sendMessage({ type: "EXT_DOWNLOAD", ... })` → balikkan
   hasilnya via `__devnotes_ext_download_result` ke page.
4. **page-inject.js** — di `catch` block `downloadSegmented`, dispatch
   `__devnotes_ext_download` sebagai fallback. Listener temporary dengan
   safety-timeout 12 detik (cegah leak listener jika service worker tidur).

Tidak mengubah strategi default (Segmented tetap dicoba duluan demi kecepatan
parallel). Fallback hanya aktif saat segmented benar-benar gagal — minimal-risk,
backwards-compatible.

### Verification

- `node -c` semua file JS: ✅
- `manifest.json` valid JSON: ✅
- Server smoke test: `/`, `/ext/popup.html`, `/ext/manifest.json` semua HTTP 200.
- Tidak ada dependency baru, hanya 1 manifest permission yang memang required oleh API.

---

## E12 — CSP `connect-src` block + null `appendChild` di `document_start`

**Severity:** High (CSP blocking) + Medium (null deref)
**Status:** Fixed
**File:** `chrome-extension/page-inject.js`, `chrome-extension/content.js`, `chrome-extension/background.js`

### Findings

Console halaman host (Instagram/Facebook):
```
Connecting to '...replit.dev/log' violates the following Content Security Policy
directive: "connect-src *.instagram.com wss://edge-chat.instagram.com ...".
The action has been blocked.
Fetch API cannot load .../log. Refused to connect because it violates the
document's Content Security Policy.
Uncaught (in promise) TypeError: Failed to fetch
Uncaught TypeError: Cannot read properties of null (reading 'appendChild')
```

### Reasoning

**Issue A — CSP blocked fetch:**
`dbg()` di `page-inject.js` POST batch log ke `LOG_SERVER` (opt-in via
`localStorage.__devnotes_log_server`). Karena page-inject berjalan di **MAIN
world** halaman host, fetch tunduk pada CSP `connect-src` halaman tersebut.
Situs ketat seperti Instagram/Facebook tidak whitelist `replit.dev` →
TypeError sebelum request sempat berangkat.

**Issue B — `appendChild` null:**
Line `document.head.appendChild(style)` dipanggil saat `page-inject.js` di-load
oleh `content.js` pada `run_at: document_start`. Pada tahap ini `document.head`
bisa `null` (`<head>` belum di-parse). `content.js` sendiri sudah pakai pola
`(document.head || document.documentElement)` — `page-inject.js` belum.

### Fix

Sesuai [Chrome Extensions service worker docs](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
("service workers run in their own context, separate from the page") dan [CSP
spec](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) (`connect-src` hanya
mengikat dokumen origin):

1. **page-inject.js** — `dbg()` tidak lagi `fetch()` langsung. Dispatch
   `CustomEvent("__devnotes_log_ship", { detail: { server, batch } })` ke
   window (cross-world via DOM event).
2. **content.js** — listener `__devnotes_log_ship` relay ke
   `chrome.runtime.sendMessage({ type: "SHIP_LOG", server, batch })`.
3. **background.js** — handler `SHIP_LOG`:
   - Validasi `server` `^https?://` only.
   - Validasi `batch` array & non-empty.
   - `fetch(server, { method: "POST", ... })` — service worker context, **tidak
     tunduk page CSP**, request lolos ke replit.dev.
4. **page-inject.js (line 146)** — `(document.head || document.documentElement).appendChild(style)`
   meniru pola defensif `content.js`. Sama untuk `progressEl` di line 161.

### Verification

- `node -c` semua file: ✅
- Smoke test endpoints `200`: ✅
- Tidak ada permission baru (background sudah punya `host_permissions: <all_urls>`).
- Telemetri tetap **opt-in** (E1 tidak ter-rollback).

---

## E13 — Modernisasi In-Page UI (progress bar + tombol download)

**Severity:** N/A (UI polish, bukan security)
**Status:** Done
**File:** `chrome-extension/page-inject.js` (style block)

### Reasoning

Tombol `.devnotes-dl-btn` dan panel `.devnotes-progress` masih pakai gaya
`#7c3aed` solid + border kotak + shadow flat — tidak konsisten dengan design
system popup/preview yang sudah modern.

### Fix

Style block di-rewrite dengan token yang sama seperti popup:

| Element | Sebelum | Sesudah |
|---------|---------|---------|
| `.devnotes-dl-btn` background | `rgba(30,30,60,0.92)` solid | Glass `rgba(17,19,30,0.85)` + `backdrop-filter: saturate(160%) blur(10px)` |
| `.devnotes-dl-btn` border | `1px solid #7c3aed` | `1px solid rgba(124,92,255,0.35)` + `border-radius: 999px` (pill) |
| Hover state | Flat color swap | Gradient `#7c5cff → #5b3df5` + lift `translateY(-1px)` + glow |
| `.devnotes-progress` | Border solid + flat shadow | Glass `blur(20px)` + double-shadow + drop-in animation |
| Progress fill | Gradient statis | Animated shimmer (`@keyframes devnotes-shimmer`) + glow |
| Tipografi | `sans-serif` generic | Modern stack (`-apple-system`, `Segoe UI Variable`, `Inter`) + tabular-nums untuk %|
| Z-index | `9999`/`99999` | `2147483646`/`2147483647` (max int — anti-overlap dengan modal halaman host) |
| A11y | Tidak ada | `@media (prefers-reduced-motion: reduce)` disable animasi/transisi |

### Verification

- `node -c page-inject.js`: ✅
- Tidak ubah class names / DOM structure → handler JS lama tetap bekerja.
- Tidak tambah dependency.
