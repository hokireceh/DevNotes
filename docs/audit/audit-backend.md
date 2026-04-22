# Audit Backend — DevNotes Pro

**Sesi:** 2026-04-22
**Scope sesi ini:** `server.js`, `chrome-extension/background.js`, `chrome-extension/content.js`, `chrome-extension/manifest.json`, `chrome-extension/chrome-mock.js`
**Belum dibaca (untuk sesi berikutnya):** `chrome-extension/popup.js`, `chrome-extension/page-inject.js`, `chrome-extension/popup.html`, `chrome-extension/popup.css`, `preview.html`

---

## Daftar Temuan (urut prioritas)

| # | Severity | File | Status |
|---|----------|------|--------|
| 1 | Critical | `server.js` | Proposed |
| 2 | High     | `server.js` | Backlog |
| 3 | High     | `chrome-extension/content.js` | Backlog |
| 4 | High     | `chrome-extension/background.js` | Backlog |
| 5 | Medium   | `server.js` | Backlog |
| 6 | Medium   | `chrome-extension/content.js` | Backlog |
| 7 | Low      | `server.js` | Backlog |

---

## Issue #1 — Path Traversal di static file handler (Critical)

- **File:** `server.js` (baris 244–261)
- **Severity:** Critical
- **Masalah:**
  Handler statis menggabungkan `req.url` langsung ke `path.join(__dirname, ...)` tanpa normalisasi atau validasi prefix. Karena `path.join` mengevaluasi segmen `..`, request seperti `GET /../package.json`, `GET /../.git/config`, atau `GET /ext/../../etc/passwd` akan keluar dari direktori `__dirname` / `chrome-extension` dan **membaca file arbitrer di host**. Server ini di-expose lewat domain publik Replit (`0.0.0.0:5000`), jadi ini bisa dieksploitasi siapa pun yang tahu URL preview.

  Bukti perilaku (statis dari kode, tanpa eksekusi):
  - `urlPath` diambil dari `req.url.split("?")[0]` — tidak di-decode/normalize.
  - Branch `/ext/`: `path.join(__dirname, "chrome-extension", urlPath.slice(5))` — `..` di slice akan naik di luar `chrome-extension`.
  - Branch default: `path.join(__dirname, urlPath)` — `..` di awal akan naik di luar project root.
  - Tidak ada cek `resolved.startsWith(allowedRoot)`.

- **Sebelum:**
  ```js
  let filePath;
  if (urlPath.startsWith("/ext/")) {
    filePath = path.join(__dirname, "chrome-extension", urlPath.slice(5));
  } else {
    filePath = path.join(__dirname, urlPath);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...corsHeaders, "Content-Type": "text/plain" });
      res.end("Not found: " + urlPath);
      return;
    }
    ...
  });
  ```

- **Sesudah (usulan):**
  ```js
  // Decode & tolak segmen mencurigakan lebih awal
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400, corsHeaders);
    res.end("Bad path");
    return;
  }
  if (decodedPath.includes("\0")) {
    res.writeHead(400, corsHeaders);
    res.end("Bad path");
    return;
  }

  let baseDir, relPath;
  if (decodedPath.startsWith("/ext/")) {
    baseDir = path.join(__dirname, "chrome-extension");
    relPath = decodedPath.slice(5);
  } else {
    baseDir = __dirname;
    relPath = decodedPath.replace(/^\/+/, "");
  }

  const resolved = path.resolve(baseDir, relPath);
  // Pastikan hasil resolve masih di dalam baseDir
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
    res.writeHead(403, { ...corsHeaders, "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { ...corsHeaders, "Content-Type": "text/plain" });
      res.end("Not found: " + urlPath);
      return;
    }
    const ext = path.extname(resolved);
    const mime = mimeTypes[ext] || "text/plain";
    res.writeHead(200, { ...corsHeaders, "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(data);
  });
  ```

- **Risiko fix:**
  - Behavior valid (load `preview.html`, `/ext/popup.html`, dll) tetap jalan karena `path.resolve` tidak mengubah path normal selama tidak ada `..`.
  - Request yang sebelumnya “diam-diam berhasil” karena pakai `..` (tidak ada di kode kita) akan jadi `403` — risiko regresi rendah.
  - `decodeURIComponent` pada path yang tidak valid sekarang melempar `400`, sebelumnya akan ke `fs.readFile` dan jadi `404` — perubahan kecil yang lebih aman.

---

## Backlog (belum di-propose, menunggu approval issue sebelumnya)

### Issue #2 — Stored XSS di `/logs` viewer (High)
- **File:** `server.js` (baris 192–198)
- Field `e.level` dan `e.tag` dimasukkan ke template literal HTML tanpa escape (`class="log-${e.level}"`, `<span class="tag">${e.tag||''}</span>`). Endpoint `POST /log` menerima JSON dari sumber manapun (CORS `*`, tanpa auth), sehingga payload `{"level":"INFO\"><script>...","tag":"x","msg":"y"}` akan tereksekusi saat developer membuka `/logs`.

### Issue #3 — `RegExp /g` dengan `.test()` di `findEmailsOnPage` (High)
- **File:** `chrome-extension/content.js` (baris 57–63)
- `emailRegex` dideklarasi sekali dengan flag `g`. Pemanggilan `emailRegex.test(el.value)` di dalam `forEach` mempertahankan `lastIndex` antar iterasi → hasil bisa flip antara `true`/`false` walau input valid. Email valid bisa terlewat secara non-deterministik.

### Issue #4 — Logika `scheduleResetAlarm` salah untuk timezone non-WIB (High)
- **File:** `chrome-extension/background.js` (baris 14–34)
- Aritmatika `wibOffset + utcOffset`, lalu `setMinutes(... + totalOffset)`, lalu `setHours(7,0,0,0)` (yang dievaluasi di local time perangkat) menghasilkan target jam yang bukan 07:00 WIB untuk user di luar zona Asia/Jakarta. Cara benar: hitung target di UTC eksplisit (`Date.UTC(...)` dengan jam `0` UTC = 07:00 WIB) atau gunakan `Intl.DateTimeFormat` dengan `timeZone: "Asia/Jakarta"`.

### Issue #5 — `POST /log` tanpa batas ukuran body (Medium)
- **File:** `server.js` (baris 52–67)
- Body diakumulasi di string tanpa limit. Endpoint terbuka (CORS `*`) → siapa pun bisa mengirim payload besar dan menghabiskan memori proses.

### Issue #6 — Scan email pakai `document.documentElement.innerHTML` (Medium)
- **File:** `chrome-extension/content.js` (baris 58, 71)
- Serialize seluruh DOM ke string tiap scan: mahal di halaman besar dan menangkap teks dalam `<script>`/`<style>`/atribut tersembunyi yang seharusnya bukan email user-facing.

### Issue #7 — `sseClients` tidak dibatasi (Low)
- **File:** `server.js` (baris 19, 82–83)
- `Set` koneksi SSE bisa tumbuh tanpa batas; tiap log di-`write` ke setiap client → load O(n_clients × n_logs).

---

## Carry-over untuk sesi berikutnya
- Setelah issue Backend selesai, lanjut audit:
  1. `chrome-extension/popup.js` (570 baris) — kemungkinan besar berisi logic UI + storage.
  2. `chrome-extension/page-inject.js` (846 baris) — interceptor MSE/fetch/XHR di page context.
  3. `chrome-extension/popup.html` & `popup.css`.
  4. `preview.html`.
- Re-evaluasi prioritas Backend issue #2–#7 setelah issue #1 di-resolve.
