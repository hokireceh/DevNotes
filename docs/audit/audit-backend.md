# Audit Backend — DevNotes Pro

**Sesi:** 2026-04-22
**Scope sesi ini:** `server.js`
**Mode:** Bulk-approval (user otorisasi semua fix sekaligus)

---

## Ringkasan Status

| ID | Severity | File      | Status   |
|----|----------|-----------|----------|
| B1 | Critical | server.js | ✅ Fixed |
| B2 | High     | server.js | ✅ Fixed |
| B3 | Medium   | server.js | ✅ Fixed |
| B4 | Low      | server.js | ✅ Fixed |

Semua issue Backend yang tercatat di sesi ini sudah di-fix dan kode lulus `node -c` + smoke test.

---

## B1 — Path Traversal di static file handler (Critical) ✅

- **File:** `server.js` (sebelumnya baris 244–261)
- **Masalah:**
  Handler statis menggabungkan `req.url` langsung ke `path.join(__dirname, ...)` tanpa normalisasi atau validasi prefix. `path.join` mengevaluasi `..`, sehingga request seperti `GET /../package.json` atau `GET /ext/../../etc/passwd` akan keluar dari direktori yang diizinkan dan **membaca file arbitrer dari host**. Server di-bind ke `0.0.0.0:5000` dan diekspos lewat domain publik Replit.
- **Fix:**
  - `decodeURIComponent` + reject NUL byte di awal.
  - Pisahkan `baseDir` (`__dirname` atau `__dirname/chrome-extension`) dan `relPath`.
  - `path.resolve(baseDir, relPath)` lalu cek `resolved.startsWith(baseDir + sep)` (kecuali tepat sama dengan baseDir). Kalau gagal → `403 Forbidden`.
- **Smoke test (post-fix):**
  | Request | Hasil |
  |---|---|
  | `GET /` | `200` |
  | `GET /ext/popup.html` | `200` |
  | `GET /../package.json` | `403` |
  | `GET /ext/../../etc/passwd` | `403` |
  | `GET /ext/..%2f..%2fetc%2fpasswd` (URL-encoded) | `403` |

---

## B2 — Stored XSS di `/logs` viewer (High) ✅

- **File:** `server.js` (sebelumnya baris 192–198 di template HTML viewer)
- **Masalah:**
  Field `e.level`, `e.tag` di-interpolasi ke template HTML tanpa escape (`class="log-${e.level}"`, `<span class="tag">${e.tag||''}</span>`). Endpoint `POST /log` terbuka (CORS `*`, tanpa auth), jadi payload JSON `{"level":"X\"><script>...","tag":"y","msg":"z"}` akan **tereksekusi** saat developer membuka `/logs`.
- **Fix:**
  - Whitelist `e.level` ke `['INFO','OK','WARN','ERROR','DEBUG']` untuk dipakai di nama class. Default fallback `INFO`.
  - `escHtml()` diterapkan ke `e.level` dan `e.tag` saat ditampilkan sebagai teks.
  - `e.msg` dan `JSON.stringify(e.data)` sudah di-escape sebelumnya — tetap.

---

## B3 — `POST /log` tanpa batas ukuran body (Medium) ✅

- **File:** `server.js` (handler `POST /log`)
- **Masalah:**
  Body diakumulasi di string tanpa batas. Endpoint terbuka → siapa pun bisa kirim payload besar dan menghabiskan memori proses (DoS).
- **Fix:**
  - `MAX_BODY = 256 KB`.
  - Saat akumulasi melewati batas: balas `413 Payload too large`, set `aborted=true`, dan `req.destroy()`.
  - Handler `req.on("end")` melakukan early-return jika `aborted`.
- **Smoke test:** body ~400 KB → respon `413`.

---

## B4 — `sseClients` tidak dibatasi jumlahnya (Low) ✅

- **File:** `server.js` (handler `GET /logs-stream`)
- **Masalah:**
  `Set` koneksi SSE bisa tumbuh tanpa batas; tiap log di-`write` ke setiap client → load O(clients × logs), serta tiap koneksi memegang file descriptor.
- **Fix:**
  - `MAX_SSE = 20`. Bila penuh, server membalas `503 Too many SSE clients`.

---

## Carry-over untuk sesi berikutnya

Tidak ada issue Backend tersisa. Lihat juga `docs/audit/audit-extension.md` untuk lanjutan audit Chrome Extension (background.js, content.js, page-inject.js, popup.js).

Calon scope berikutnya:
- `popup.html` & `popup.css` — review accessibility / CSS.
- `preview.html` — review HTML preview page.
- (Tidak ada DB di proyek ini → skip "Database" stage.)
