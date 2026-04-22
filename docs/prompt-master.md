# Prompt Master — Audit DevNotes Pro

Dokumen ini adalah **kontrak tetap** antara user dan agent untuk semua sesi audit kode di proyek ini. Agent wajib mengikuti aturan di sini sebelum melakukan apapun.

---

## 1. Aturan Kerja

- **Baca dulu**, simpulkan kemudian. Jangan asumsikan behavior kode tanpa membaca file aslinya.
- Setiap sesi: laporkan **maksimal 10 issue teratas** by priority. Sisanya dicatat di carry-over untuk sesi berikutnya.
- **Satu issue = satu propose = satu approval.** Tidak boleh bundling fix kecuali user secara eksplisit mengijinkan bulk-execution dalam pesannya.
- Jika menemukan issue tambahan saat sedang membaca file, **catat saja — jangan fix tanpa lapor dulu**.
- Di akhir setiap sesi, output **carry-over list** untuk sesi berikutnya.
- Code dan field names **tetap dalam Bahasa Inggris**. Reasoning/penjelasan dalam **Bahasa Indonesia**.
- Setiap perubahan kode harus berdasarkan **dokumentasi resmi API** yang relevan (Chrome Extensions MV3, Node.js stdlib, Web APIs), **bukan asumsi**.
- Setelah setiap fix: kode harus **clean** (lulus `node -c` / parser, tidak ada syntax error, tidak ada regresi obvious pada smoke test).

## 2. Severity Rubric

| Level    | Definisi singkat |
|----------|------------------|
| **Critical** | Eksploitasi jarak jauh tanpa auth, kebocoran data user, RCE, atau kerusakan irreversible. Wajib fix segera. |
| **High**     | Bug fungsional yang membuat fitur utama salah hasil, atau celah keamanan yang butuh kondisi tertentu untuk dieksploitasi. |
| **Medium**   | Perilaku tidak optimal, DoS lokal, performance issue terlihat, masalah keamanan defense-in-depth. |
| **Low**      | Kode bau (code smell), inefisiensi minor, hardening tambahan, atau usability tweak. |

## 3. Alur Per Issue

### Step — Propose
Format laporan WAJIB:
- **File:** path lengkap
- **Severity:** Critical / High / Medium / Low
- **Masalah:** apa yang salah dan mengapa (referensi baris)
- **Sebelum:** potongan kode bermasalah
- **Sesudah:** potongan kode usulan
- **Risiko fix:** ada side effect / regresi mungkin?

### Step — Eksekusi
Tunggu approval user. Setelah approve:
1. Apply edit dengan `edit` tool (preserve indentation/exact match).
2. Verifikasi dengan `node -c` untuk JS, atau parser yang relevan untuk bahasa lain.
3. Smoke test endpoint / behavior yang terkena impact (curl, restart workflow, dll).
4. Update audit log file dengan status `Fixed` + commit hash bila ada.

## 4. Output Log

- Hasil setiap audit disimpan di: `docs/audit/audit-{engine}.md`
  - `{engine}` = scope auditor: `backend`, `extension`, `frontend`, `database`, dst.
- Struktur file audit:
  1. Header (sesi, scope, file yang dibaca, file yang belum dibaca)
  2. Tabel daftar temuan (ID, severity, file, status)
  3. Detail per issue (Propose + setelah eksekusi: status Fixed + diff ringkas)
  4. Carry-over untuk sesi berikutnya

## 5. Default Scope Order

Bila tidak ada carry-over di `docs/audit/`, mulai audit dengan urutan:
1. **Backend** — server-side code (`server.js`, route handlers, dll)
2. **Database** — schema, queries, migrations (jika ada)
3. **Frontend** — UI code (HTML/CSS/JS popup, page-inject, dll)

## 6. Mode Eksekusi

Default: **propose-then-approve per issue**. User dapat secara eksplisit memberikan **bulk approval** dengan instruksi seperti "approve dan lanjut sampai semua selesai" — dalam mode ini agent boleh batch fix dengan tetap menjalankan verifikasi `node -c` + smoke test setelah setiap kelompok fix, lalu hanya melaporkan ringkasan akhir.

## 7. Yang TIDAK Boleh

- Mengubah dependency (`package.json`, install paket baru) tanpa persetujuan eksplisit.
- Menambahkan analytics, telemetry, atau network call ke server eksternal di kode yang dikirim ke end-user (extension yang di-load Chrome user).
- Menyentuh kode di luar scope issue yang sedang di-fix (jangan refactor sambil lewat).
- Membuat file dokumentasi baru kecuali user minta.
