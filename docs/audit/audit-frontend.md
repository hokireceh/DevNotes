# Audit Frontend — DevNotes Pro

**Sesi:** 2026-04-22
**Scope:** `chrome-extension/popup.html`, `chrome-extension/popup.css`, `preview.html`
**Mode:** Bulk-approval (diteruskan dari sesi extension)

---

## Ringkasan Status

| File | Status |
|------|--------|
| `chrome-extension/popup.html` | ✅ Bersih — tidak ada issue Critical/High/Medium |
| `chrome-extension/popup.css`  | ✅ Bersih — tidak ada issue Critical/High/Medium |
| `preview.html`                | ✅ Bersih — tidak ada issue Critical/High/Medium |

Tidak ada fix yang dieksekusi di file-file ini sesi ini. Issue yang ditemukan saat review ada di JS extension (F1–F5) dan dilaporkan di `docs/audit/audit-extension.md` Sesi 2.

---

## Detail Review

### `chrome-extension/popup.html`

- Struktur semantic standar (`<header>`, `<main>`, `<footer>`, `<section>`, `<button>`).
- Tidak ada inline event handler (`onclick=`, `onerror=`, dst.) → konsisten dengan default CSP MV3 (`script-src 'self'; object-src 'self'`). Referensi: [Manifest V3 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
- Tidak ada inline `<script>` block — hanya `<script src="chrome-mock.js">` dan `<script src="popup.js">` yang di-load via file lokal. Sah.
- `chrome-mock.js` di-ship ke production tetapi memiliki guard:
  ```js
  if (typeof chrome !== "undefined") return;
  ```
  Jadi di Chrome asli, IIFE early-return. Hanya overhead beberapa byte parser. **Catatan (advisory, tidak fix):** lebih bersih bila script ini di-exclude dari build production via build step, tapi proyek ini tidak punya build pipeline → biarkan.
- Atribut `data-tab` dipakai konsisten (di-validasi di `popup.js` lewat whitelist `validTabs`) → tidak ada vektor injection lewat `setActiveTab(name)`.
- Inline `style="..."` muncul di beberapa elemen kecil (logo wrapper). MV3 default CSP **mengizinkan** inline style (`style-src 'self' 'unsafe-inline'` di-implicit untuk extension pages) → tidak diblok. Acceptable.

### `chrome-extension/popup.css`

- Pure presentational stylesheet. Tidak ada `@import url(...)` ke domain eksternal → tidak ada network call dari CSS.
- Tidak ada `url(javascript:...)` atau pola berbahaya lain.
- Selector `.tab-btn:hover { color: #a78bfa; }` dst. — standar.
- Komponen punya state class yang konsisten dengan handler di `popup.js`.

### `preview.html`

- Static landing page server preview. Tidak di-deploy ke end-user; hanya muncul saat developer membuka root server.
- `<iframe src="/ext/popup.html">` — same-origin (server yang sama). Tidak ada `sandbox` attribute, tapi karena kontennya popup extension yang dimaintain sendiri di repo, **bukan risk**. Bila kelak preview.html dipakai untuk mengembed popup user-supplied, harus tambah `sandbox="allow-scripts"`.
- `<a href="/download">` — endpoint `/download` di `server.js` mem-stream `chrome-extension.tar.gz`. Sudah path-restricted via fix B1.
- Inline `<style>` block: hanya CSS, bukan script. CSP page tidak diset (page biasa Node.js HTTP), tapi `preview.html` tidak menyimpan kredensial / sesi → low risk.

---

## Carry-over Frontend

Tidak ada. Semua file frontend dalam scope sudah ter-review.
