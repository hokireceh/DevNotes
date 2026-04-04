const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5000;

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json"
};

// ── Real-time log storage (in-memory, last 500 entries) ──
const logBuffer = [];
const MAX_LOGS = 500;
const sseClients = new Set();

function addLog(entry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  const data = JSON.stringify(entry);
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch {}
  }
  // Print to Replit console with color
  const lvlColor = { INFO: "\x1b[36m", WARN: "\x1b[33m", ERROR: "\x1b[31m", OK: "\x1b[32m", DEBUG: "\x1b[35m" };
  const c = lvlColor[entry.level] || "\x1b[37m";
  const reset = "\x1b[0m";
  const ts = new Date(entry.ts).toLocaleTimeString("id-ID");
  console.log(`${c}[${ts}] [${entry.level}] ${entry.tag || "EXT"}${reset} ${entry.msg}${entry.data ? " " + JSON.stringify(entry.data) : ""}`);
}

const server = http.createServer((req, res) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  let urlPath = req.url.split("?")[0];

  // ── POST /log — receive debug logs from extension ──
  if (req.method === "POST" && urlPath === "/log") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const entries = JSON.parse(body);
        const list = Array.isArray(entries) ? entries : [entries];
        list.forEach(e => addLog({ ts: Date.now(), ...e }));
        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, corsHeaders);
        res.end("Bad JSON");
      }
    });
    return;
  }

  // ── GET /logs — SSE stream for real-time logs ──
  if (req.method === "GET" && urlPath === "/logs-stream") {
    res.writeHead(200, {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    // Send existing buffer first
    for (const e of logBuffer) {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    }
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // ── GET /logs-data — return all logs as JSON ──
  if (req.method === "GET" && urlPath === "/logs-data") {
    res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify(logBuffer));
    return;
  }

  // ── GET /logs — log viewer UI ──
  if (req.method === "GET" && urlPath === "/logs") {
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>DevNotes Debug Logs</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0a0a16; color:#c4b5fd; font-family:'Consolas','Courier New',monospace; font-size:13px; }
    header { background:#12122a; border-bottom:1px solid #7c3aed; padding:12px 20px; display:flex; align-items:center; gap:12px; }
    header h1 { font-size:16px; color:#a78bfa; }
    .badge { background:#7c3aed; color:#fff; border-radius:4px; padding:2px 8px; font-size:11px; }
    .controls { margin-left:auto; display:flex; gap:8px; }
    button { background:#1e1e3f; color:#a78bfa; border:1px solid #7c3aed; border-radius:4px; padding:4px 12px; cursor:pointer; font-size:12px; }
    button:hover { background:#7c3aed; color:#fff; }
    #log-container { height:calc(100vh - 54px); overflow-y:auto; padding:10px; }
    .log-entry { display:flex; gap:10px; padding:4px 6px; border-radius:4px; margin-bottom:2px; border-left:3px solid transparent; }
    .log-entry:hover { background:rgba(124,58,237,0.08); }
    .log-INFO  { border-color:#60a5fa; }
    .log-OK    { border-color:#34d399; }
    .log-WARN  { border-color:#fbbf24; }
    .log-ERROR { border-color:#f87171; }
    .log-DEBUG { border-color:#a78bfa; }
    .ts  { color:#4a4a7a; min-width:80px; }
    .lvl { min-width:46px; font-weight:bold; }
    .lvl-INFO  { color:#60a5fa; }
    .lvl-OK    { color:#34d399; }
    .lvl-WARN  { color:#fbbf24; }
    .lvl-ERROR { color:#f87171; }
    .lvl-DEBUG { color:#a78bfa; }
    .tag { color:#7c3aed; min-width:90px; }
    .msg { color:#e2e8f0; flex:1; word-break:break-all; }
    .data { color:#64748b; font-size:11px; margin-top:2px; }
    #count { font-size:12px; color:#7c3aed; }
    .filter-bar { padding:8px 20px; background:#0d0d20; border-bottom:1px solid #1e1e3f; display:flex; gap:8px; align-items:center; }
    .filter-bar input { background:#1e1e3f; border:1px solid #7c3aed; color:#c4b5fd; border-radius:4px; padding:4px 10px; font-size:12px; width:200px; }
    .filter-bar select { background:#1e1e3f; border:1px solid #7c3aed; color:#c4b5fd; border-radius:4px; padding:4px 8px; font-size:12px; }
    #status { font-size:11px; color:#34d399; }
  </style>
</head>
<body>
<header>
  <h1>🔍 DevNotes Debug Logs</h1>
  <span class="badge" id="count">0 logs</span>
  <span id="status">⏳ Connecting...</span>
  <div class="controls">
    <button onclick="clearLogs()">🗑 Clear</button>
    <button onclick="toggleScroll()">📌 Auto-scroll: <span id="scroll-state">ON</span></button>
  </div>
</header>
<div class="filter-bar">
  <input id="filter-text" placeholder="🔍 Filter pesan..." oninput="renderLogs()"/>
  <select id="filter-level" onchange="renderLogs()">
    <option value="">Semua Level</option>
    <option value="INFO">INFO</option>
    <option value="OK">OK</option>
    <option value="WARN">WARN</option>
    <option value="ERROR">ERROR</option>
    <option value="DEBUG">DEBUG</option>
  </select>
  <select id="filter-tag" onchange="renderLogs()">
    <option value="">Semua Tag</option>
  </select>
</div>
<div id="log-container"></div>
<script>
  let logs = [], autoScroll = true, knownTags = new Set();

  function pad(n){ return String(n).padStart(2,'0'); }
  function fmtTs(ts){
    const d = new Date(ts);
    return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'.'+String(d.getMilliseconds()).padStart(3,'0');
  }

  function addLog(e){
    logs.push(e);
    if(e.tag && !knownTags.has(e.tag)){
      knownTags.add(e.tag);
      const sel = document.getElementById('filter-tag');
      const opt = document.createElement('option');
      opt.value = e.tag; opt.textContent = e.tag;
      sel.appendChild(opt);
    }
    renderLogs();
  }

  function renderLogs(){
    const txt = document.getElementById('filter-text').value.toLowerCase();
    const lvl = document.getElementById('filter-level').value;
    const tag = document.getElementById('filter-tag').value;
    const filtered = logs.filter(e =>
      (!lvl || e.level === lvl) &&
      (!tag || e.tag === tag) &&
      (!txt || (e.msg||'').toLowerCase().includes(txt) || JSON.stringify(e.data||'').toLowerCase().includes(txt))
    );
    document.getElementById('count').textContent = filtered.length + ' / ' + logs.length + ' logs';
    const c = document.getElementById('log-container');
    c.innerHTML = filtered.map(e => \`
      <div class="log-entry log-\${e.level}">
        <span class="ts">\${fmtTs(e.ts)}</span>
        <span class="lvl lvl-\${e.level}">\${e.level}</span>
        <span class="tag">\${e.tag||''}</span>
        <span class="msg">\${escHtml(e.msg)}\${e.data ? '<div class="data">'+escHtml(JSON.stringify(e.data))+'</div>' : ''}</span>
      </div>\`).join('');
    if(autoScroll) c.scrollTop = c.scrollHeight;
  }

  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function clearLogs(){ logs=[]; renderLogs(); }
  function toggleScroll(){
    autoScroll = !autoScroll;
    document.getElementById('scroll-state').textContent = autoScroll ? 'ON' : 'OFF';
  }

  // Load existing logs
  fetch('/logs-data').then(r=>r.json()).then(data=>{ data.forEach(addLog); });

  // SSE for real-time
  const evtSrc = new EventSource('/logs-stream');
  evtSrc.onopen = () => { document.getElementById('status').textContent = '🟢 Live'; };
  evtSrc.onerror = () => { document.getElementById('status').textContent = '🔴 Disconnected'; };
  evtSrc.onmessage = (e) => { addLog(JSON.parse(e.data)); };
</script>
</body>
</html>`;
    res.writeHead(200, { ...corsHeaders, "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  // ── Static file serving ──
  if (urlPath === "/") urlPath = "/preview.html";

  if (urlPath === "/download") {
    const file = path.join(__dirname, "devnotes-pro-extension.tar.gz");
    if (fs.existsSync(file)) {
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/gzip",
        "Content-Disposition": 'attachment; filename="devnotes-pro-extension.tar.gz"'
      });
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404, corsHeaders);
      res.end("File not found");
    }
    return;
  }

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
    const ext = path.extname(filePath);
    const mime = mimeTypes[ext] || "text/plain";
    res.writeHead(200, { ...corsHeaders, "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\x1b[32mPreview server running on port ${PORT}\x1b[0m`);
  console.log(`\x1b[36mDebug log viewer: http://localhost:${PORT}/logs\x1b[0m`);
});
