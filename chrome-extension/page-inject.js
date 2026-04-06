// Injected into the PAGE context (not isolated content script world)

(function () {
  if (window.__devnotesInjected) return;
  window.__devnotesInjected = true;

  const isTelegram = location.hostname.includes("telegram.org") || location.hostname.includes("telegram.app");
  const BTN_CLASS = "devnotes-dl-btn";
  const captured = new Map();
  const mseChunks = new Map();

  // ── Debug Logger ──
  const LOG_SERVER = "https://85a6b96c-6e57-4222-91e8-998b58832a53-00-2yrg86vsyb0g9.pike.replit.dev/log";
  let logQueue = [];
  let flushTimer = null;

  function dbg(level, tag, msg, data) {
    const entry = { level, tag, msg, data, ts: Date.now() };
    // Print to browser console too
    const style = { INFO: "color:#60a5fa", OK: "color:#34d399", WARN: "color:#fbbf24", ERROR: "color:#f87171", DEBUG: "color:#a78bfa" };
    console.log(`%c[DevNotes][${tag}] ${msg}`, style[level] || "", data !== undefined ? data : "");
    // Queue for server
    logQueue.push(entry);
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        const batch = logQueue.splice(0);
        flushTimer = null;
        fetch(LOG_SERVER, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch)
        }).catch(() => {});
      }, 300);
    }
  }

  const log = {
    info:  (tag, msg, data) => dbg("INFO",  tag, msg, data),
    ok:    (tag, msg, data) => dbg("OK",    tag, msg, data),
    warn:  (tag, msg, data) => dbg("WARN",  tag, msg, data),
    error: (tag, msg, data) => dbg("ERROR", tag, msg, data),
    debug: (tag, msg, data) => dbg("DEBUG", tag, msg, data),
  };

  // Expose status inspector di console: window.__devnotesStatus()
  window.__devnotesStatus = () => {
    const mseInfo = [];
    for (const [k, v] of mseChunks.entries()) {
      const sz = v.chunks.reduce((s, c) => s + c.byteLength, 0);
      mseInfo.push({ key: k, mime: v.mime, chunks: v.chunks.length, size: (sz/1024/1024).toFixed(2) + " MB" });
    }
    const blobInfo = [];
    for (const [url, b] of captured.entries()) {
      blobInfo.push({ url: url.slice(0, 60), mime: b.type, size: (b.size/1024/1024).toFixed(2) + " MB" });
    }
    console.table(mseInfo.length ? mseInfo : [{ info: "Belum ada MSE data" }]);
    console.table(blobInfo.length ? blobInfo : [{ info: "Belum ada blob data" }]);
    return { mse: mseInfo, blobs: blobInfo };
  };

  log.info("INIT", `DevNotes injected @ ${location.hostname}`, { isTelegram });

  // ── Style injection ──
  const style = document.createElement("style");
  style.textContent = `
    .${BTN_CLASS} {
      position: absolute;
      z-index: 9999;
      background: rgba(30, 30, 60, 0.92);
      color: #a78bfa;
      border: 1px solid #7c3aed;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(4px);
      transition: background 0.2s, color 0.2s;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }
    .${BTN_CLASS}:hover { background: #7c3aed; color: #fff; }
    .${BTN_CLASS}.loading { opacity: 0.6; cursor: not-allowed; }
    .devnotes-progress {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: rgba(15,15,26,0.95);
      border: 1px solid #7c3aed;
      border-radius: 10px;
      padding: 10px 16px;
      color: #a78bfa;
      font-size: 13px;
      font-family: sans-serif;
      box-shadow: 0 4px 20px rgba(124,58,237,0.3);
      min-width: 240px;
      max-width: 320px;
    }
    .devnotes-progress-bar {
      height: 5px;
      background: #2a1a5e;
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }
    .devnotes-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      transition: width 0.3s;
    }
    .devnotes-progress-pct {
      font-size: 11px;
      color: #c4b5fd;
      margin-top: 4px;
      text-align: right;
    }
  `;
  document.head.appendChild(style);

  // ── Progress UI ──
  let progressEl = null;
  function showProgress(msg, pct) {
    if (!progressEl) {
      progressEl = document.createElement("div");
      progressEl.className = "devnotes-progress";
      progressEl.innerHTML = `
        <div id="devnotes-msg">⬇ Downloading...</div>
        <div class="devnotes-progress-bar">
          <div class="devnotes-progress-fill" id="devnotes-fill" style="width:0%"></div>
        </div>
        <div class="devnotes-progress-pct" id="devnotes-pct">0%</div>`;
      document.body.appendChild(progressEl);
    }
    const msgEl = document.getElementById("devnotes-msg");
    const fill = document.getElementById("devnotes-fill");
    const pctEl = document.getElementById("devnotes-pct");
    if (msgEl) msgEl.textContent = msg;
    if (fill) fill.style.width = (pct || 0) + "%";
    if (pctEl) pctEl.textContent = (pct || 0) + "%";
  }
  function hideProgress() {
    if (progressEl) { progressEl.remove(); progressEl = null; }
  }

  // ── Auto-detect filename from URL ──
  function extractFilename(url, mime) {
    const ext = mime ? mime.split("/")[1]?.split(";")[0] || "mp4" : "mp4";
    try {
      if (url.includes("stream/")) {
        const raw = decodeURIComponent(url.substring(url.indexOf("stream/") + 7).split("?")[0]);
        const parsed = JSON.parse(raw);
        return parsed.fileName || (parsed.location?.id + "." + ext);
      }
      if (url.includes("progressive/")) {
        const parts = url.split("document").slice(1);
        return parts + "." + ext;
      }
      if (url.startsWith("blob:")) {
        const mime2 = mime || "video/mp4";
        const kind = mime2.startsWith("image/") ? "telegram_photo" : "telegram_video";
        return kind + "_" + Date.now() + "." + ext;
      }
      const pathname = new URL(url).pathname;
      const base = pathname.split("/").pop();
      if (base && base.includes(".")) return base;
    } catch {}
    return "telegram_video_" + Date.now() + "." + ext;
  }

  // ── Strategy 1: Segmented Parallel Download (for CDN/HTTP URLs) ──
  async function downloadSegmented(url, label) {
    log.info("DOWNLOAD", "Strategi: Segmented Parallel", { url: url.slice(0, 80) });
    showProgress("Mengecek ukuran file...", 0);
    try {
      const headRes = await fetch(url, { headers: { Range: "bytes=0-" } });
      if (!headRes.ok) throw new Error("HTTP error: " + headRes.status);

      const contentRange = headRes.headers.get("Content-Range");
      const contentLen = headRes.headers.get("Content-Length");
      const contentType = headRes.headers.get("Content-Type") || "video/mp4";
      const acceptRanges = headRes.headers.get("Accept-Ranges");

      log.debug("DOWNLOAD", "Header respons", { contentRange, contentLen, contentType, acceptRanges });

      if (!contentRange || acceptRanges !== "bytes") {
        log.warn("DOWNLOAD", "Server tidak support range → fallback ke streaming");
        return downloadStreaming(url, label);
      }

      const totalSize = parseInt(contentRange.split("/")[1], 10);
      const segSize = parseInt(contentLen, 10);
      const segCount = Math.ceil(totalSize / segSize);
      const filename = label || extractFilename(url, contentType);

      log.info("DOWNLOAD", `Total: ${(totalSize/1024/1024).toFixed(2)} MB, ${segCount} segmen`, { filename });
      showProgress(`Mempersiapkan ${segCount} segmen...`, 2);

      // Build fetch tasks per segment
      const tasks = Array(segCount).fill(0).map((_, i) => {
        const start = i * segSize;
        const end = Math.min(start + segSize - 1, totalSize - 1);
        return () => fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
          .then(res => {
            if (res.status === 408) throw Object.assign(new Error("fetch Error"), { cause: { index: i } });
            const pct = ((end / totalSize) * 100).toFixed(1);
            showProgress(`⬇ Mengunduh... ${pct}%`, parseFloat(pct));
            return res.arrayBuffer();
          });
      });

      // Execute in batches of 20 with retry on 408
      const BATCH = 20;
      const buffers = [];
      let idx = 0;
      while (idx < tasks.length) {
        const batch = tasks.slice(idx, idx + BATCH).map(t => t());
        try {
          const results = await Promise.all(batch);
          buffers.push(...results);
          idx += BATCH;
        } catch (err) {
          if (err instanceof Error && err.message === "fetch Error" && err.cause?.index != null) {
            idx = err.cause.index;
            await new Promise(r => setTimeout(r, 1000));
          } else {
            throw err;
          }
        }
      }

      showProgress("Menggabungkan file...", 98);
      const blob = new Blob(buffers, { type: contentType || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      log.ok("DOWNLOAD", `Selesai! ${(blob.size/1024/1024).toFixed(2)} MB → ${filename}`);
      showProgress("✅ Download selesai!", 100);
      setTimeout(hideProgress, 2500);
    } catch (e) {
      log.error("DOWNLOAD", "Segmented gagal: " + e.message);
      hideProgress();
      showProgress("❌ Gagal: " + e.message, 0);
      setTimeout(hideProgress, 3500);
    }
  }

  // ── Strategy 2: Range Sequential Download (for blob/stream URLs) ──
  function downloadRanged(url, label) {
    log.info("DOWNLOAD", "Strategi: Range Sequential", { url: url.slice(0, 80) });
    const RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;
    const chunks = [];
    let offset = 0;
    let totalSize = null;
    let filename = label || extractFilename(url, "video/mp4");
    let ext = "mp4";

    showProgress("Memulai range download...", 0);

    function fetchNext() {
      fetch(url, {
        method: "GET",
        headers: { Range: `bytes=${offset}-` }
      }).then(res => {
        if (![200, 206].includes(res.status))
          throw new Error("Status tidak valid: " + res.status);

        const ct = res.headers.get("Content-Type")?.split(";")[0] || "video/mp4";
        ext = ct.split("/")[1] || ext;
        if (!filename.includes(".")) filename += "." + ext;

        const rangeHeader = res.headers.get("Content-Range");
        const match = rangeHeader?.match(RANGE_RE);
        if (!match) throw new Error("Content-Range tidak ditemukan");

        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        const total = parseInt(match[3]);

        if (start !== offset) throw new Error("Gap terdeteksi antara respons range");
        if (totalSize && total !== totalSize) throw new Error("Ukuran total berubah");

        offset = end + 1;
        totalSize = total;

        const pct = ((offset / totalSize) * 100).toFixed(0);
        const mb = (offset / (1024 * 1024)).toFixed(1);
        const totalMb = (totalSize / (1024 * 1024)).toFixed(1);
        log.debug("RANGED", `Progress ${pct}% (${mb}/${totalMb} MB)`);
        showProgress(`⬇ ${mb} MB / ${totalMb} MB`, parseInt(pct));

        return res.blob();
      }).then(blob => {
        chunks.push(blob);
        if (!totalSize) throw new Error("Total ukuran NULL");

        if (offset < totalSize) {
          fetchNext();
        } else {
          showProgress("Menggabungkan file...", 99);
          const final = new Blob(chunks, { type: "video/mp4" });
          const blobUrl = URL.createObjectURL(final);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
          showProgress("✅ Download selesai!", 100);
          setTimeout(hideProgress, 2500);
        }
      }).catch(e => {
        hideProgress();
        showProgress("❌ Gagal: " + e.message, 0);
        setTimeout(hideProgress, 3500);
      });
    }

    fetchNext();
  }

  // ── Strategy 3: Streaming fallback (ReadableStream) ──
  function downloadStreaming(url, label) {
    log.info("DOWNLOAD", "Strategi: Streaming fallback", { url: url.slice(0, 80) });
    showProgress("Memulai streaming download...", 0);
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const total = parseInt(res.headers.get("content-length") || "0");
        const mime = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
        const filename = label || extractFilename(url, mime);
        log.info("DOWNLOAD", "Streaming dimulai", { total: (total/1024/1024).toFixed(2) + " MB", mime, filename });

        if (!res.body) throw new Error("Response body kosong / tidak ada ReadableStream");
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;

        function read() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              const blob = new Blob(chunks, { type: mime });
              log.ok("DOWNLOAD", `Streaming selesai! ${(blob.size/1024/1024).toFixed(2)} MB → ${filename}`);
              const blobUrl = origCreateObjectURL(blob); // pakai original, bypass hook
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = filename;
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              setTimeout(() => { a.remove(); origRevoke(blobUrl); }, 5000);
              showProgress("✅ Selesai! " + (blob.size/1024/1024).toFixed(1) + " MB", 100);
              setTimeout(hideProgress, 2500);
              return;
            }
            chunks.push(value);
            received += value.byteLength;
            const pct = total ? Math.round((received / total) * 100) : 0;
            const mb = (received / (1024 * 1024)).toFixed(1);
            const totalMb = total ? " / " + (total / (1024 * 1024)).toFixed(1) + " MB" : "";
            showProgress(`⬇ Streaming ${mb}${totalMb} MB`, pct);
            return read();
          }).catch(e => {
            log.error("DOWNLOAD", "Error saat baca stream: " + e.message);
            throw e;
          });
        }
        return read();
      })
      .catch(e => {
        log.error("DOWNLOAD", "Streaming gagal: " + e.message, { url: url.slice(0, 80) });
        // Jika CORS/network error dan ada MSE chunks → gunakan MSE
        if (mseChunks.size > 0) {
          let totalKb = 0;
          for (const [, entry] of mseChunks) totalKb += entry.chunks.reduce((s, c) => s + c.byteLength, 0) / 1024;
          if (totalKb >= 100) {
            log.info("DOWNLOAD", `Streaming gagal → fallback MSE (${totalKb.toFixed(0)} KB tersedia)`);
            showProgress("↩ Fallback ke MSE chunks...", 10);
            tryMseDownload(label);
            return;
          }
        }
        showProgress("❌ Gagal: " + e.message.slice(0, 60), 0);
        setTimeout(hideProgress, 4000);
      });
  }

  // ── Smart download dispatcher ──
  function smartDownload(src, filename) {
    log.info("SMART", "Memilih strategi...", { src: typeof src === "string" ? src.slice(0, 80) : typeof src, filename });

    if (src instanceof Blob) {
      log.ok("SMART", "Tipe: Blob langsung");
      downloadBlob(src, filename);
      return;
    }

    if (typeof src !== "string") {
      log.warn("SMART", "src bukan string → coba MSE", { type: typeof src });
      tryMseDownload(filename);
      return;
    }

    // Blob URL dari Blob biasa (bukan MediaSource)
    if (src.startsWith("blob:")) {
      const blobRef = captured.get(src);
      if (blobRef) {
        log.ok("SMART", "Blob URL ada di cache → download langsung");
        downloadBlob(blobRef, filename);
        return;
      }
      // Blob URL dari DOM (sebelum extension load) — coba MSE dulu, lalu range
      if (mseChunks.size > 0) {
        log.info("SMART", "Blob dari DOM + ada MSE → pakai MSE chunks");
        tryMseDownload(filename);
        return;
      }
      log.info("SMART", "Blob dari DOM → Range Sequential", { src: src.slice(0, 60) });
      downloadRanged(src, filename);
      return;
    }

    if (src.startsWith("http")) {
      // Validasi: skip jika URL bukan media (misal URL halaman web biasa)
      const srcLow = src.toLowerCase();
      const looksLikeMedia = srcLow.match(/\.(mp4|webm|m3u8|mp3|ogg|m4v|m4a|ts|mkv|avi|mov|flv)(\?|$)/) ||
        srcLow.includes("stream") || srcLow.includes("video") || srcLow.includes("media") ||
        srcLow.includes("cdn") || srcLow.includes("download") || srcLow.includes("file");
      if (!looksLikeMedia) {
        log.warn("SMART", "URL tidak terlihat seperti media, lewati", { src: src.slice(0, 80) });
        showProgress("❌ URL bukan file media yang bisa diunduh.", 0);
        setTimeout(hideProgress, 3000);
        return;
      }
      // Cek MSE dulu — jika sudah terkumpul cukup data (> 500 KB), lebih andal dari HTTP
      if (mseChunks.size > 0) {
        let totalMseKb = 0;
        for (const [, entry] of mseChunks) {
          totalMseKb += entry.chunks.reduce((s, c) => s + c.byteLength, 0) / 1024;
        }
        if (totalMseKb >= 500) {
          log.ok("SMART", `MSE sudah ada ${totalMseKb.toFixed(0)} KB → pakai MSE, skip HTTP`);
          tryMseDownload(filename);
          return;
        }
      }
      log.ok("SMART", "HTTP URL → Segmented Parallel");
      downloadSegmented(src, filename);
      return;
    }

    // URL relatif Telegram: stream/... atau progressive/...
    if (src.startsWith("stream/") || src.startsWith("progressive/") || src.includes("stream/")) {
      const fullUrl = location.origin + "/" + src;
      log.ok("SMART", "Telegram stream URL → resolv ke absolute", { fullUrl: fullUrl.slice(0, 100) });
      downloadSegmented(fullUrl, filename);
      return;
    }

    // URL tidak dikenali — coba MSE
    log.warn("SMART", "URL tidak dikenali", { prefix: src.slice(0, 30), mseChunks: mseChunks.size });
    if (mseChunks.size > 0) {
      log.info("SMART", "Fallback ke MSE chunks");
      tryMseDownload(filename);
      return;
    }

    log.error("SMART", "Tidak ada strategi yang bisa digunakan");
    showProgress("❌ Tidak ada media yang bisa diunduh. Putar videonya dulu.", 0);
    setTimeout(hideProgress, 3500);
  }

  // ── Download dari MSE chunks yang sudah terkumpul ──
  function tryMseDownload(filename) {
    log.info("MSE", `Mencoba MSE download, entries: ${mseChunks.size}`);
    if (mseChunks.size === 0) {
      log.warn("MSE", "Tidak ada MSE data");
      showProgress("❌ Belum ada data video. Putar video sampai selesai, lalu coba lagi.", 0);
      setTimeout(hideProgress, 3500);
      return;
    }
    // Ambil MSE entry terbesar (kemungkinan besar video utama)
    let bestKey = null;
    let bestSize = 0;
    for (const [key, entry] of mseChunks.entries()) {
      const size = entry.chunks.reduce((s, c) => s + c.byteLength, 0);
      log.debug("MSE", `Entry ${key}: ${entry.chunks.length} chunks, ${(size/1024/1024).toFixed(2)} MB, mime: ${entry.mime}`);
      if (size > bestSize) { bestSize = size; bestKey = key; }
    }
    if (!bestKey) {
      log.warn("MSE", "bestKey null meski mseChunks.size > 0");
      showProgress("❌ Data video belum cukup. Putar video lebih lama, lalu coba lagi.", 0);
      setTimeout(hideProgress, 3500);
      return;
    }
    const entry = mseChunks.get(bestKey);
    showProgress("Menggabungkan data video...", 60);
    const total = entry.chunks.reduce((s, c) => s + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of entry.chunks) { merged.set(c, off); off += c.byteLength; }
    const mime = (entry.mime.split(";")[0].trim()) || "video/mp4";
    const blob = new Blob([merged], { type: mime });
    log.ok("MSE", `Blob siap: ${(total/1024/1024).toFixed(2)} MB, mime: ${mime}`);
    showProgress(`✅ Siap! ${(total / (1024 * 1024)).toFixed(1)} MB`, 100);
    downloadBlob(blob, filename || "telegram_video_" + Date.now() + ".mp4");
    setTimeout(hideProgress, 2500);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "telegram_media_" + Date.now();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showProgress("✅ Download dimulai!", 100);
    setTimeout(hideProgress, 2000);
  }

  // ── Add download button to a container element ──
  function addDownloadBtn(container, getUrl, filename, position = { bottom: "8px", right: "8px" }) {
    if (container.querySelector("." + BTN_CLASS)) return;

    const btn = document.createElement("button");
    btn.className = BTN_CLASS;
    btn.innerHTML = "⬇ Download";
    Object.assign(btn.style, { bottom: position.bottom, right: position.right });
    btn.title = "DevNotes Pro — Download media";

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.classList.contains("loading")) return;

      btn.classList.add("loading");
      btn.innerHTML = "⏳ Memulai...";

      const src = getUrl();

      // Jika tidak ada URL langsung, coba MSE (video streaming Telegram)
      if (!src) {
        if (mseChunks.size > 0) {
          tryMseDownload(filename);
        } else {
          showProgress("⚠️ Putar video terlebih dahulu agar data terkumpul, lalu coba lagi.", 0);
          setTimeout(hideProgress, 4000);
        }
        setTimeout(() => { btn.classList.remove("loading"); btn.innerHTML = "⬇ Download"; }, 3000);
        return;
      }

      smartDownload(src, filename);

      setTimeout(() => {
        btn.classList.remove("loading");
        btn.innerHTML = "⬇ Download";
      }, 3000);
    });

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(btn);
  }

  // ── Watch video elements ──
  function attachToVideo(video) {
    if (video.dataset.devnotesAttached) return;

    // Skip video thumbnail/preview kecil (< 80px) — bukan video utama
    const w = video.videoWidth || video.offsetWidth || video.clientWidth || 0;
    const h = video.videoHeight || video.offsetHeight || video.clientHeight || 0;
    if (w > 0 && w < 80) return;
    if (h > 0 && h < 80) return;

    // Skip video yang tidak visible sama sekali
    const style = window.getComputedStyle(video);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

    video.dataset.devnotesAttached = "1";

    const container = video.closest(
      ".media-container, .message-media, .document-container, [class*='video'], [class*='media']"
    ) || video.parentElement;
    if (!container) return;

    const videoPrefix = isTelegram ? "telegram_video_" : "video_";
    addDownloadBtn(container, () => {
      const src = video.src || video.currentSrc;
      if (src) return src;
      for (const [url] of captured.entries()) {
        if (video.src === url || video.currentSrc === url) return url;
      }
      return video.src || video.currentSrc || null;
    }, videoPrefix + Date.now() + ".mp4");
  }

  // ── Watch image elements ──
  function attachToImage(img) {
    if (img.dataset.devnotesAttached) return;
    if (!img.src || img.src.startsWith("data:")) return;
    if ((img.naturalWidth || img.width) < 150) return;
    const low = img.src.toLowerCase();
    if (low.includes("emoji") || low.includes("icon") || low.includes("sticker") || low.includes("avatar")) return;

    img.dataset.devnotesAttached = "1";

    const container = img.closest(
      ".photo, .message-media, [class*='photo'], [class*='image'], [class*='media']"
    ) || img.parentElement;
    if (!container) return;

    const rawSrc = img.src || img.currentSrc || "";
    const ext = rawSrc.startsWith("blob:") || rawSrc.startsWith("data:")
      ? "jpg"
      : rawSrc.split(".").pop().split("?")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 4) || "jpg";
    addDownloadBtn(container, () => img.src || img.currentSrc, "telegram_photo_" + Date.now() + "." + ext);
  }

  // ── DOM observer ──
  function scanDOM() {
    document.querySelectorAll("video").forEach(attachToVideo);
    if (isTelegram) {
      document.querySelectorAll("img").forEach(attachToImage);
    }
  }

  const observer = new MutationObserver(() => scanDOM());
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  setTimeout(scanDOM, 1000);
  setTimeout(scanDOM, 3000);

  // ── Hook URL.createObjectURL ──
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = origCreateObjectURL(obj);
    if (obj instanceof Blob) {
      const mime = obj.type || "";
      const size = obj.size || 0;

      const isVideo = mime.startsWith("video/");
      const isAudio = mime.startsWith("audio/");
      const isOctet = mime === "application/octet-stream";
      const isImage = mime.startsWith("image/") && !mime.includes("svg");

      // Skip: SVG (UI element), blob < 10KB untuk gambar, blob < 50KB untuk audio
      const tooSmall = (isImage && size < 10240) || (isAudio && size < 51200);
      const isSvg = mime.includes("svg");

      if ((isVideo || isAudio || isOctet || isImage) && !isSvg && !tooSmall) {
        captured.set(url, obj);
        const blobKind = isVideo ? "video" : isAudio ? "audio" : "image";
        log.ok("BLOB", `Blob tertangkap: ${(size/1024/1024).toFixed(2)} MB, mime: ${mime}`);
        post("blob_captured", {
          blobUrl: url,
          size,
          mime,
          kind: blobKind,
          label: guessLabel(mime, size),
          thumb: null
        });
        if (blobKind === "video") {
          generateVideoThumb(url, (thumb) => {
            if (thumb) post("blob_thumb", { blobUrl: url, thumb });
          });
        }
      }
    } else {
      log.debug("BLOB", `createObjectURL dari MediaSource (bukan Blob)`);
    }
    return url;
  };

  // Don't revoke captured blobs
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function (url) {
    if (!captured.has(url)) origRevoke(url);
  };

  // ── Hook fetch for CDN URL interception ──
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (isMediaUrl(url)) {
      post("fetch_media", { url, label: urlLabel(url) });
    }
    return origFetch.apply(this, arguments);
  };

  // ── Hook XHR ──
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isMediaUrl(url)) {
      post("xhr_media", { url, label: urlLabel(url) });
    }
    return origOpen.apply(this, arguments);
  };

  // ── Hook MSE for chunk collection ──
  const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (mime) {
    const sb = origAddSourceBuffer.call(this, mime);
    sb._ms = this;
    if (!this._dnId) this._dnId = "mse_" + Date.now();
    if (mime.startsWith("video/") || mime.includes("mp4") || mime.includes("webm")) {
      log.info("MSE", `SourceBuffer baru (video): ${mime}`, { key: this._dnId });
      post("mse_start", { key: this._dnId, mime });
    } else {
      log.debug("MSE", `SourceBuffer baru (bukan video): ${mime}`);
    }
    return sb;
  };

  const origAppend = SourceBuffer.prototype.appendBuffer;
  SourceBuffer.prototype.appendBuffer = function (chunk) {
    try {
      const ms = this._ms;
      if (ms && ms._dnId) {
        const key = ms._dnId;
        if (!mseChunks.has(key)) mseChunks.set(key, { chunks: [], mime: this.mimeType || "" });
        const entry = mseChunks.get(key);
        const data = chunk instanceof ArrayBuffer ? chunk : chunk.buffer;
        entry.chunks.push(new Uint8Array(data));
        const totalSize = entry.chunks.reduce((s, c) => s + c.byteLength, 0);
        // Log setiap 10 chunks agar tidak terlalu banyak
        if (entry.chunks.length % 10 === 0) {
          log.debug("MSE", `appendBuffer: ${entry.chunks.length} chunks, total ${(totalSize/1024).toFixed(0)} KB`, { key });
        }
        post("mse_progress", { key, totalSize, mime: entry.mime });
      }
    } catch (e) {}
    return origAppend.call(this, chunk);
  };

  // ── Listen for download requests from popup ──
  window.addEventListener("__devnotes_download_request", function (e) {
    const { blobUrl, key, directUrl, filename } = e.detail;

    if (directUrl) {
      smartDownload(directUrl, filename);
      return;
    }

    if (blobUrl && captured.has(blobUrl)) {
      const blob = captured.get(blobUrl);
      const reader = new FileReader();
      reader.onload = () => {
        post("blob_ready_download", {
          type: "blob_ready_download",
          blobUrl,
          dataUrl: reader.result,
          mime: blob.type,
          size: blob.size,
          label: filename || guessLabel(blob.type, blob.size)
        });
      };
      reader.readAsDataURL(blob);
    }

    if (key && mseChunks.has(key)) {
      const entry = mseChunks.get(key);
      if (!entry.chunks.length) return;
      const total = entry.chunks.reduce((s, c) => s + c.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of entry.chunks) { merged.set(c, off); off += c.byteLength; }
      const mime = entry.mime.split(";")[0].trim() || "video/mp4";
      const blob = new Blob([merged], { type: mime });
      const url = origCreateObjectURL(blob);
      post("mse_ready_download", {
        type: "mse_ready_download",
        key, url, size: total, mime,
        label: filename || "telegram_video_" + Date.now() + ".mp4"
      });
    }
  });

  // ── Helpers ──
  function post(type, data) {
    window.dispatchEvent(new CustomEvent("__devnotes_media", { detail: { type, ...data } }));
  }

  function generateVideoThumb(blobUrl, callback) {
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px;left:-9999px";
      document.body.appendChild(video);
      const cleanup = () => { try { video.remove(); } catch(e){} };
      const onReady = () => {
        try {
          const w = video.videoWidth || 320, h = video.videoHeight || 180;
          const tw = 160, th = Math.round((h / w) * tw);
          const canvas = document.createElement("canvas");
          canvas.width = tw; canvas.height = th || 90;
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL("image/jpeg", 0.72);
          cleanup();
          callback(thumb.length > 100 ? thumb : null);
        } catch(e) { cleanup(); callback(null); }
      };
      video.addEventListener("seeked", onReady, { once: true });
      video.addEventListener("loadeddata", () => { video.currentTime = Math.min(1, video.duration * 0.1 || 0); }, { once: true });
      video.addEventListener("error", () => { cleanup(); callback(null); }, { once: true });
      video.src = blobUrl;
      video.load();
      setTimeout(() => { cleanup(); callback(null); }, 4000);
    } catch(e) { callback(null); }
  }

  function isMediaUrl(url) {
    if (!url || typeof url !== "string") return false;
    const low = url.toLowerCase();
    return (
      low.includes(".mp4") || low.includes(".webm") || low.includes(".mp3") ||
      low.includes(".ogg") || low.includes(".m4v") || low.includes(".m4a") ||
      low.includes("cdn.telegram") || low.includes("telegram-cdn") ||
      (low.includes("document") && (low.includes("video") || low.includes("file"))) ||
      low.includes("stream/") || low.includes("progressive/")
    );
  }

  function urlLabel(url) {
    try { const u = new URL(url); return u.pathname.split("/").pop() || u.hostname; }
    catch { return url.slice(0, 50); }
  }

  function guessLabel(mime, size) {
    const s = size > 1048576 ? (size / 1048576).toFixed(1) + " MB" : (size / 1024).toFixed(0) + " KB";
    if (mime.includes("mp4")) return "video_" + Date.now() + ".mp4 (" + s + ")";
    if (mime.includes("webm")) return "video_" + Date.now() + ".webm (" + s + ")";
    if (mime.includes("audio")) return "audio_" + Date.now() + ".mp3 (" + s + ")";
    if (mime.includes("image")) return "image_" + Date.now() + "." + (mime.split("/")[1] || "jpg") + " (" + s + ")";
    return "media_" + Date.now() + " (" + s + ")";
  }

})();
