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

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/preview.html" : req.url;
  let filePath;

  // Special route: download the extension as tar.gz
  if (urlPath === "/download") {
    const file = path.join(__dirname, "devnotes-pro-extension.tar.gz");
    if (fs.existsSync(file)) {
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": 'attachment; filename="devnotes-pro-extension.tar.gz"'
      });
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404);
      res.end("File not found");
    }
    return;
  }

  if (urlPath.startsWith("/ext/")) {
    filePath = path.join(__dirname, "chrome-extension", urlPath.slice(5));
  } else {
    filePath = path.join(__dirname, urlPath);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found: " + urlPath);
      return;
    }

    const ext = path.extname(filePath);
    const mime = mimeTypes[ext] || "text/plain";
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Preview server running on port ${PORT}`);
});
