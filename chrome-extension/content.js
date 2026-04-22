// ─── Inject page-inject.js into the PAGE context (not isolated world) ───
(function injectPageScript() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-inject.js");
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {}
})();

// ─── Storage for captured media from page-inject.js ───
const capturedMedia = {
  blobs: [],      // { blobUrl, size, mime, kind, label }
  mse: [],        // { key, mime, totalSize } — MSE/streaming chunks
  fetchUrls: [],  // { url, label }
  xhrUrls: []     // { url, label }
};

// ─── Listen for events from page-inject.js ───
window.addEventListener("__devnotes_media", function (e) {
  const d = e.detail;
  if (!d) return;

  if (d.type === "blob_captured") {
    const exists = capturedMedia.blobs.find((b) => b.blobUrl === d.blobUrl);
    if (!exists) capturedMedia.blobs.push(d);
  }

  if (d.type === "blob_thumb") {
    const existing = capturedMedia.blobs.find((b) => b.blobUrl === d.blobUrl);
    if (existing && d.thumb) existing.thumb = d.thumb;
  }

  if (d.type === "mse_start" || d.type === "mse_progress") {
    const existing = capturedMedia.mse.find((m) => m.key === d.key);
    if (existing) {
      existing.totalSize = d.totalSize || existing.totalSize;
    } else {
      capturedMedia.mse.push({ key: d.key, mime: d.mime, totalSize: d.totalSize || 0 });
    }
  }

  if (d.type === "fetch_media" || d.type === "xhr_media") {
    const list = d.type === "fetch_media" ? capturedMedia.fetchUrls : capturedMedia.xhrUrls;
    if (!list.find((x) => x.url === d.url)) {
      list.push({ url: d.url, label: d.label });
    }
  }

  if (d.type === "mse_ready_download" || d.type === "blob_ready_download") {
    chrome.runtime.sendMessage({ type: "MEDIA_DOWNLOAD_READY", data: d });
  }
});

// ─── DOM scan (existing media elements) ───
function findEmailsOnPage() {
  // Note: regex used only via String.prototype.match() — never .test() with /g flag
  // (stateful lastIndex would cause flip-flop true/false across calls)
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matchAll = (str) => (str ? String(str).match(EMAIL_RE) || [] : []);

  // innerText (visible text) instead of innerHTML to avoid scanning <script>/<style>
  // source code and to dramatically reduce string size on large pages.
  const sourceText = document.body ? (document.body.innerText || "") : "";

  const inputEmails = [];
  document.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]').forEach((el) => {
    matchAll(el.value).forEach((m) => inputEmails.push(m.trim()));
  });

  const metaEmails = [];
  document.querySelectorAll("meta[content]").forEach((el) => {
    metaEmails.push(...matchAll(el.content));
  });

  const textMatches = matchAll(sourceText);
  const all = [...new Set([...inputEmails, ...metaEmails, ...textMatches])];

  return all.filter((e) => {
    const low = e.toLowerCase();
    return (
      !low.includes("example.com") &&
      !low.includes("test@") &&
      !low.includes("noreply") &&
      !low.includes("no-reply") &&
      !low.includes("@sentry") &&
      !low.endsWith(".png") &&
      !low.endsWith(".jpg") &&
      !low.endsWith(".svg")
    );
  });
}

function findMediaOnPage() {
  const results = {
    videos: [],
    images: [],
    audios: [],
    hasBlob: false,
    // Injected captures
    blobCaptures: capturedMedia.blobs,
    mseCaptures: capturedMedia.mse,
    directUrls: [...capturedMedia.fetchUrls, ...capturedMedia.xhrUrls]
  };

  // DOM <video> elements
  document.querySelectorAll("video").forEach((el) => {
    const src = el.src || el.currentSrc || el.querySelector("source")?.src || "";
    if (!src) return;
    if (src.startsWith("blob:")) {
      results.hasBlob = true;
      results.videos.push({ src, type: "blob", label: "Video (stream)", thumb: null });
    } else if (src.startsWith("http")) {
      results.videos.push({
        src,
        type: "video",
        label: src.split("/").pop().split("?")[0] || "video",
        thumb: null
      });
    }
  });

  // DOM <img> elements (meaningful only)
  const seenImg = new Set();
  document.querySelectorAll("img").forEach((el) => {
    const src = el.src || el.currentSrc || el.dataset.src || "";
    if (!src || seenImg.has(src)) return;
    if (src.startsWith("data:")) return;
    if ((el.naturalWidth || 0) < 80 || (el.naturalHeight || 0) < 80) return;
    const low = src.toLowerCase();
    if (low.includes("icon") || low.includes("logo") || low.includes("avatar") || low.includes("emoji")) return;
    seenImg.add(src);
    const isBlob = src.startsWith("blob:");
    if (isBlob) results.hasBlob = true;
    results.images.push({
      src,
      type: isBlob ? "blob" : "image",
      label: src.split("/").pop().split("?")[0] || "image.jpg",
      thumb: isBlob ? null : src
    });
  });

  // DOM <audio>
  document.querySelectorAll("audio").forEach((el) => {
    const src = el.src || el.currentSrc || el.querySelector("source")?.src || "";
    if (!src) return;
    const isBlob = src.startsWith("blob:");
    if (isBlob) results.hasBlob = true;
    results.audios.push({
      src,
      type: isBlob ? "blob" : "audio",
      label: src.split("/").pop().split("?")[0] || "audio"
    });
  });

  // Mark hasBlob if we have MSE captures
  if (capturedMedia.mse.length > 0) results.hasBlob = true;

  return results;
}

// ─── Message handler for popup ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCAN_EMAILS") {
    sendResponse({ emails: findEmailsOnPage() });
  }

  if (msg.type === "SCAN_MEDIA") {
    sendResponse(findMediaOnPage());
  }

  if (msg.type === "REQUEST_DOWNLOAD") {
    window.dispatchEvent(new CustomEvent("__devnotes_download_request", {
      detail: {
        blobUrl: msg.blobUrl,
        key: msg.key,
        directUrl: msg.directUrl,
        filename: msg.filename
      }
    }));
    sendResponse({ ok: true });
  }
});
