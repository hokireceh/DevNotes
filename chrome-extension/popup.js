const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeTab = "notes";
let currentMediaFilter = "all";
let allMediaData = {
  videos: [], images: [], audios: [], hasBlob: false,
  blobCaptures: [], mseCaptures: [], directUrls: []
};

function showTab(name) {
  $$(".tab-btn").forEach((b) => b.classList.remove("active"));
  $$(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
  $(`#tab-${name}`).classList.add("active");
  activeTab = name;
  if (name === "notes") renderNotes();
  if (name === "emails") renderEmails();
  if (name === "snippets") renderSnippets();
}

$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2500);
}

function updateClock() {
  const now = new Date();
  const wib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const pad = (n) => String(n).padStart(2, "0");
  $("#clock").textContent = `⏰ WIB ${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}`;
}
setInterval(updateClock, 1000);
updateClock();

// ──────────────────────────────────────────────
//  NOTES
// ──────────────────────────────────────────────
function renderNotes(filter = "") {
  chrome.storage.local.get("notes", ({ notes = [] }) => {
    const list = $("#notes-list");
    let filtered = notes;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = notes.filter((n) =>
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
      );
    }
    $("#item-count").textContent = `${filtered.length} catatan`;
    if (!filtered.length) {
      list.innerHTML = '<p class="empty">Belum ada catatan.</p>';
      return;
    }
    list.innerHTML = filtered.map((n) => `
      <div class="note-card">
        <div class="card-top">
          <span class="card-title">${escHtml(n.title || "Tanpa Judul")}</span>
          <div class="card-actions">
            ${n.tag ? `<span class="tag tag-${n.tag}">${tagLabel(n.tag)}</span>` : ""}
            <button class="btn-delete" data-delete="${n.id}">🗑</button>
          </div>
        </div>
        <div class="card-body">${escHtml(n.body)}</div>
        <div class="card-meta"><span>${n.date}</span><span>${n.url ? truncUrl(n.url) : ""}</span></div>
      </div>`).join("");
    $$("[data-delete]").forEach((btn) =>
      btn.addEventListener("click", () => deleteNote(btn.dataset.delete)));
  });
}

function deleteNote(id) {
  chrome.storage.local.get("notes", ({ notes = [] }) => {
    chrome.storage.local.set({ notes: notes.filter((n) => n.id !== id) }, () => {
      showToast("Catatan dihapus");
      renderNotes($("#note-search").value);
    });
  });
}

$("#btn-add-note").addEventListener("click", () => {
  const title = $("#note-title").value.trim();
  const body = $("#note-body").value.trim();
  const tag = $("#note-tag").value;
  if (!body) { showToast("Isi catatan kosong!"); return; }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const note = {
      id: Date.now().toString(), title: title || "Catatan", body, tag,
      url: tabs[0]?.url || "",
      date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    };
    chrome.storage.local.get("notes", ({ notes = [] }) => {
      notes.unshift(note);
      chrome.storage.local.set({ notes }, () => {
        $("#note-title").value = "";
        $("#note-body").value = "";
        $("#note-tag").value = "";
        showToast("Catatan disimpan!");
        renderNotes();
      });
    });
  });
});

$("#note-search").addEventListener("input", () => renderNotes($("#note-search").value));

// ──────────────────────────────────────────────
//  EMAILS
// ──────────────────────────────────────────────
function renderEmails() {
  chrome.storage.local.get(["emailHistory", "emailHistoryDate"], (data) => {
    const today = new Date().toLocaleDateString("id-ID");
    const history = data.emailHistoryDate === today ? (data.emailHistory || []) : [];
    const hist = $("#emails-history");
    hist.innerHTML = history.length
      ? history.map((e) => `<div class="email-card">
          <span class="email-addr">${escHtml(e.email)}</span>
          <span class="email-time">${e.time}</span>
        </div>`).join("")
      : '<p class="empty">Belum ada email hari ini.</p>';
  });

  chrome.runtime.sendMessage({ type: "GET_NEXT_RESET" }, (res) => {
    if (res?.scheduledTime) {
      const wib = new Date(new Date(res.scheduledTime).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      $("#next-reset").textContent = `Reset: ${wib.toLocaleString("id-ID")}`;
    }
  });
}

$("#btn-scan-email").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "SCAN_EMAILS" }, (res) => {
      const emails = res?.emails || [];
      const found = $("#emails-found");
      if (!emails.length) { found.innerHTML = '<p class="empty">Tidak ada email ditemukan.</p>'; return; }
      found.innerHTML = emails.map((e) => `<div class="email-card">
        <span class="email-addr">${escHtml(e)}</span>
        <button class="btn-copy" data-copy="${escHtml(e)}">📋 Copy</button>
      </div>`).join("");
      found.querySelectorAll("[data-copy]").forEach((btn) =>
        btn.addEventListener("click", () => { navigator.clipboard.writeText(btn.dataset.copy); showToast("Email disalin!"); }));
      chrome.runtime.sendMessage({ type: "ADD_EMAILS", emails }, () => renderEmails());
      showToast(`${emails.length} email ditemukan`);
    });
  });
});

$("#btn-clear-emails").addEventListener("click", () => {
  chrome.storage.local.set({ emailHistory: [], emailHistoryDate: null }, () => {
    showToast("Riwayat dihapus");
    renderEmails();
  });
});

// ──────────────────────────────────────────────
//  SNIPPETS
// ──────────────────────────────────────────────
function renderSnippets(filter = "") {
  chrome.storage.local.get("snippets", ({ snippets = [] }) => {
    const list = $("#snippets-list");
    let filtered = snippets;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = snippets.filter((s) =>
        s.title.toLowerCase().includes(q) || s.lang.toLowerCase().includes(q));
    }
    if (!filtered.length) { list.innerHTML = '<p class="empty">Belum ada snippet.</p>'; return; }
    list.innerHTML = filtered.map((s) => `<div class="snip-card">
      <div class="card-top">
        <span class="card-title">${escHtml(s.title)}</span>
        <div class="card-actions">
          <span class="lang-badge">${s.lang}</span>
          <button class="btn-copy" data-copy="${escHtml(s.code)}">📋</button>
          <button class="btn-delete" data-delete="${s.id}">🗑</button>
        </div>
      </div>
      <div class="snip-code">${escHtml(s.code)}</div>
      <div class="card-meta"><span>${s.date}</span></div>
    </div>`).join("");
    list.querySelectorAll("[data-copy]").forEach((btn) =>
      btn.addEventListener("click", () => { navigator.clipboard.writeText(btn.dataset.copy); showToast("Kode disalin!"); }));
    list.querySelectorAll("[data-delete]").forEach((btn) =>
      btn.addEventListener("click", () => deleteSnippet(btn.dataset.delete)));
  });
}

function deleteSnippet(id) {
  chrome.storage.local.get("snippets", ({ snippets = [] }) => {
    chrome.storage.local.set({ snippets: snippets.filter((s) => s.id !== id) }, () => {
      showToast("Snippet dihapus");
      renderSnippets($("#snip-search").value);
    });
  });
}

$("#btn-add-snip").addEventListener("click", () => {
  const title = $("#snip-title").value.trim();
  const code = $("#snip-body").value.trim();
  const lang = $("#snip-lang").value;
  if (!code) { showToast("Kode snippet kosong!"); return; }
  const snip = {
    id: Date.now().toString(), title: title || "Snippet", code, lang,
    date: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  };
  chrome.storage.local.get("snippets", ({ snippets = [] }) => {
    snippets.unshift(snip);
    chrome.storage.local.set({ snippets }, () => {
      $("#snip-title").value = "";
      $("#snip-body").value = "";
      showToast("Snippet disimpan!");
      renderSnippets();
    });
  });
});

$("#snip-search").addEventListener("input", () => renderSnippets($("#snip-search").value));

// ──────────────────────────────────────────────
//  MEDIA GRABBER
// ──────────────────────────────────────────────
$$(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMediaFilter = btn.dataset.filter;
    renderMediaList();
  });
});

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function renderMediaList() {
  const list = $("#media-list");
  const { videos, images, audios, blobCaptures = [], mseCaptures = [], directUrls = [] } = allMediaData;

  let html = "";
  const f = currentMediaFilter;

  // ── MSE (streaming / Telegram video) captures ──
  if ((f === "all" || f === "video") && mseCaptures.length > 0) {
    html += `<div class="media-section-title">🔴 Live Stream / Telegram Video</div>`;
    html += mseCaptures.map((m) => {
      const size = fmtSize(m.totalSize);
      const ext = m.mime.includes("webm") ? "webm" : "mp4";
      return `<div class="media-card mse-card">
        <div class="media-icon">📡</div>
        <div class="media-meta">
          <span class="media-label">Video streaming terkumpul • ${size}</span>
          <span class="mse-mime">${m.mime || "video/mp4"}</span>
          <div class="media-actions">
            <button class="btn-mse-dl" data-mse-key="${escHtml(m.key)}" data-ext="${ext}">
              ⬇ Download .${ext}
            </button>
            <span class="mse-hint">Klik → kumpulkan semua chunk → download</span>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  // ── Blob captures (createObjectURL intercept) ──
  if (blobCaptures.length > 0) {
    const filtered = blobCaptures.filter((b) => {
      if (f === "all") return true;
      if (f === "video") return b.kind === "video";
      if (f === "image") return b.kind === "image";
      if (f === "audio") return b.kind === "audio";
      return true;
    });
    if (filtered.length > 0) {
      html += `<div class="media-section-title">🟢 Blob Tertangkap (Langsung Download)</div>`;
      html += filtered.map((b) => {
        const size = fmtSize(b.size);
        const icon = b.kind === "video" ? "🎬" : b.kind === "audio" ? "🎵" : "🖼️";
        return `<div class="media-card">
          <div class="media-icon">${icon}</div>
          <div class="media-meta">
            <span class="media-label">${escHtml(b.label)} ${size}</span>
            <div class="media-actions">
              <button class="btn-blob-dl" data-blob-url="${escHtml(b.blobUrl)}">⬇ Download</button>
              <button class="btn-copy" data-copy="${escHtml(b.blobUrl)}">📋 URL</button>
            </div>
          </div>
        </div>`;
      }).join("");
    }
  }

  // ── Direct CDN URLs from fetch/XHR intercept ──
  if ((f === "all" || f === "video") && directUrls.length > 0) {
    html += `<div class="media-section-title">🔗 URL CDN Terdeteksi</div>`;
    html += directUrls.map((d) => `<div class="media-card">
      <div class="media-icon">🔗</div>
      <div class="media-meta">
        <span class="media-label">${escHtml(d.label)}</span>
        <div class="media-actions">
          <button class="btn-direct-dl" data-url="${escHtml(d.url)}" data-label="${escHtml(d.label)}">⬇ Download</button>
          <button class="btn-copy" data-copy="${escHtml(d.url)}">📋 URL</button>
        </div>
      </div>
    </div>`).join("");
  }

  // ── Regular DOM media ──
  let domItems = [];
  if (f === "all" || f === "video") domItems.push(...videos.map((v) => ({ ...v, kind: "video" })));
  if (f === "all" || f === "image") domItems.push(...images.map((i) => ({ ...i, kind: "image" })));
  if (f === "all" || f === "audio") domItems.push(...audios.map((a) => ({ ...a, kind: "audio" })));

  if (domItems.length > 0) {
    const hasAbove = mseCaptures.length || blobCaptures.length || directUrls.length;
    if (hasAbove) html += `<div class="media-section-title">📋 Media di Halaman</div>`;
    html += domItems.map((item) => {
      const isBlob = item.src.startsWith("blob:");
      const safeUrl = escHtml(item.src);
      const label = escHtml((item.label || item.src).slice(0, 45));
      const downloadBtn = isBlob
        ? `<span class="blob-tag">stream</span>`
        : `<a class="btn-dl" href="${safeUrl}" download="${label}" target="_blank">⬇</a>`;

      if (item.kind === "image" && !isBlob) {
        return `<div class="media-card media-img-card">
          <div class="media-thumb-wrap">
            <img class="media-thumb" src="${safeUrl}" onerror="this.parentElement.innerHTML='🖼️'" loading="lazy"/>
          </div>
          <div class="media-meta">
            <span class="media-label">${label}</span>
            <div class="media-actions">
              <button class="btn-copy" data-copy="${safeUrl}">📋</button>
              ${downloadBtn}
            </div>
          </div>
        </div>`;
      }

      const icon = item.kind === "video" ? "🎬" : item.kind === "audio" ? "🎵" : "🖼️";
      return `<div class="media-card">
        <div class="media-icon">${icon}</div>
        <div class="media-meta">
          <span class="media-label">${label}</span>
          <div class="media-actions">
            <button class="btn-copy" data-copy="${safeUrl}">📋</button>
            ${downloadBtn}
          </div>
        </div>
      </div>`;
    }).join("");
  }

  if (!html) {
    list.innerHTML = '<p class="empty">Tidak ada media. Putar dulu videonya di halaman, lalu scan.</p>';
    return;
  }

  list.innerHTML = html;

  // Wire MSE download buttons
  list.querySelectorAll(".btn-mse-dl").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.mseKey;
      const ext = btn.dataset.ext;
      btn.textContent = "⏳ Mengumpulkan...";
      btn.disabled = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: "REQUEST_DOWNLOAD", key }, () => {});
        // Wait for the response via chrome.runtime.onMessage
      });
    });
  });

  // Wire blob download buttons
  list.querySelectorAll(".btn-blob-dl").forEach((btn) => {
    btn.addEventListener("click", () => {
      const blobUrl = btn.dataset.blobUrl;
      btn.textContent = "⏳ Mempersiapkan...";
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: "REQUEST_DOWNLOAD", blobUrl }, () => {});
      });
    });
  });

  // Wire direct CDN download buttons
  list.querySelectorAll(".btn-direct-dl").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.url;
      const label = btn.dataset.label;
      btn.textContent = "⏳ Memulai...";
      btn.disabled = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "REQUEST_DOWNLOAD",
          directUrl: url,
          filename: label
        }, () => {
          setTimeout(() => {
            btn.textContent = "⬇ Download";
            btn.disabled = false;
          }, 3000);
        });
      });
    });
  });

  // Wire copy buttons
  list.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      showToast("URL disalin!");
    });
  });
}

// Listen for download-ready messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "MEDIA_DOWNLOAD_READY") {
    const d = msg.data;
    if (d.type === "blob_ready_download" || d.type === "mse_ready_download") {
      const a = document.createElement("a");
      a.href = d.dataUrl || d.url;
      a.download = d.label || "video.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("Download dimulai!");
    }
  }
});

$("#btn-scan-media").addEventListener("click", () => {
  const btn = $("#btn-scan-media");
  btn.textContent = "⏳ Scanning...";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) { btn.textContent = "🔍 Scan Media"; btn.disabled = false; return; }

    chrome.tabs.sendMessage(tabs[0].id, { type: "SCAN_MEDIA" }, (res) => {
      btn.textContent = "🔍 Scan Media";
      btn.disabled = false;

      if (!res) { showToast("Gagal scan. Reload halaman dulu."); return; }

      allMediaData = res;
      const total = res.videos.length + res.images.length + res.audios.length +
        (res.blobCaptures?.length || 0) + (res.mseCaptures?.length || 0) + (res.directUrls?.length || 0);

      const parts = [];
      if (res.videos.length) parts.push(`${res.videos.length} vid`);
      if (res.images.length) parts.push(`${res.images.length} img`);
      if (res.audios.length) parts.push(`${res.audios.length} audio`);
      if (res.mseCaptures?.length) parts.push(`${res.mseCaptures.length} stream`);
      if (res.blobCaptures?.length) parts.push(`${res.blobCaptures.length} blob`);

      $("#media-count-text").textContent = parts.join(" · ") || "Tidak ada";
      $("#media-page-title").textContent = truncUrl(tabs[0].url || "");

      const warn = $("#blob-warning");
      if (res.hasBlob || res.mseCaptures?.length) warn.classList.remove("hidden");
      else warn.classList.add("hidden");

      if (total === 0) {
        $("#media-list").innerHTML = '<p class="empty">Tidak ada media. Putar video dulu di halaman, lalu scan kembali.</p>';
      } else {
        renderMediaList();
        showToast(`${total} media ditemukan`);
      }
    });
  });
});

// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────
function escHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function tagLabel(tag) {
  return { penting: "🔴 Penting", todo: "🟡 To-Do", coding: "🔵 Coding", info: "⚪ Info" }[tag] || tag;
}
function truncUrl(url) {
  try { return new URL(url).hostname; } catch { return String(url).slice(0, 30); }
}

// Init
renderNotes();
