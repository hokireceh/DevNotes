// Injected into the PAGE context (not isolated content script world)
// Technique: DOM observer + fetch download (same approach as Neet-Nestor open-source script)

(function () {
  if (window.__devnotesInjected) return;
  window.__devnotesInjected = true;

  const isTelegram = location.hostname.includes("telegram.org") || location.hostname.includes("telegram.app");
  const BTN_CLASS = "devnotes-dl-btn";
  const captured = new Map(); // blobUrl -> Blob reference
  const mseChunks = new Map();

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
      min-width: 220px;
    }
    .devnotes-progress-bar {
      height: 4px;
      background: #2a1a5e;
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }
    .devnotes-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      transition: width 0.3s;
    }
  `;
  document.head.appendChild(style);

  // ── Download helper with progress ──
  function downloadFromUrl(url, filename, token) {
    showProgress("Memulai download...", 0);
    fetch(url, { credentials: "include" })
      .then((res) => {
        const total = parseInt(res.headers.get("content-length") || "0");
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;

        function read() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              const mime = res.headers.get("content-type") || "video/mp4";
              const blob = new Blob(chunks, { type: mime });
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = filename || "telegram_media_" + Date.now();
              a.click();
              setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
              hideProgress();
              return;
            }
            chunks.push(value);
            received += value.length;
            const pct = total ? Math.round((received / total) * 100) : 0;
            const mb = (received / (1024 * 1024)).toFixed(1);
            showProgress(`⬇ ${mb} MB${total ? " / " + (total / (1024 * 1024)).toFixed(1) + " MB" : ""}`, pct);
            return read();
          });
        }
        return read();
      })
      .catch((e) => {
        hideProgress();
        showProgress("❌ Gagal: " + e.message, 0);
        setTimeout(hideProgress, 3000);
      });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "telegram_media_" + Date.now();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  let progressEl = null;
  function showProgress(msg, pct) {
    if (!progressEl) {
      progressEl = document.createElement("div");
      progressEl.className = "devnotes-progress";
      progressEl.innerHTML = `
        <div id="devnotes-msg">⬇ Downloading...</div>
        <div class="devnotes-progress-bar">
          <div class="devnotes-progress-fill" id="devnotes-fill" style="width:0%"></div>
        </div>`;
      document.body.appendChild(progressEl);
    }
    const msgEl = document.getElementById("devnotes-msg");
    const fill = document.getElementById("devnotes-fill");
    if (msgEl) msgEl.textContent = msg;
    if (fill) fill.style.width = pct + "%";
  }

  function hideProgress() {
    if (progressEl) { progressEl.remove(); progressEl = null; }
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

      const src = getUrl();
      if (!src) { alert("URL tidak ditemukan. Pastikan media sudah dimuat."); return; }

      btn.classList.add("loading");
      btn.innerHTML = "⏳ Loading...";

      if (src instanceof Blob) {
        downloadBlob(src, filename || "telegram_media.mp4");
        btn.classList.remove("loading");
        btn.innerHTML = "⬇ Download";
        return;
      }

      if (src.startsWith("blob:")) {
        const blobRef = captured.get(src);
        if (blobRef) {
          downloadBlob(blobRef, filename || "telegram_video.mp4");
          btn.classList.remove("loading");
          btn.innerHTML = "✅ Done";
          setTimeout(() => { btn.innerHTML = "⬇ Download"; btn.classList.remove("loading"); }, 2000);
        } else {
          btn.innerHTML = "❌ Blob expired";
          setTimeout(() => { btn.innerHTML = "⬇ Download"; btn.classList.remove("loading"); }, 3000);
        }
        return;
      }

      if (src.startsWith("http")) {
        downloadFromUrl(src, filename || "telegram_media_" + Date.now() + ".mp4");
        btn.classList.remove("loading");
        btn.innerHTML = "⬇ Download";
      }
    });

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(btn);
  }

  // ── Watch video elements (Telegram videos) ──
  function attachToVideo(video) {
    if (video.dataset.devnotesAttached) return;
    video.dataset.devnotesAttached = "1";

    const container = video.closest(".media-container, .message-media, .document-container, [class*='video'], [class*='media']") || video.parentElement;
    if (!container) return;

    addDownloadBtn(container, () => {
      const src = video.src || video.currentSrc;
      if (src) return src;
      // Check captured blobs
      for (const [url, blob] of captured.entries()) {
        if (video.src === url || video.currentSrc === url) return url;
      }
      return video.src || video.currentSrc || null;
    }, "telegram_video_" + Date.now() + ".mp4");
  }

  // ── Watch image elements (Telegram photos) ──
  function attachToImage(img) {
    if (img.dataset.devnotesAttached) return;
    if (!img.src || img.src.startsWith("data:")) return;
    if ((img.naturalWidth || img.width) < 150) return;
    const low = img.src.toLowerCase();
    if (low.includes("emoji") || low.includes("icon") || low.includes("sticker") || low.includes("avatar")) return;

    img.dataset.devnotesAttached = "1";

    const container = img.closest(".photo, .message-media, [class*='photo'], [class*='image'], [class*='media']") || img.parentElement;
    if (!container) return;

    const ext = img.src.split(".").pop().split("?")[0].slice(0, 4) || "jpg";
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
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Initial scan (delayed to wait for Telegram to render)
  setTimeout(scanDOM, 1000);
  setTimeout(scanDOM, 3000);

  // ── Hook URL.createObjectURL to keep blob references ──
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = origCreateObjectURL(obj);
    if (obj instanceof Blob) {
      const mime = obj.type || "";
      if (mime.startsWith("video/") || mime.startsWith("audio/") ||
        mime === "application/octet-stream" || mime.startsWith("image/")) {
        captured.set(url, obj);
        post("blob_captured", {
          blobUrl: url,
          size: obj.size,
          mime,
          kind: mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image",
          label: guessLabel(mime, obj.size)
        });
      }
    }
    return url;
  };

  // Don't revoke our captured blobs
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
      post("mse_start", { key: this._dnId, mime });
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
        post("mse_progress", { key, totalSize, mime: entry.mime });
      }
    } catch (e) {}
    return origAppend.call(this, chunk);
  };

  // ── Listen for download requests from popup ──
  window.addEventListener("__devnotes_download_request", function (e) {
    const { blobUrl, key } = e.detail;

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
          label: guessLabel(blob.type, blob.size)
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
      post("mse_ready_download", { type: "mse_ready_download", key, url, size: total, mime, label: "telegram_video_" + Date.now() + ".mp4" });
    }
  });

  // ── Helpers ──
  function post(type, data) {
    window.dispatchEvent(new CustomEvent("__devnotes_media", { detail: { type, ...data } }));
  }

  function isMediaUrl(url) {
    if (!url || typeof url !== "string") return false;
    const low = url.toLowerCase();
    return low.includes(".mp4") || low.includes(".webm") || low.includes(".mp3") ||
      low.includes(".ogg") || low.includes(".m4v") || low.includes(".m4a") ||
      low.includes("cdn.telegram") || low.includes("telegram-cdn") ||
      (low.includes("document") && (low.includes("video") || low.includes("file")));
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
