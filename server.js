const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const BASE_DIR = __dirname;

// Security headers
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com 'unsafe-inline'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self' https://capable-nightingale-509.eu-west-1.convex.cloud wss://capable-nightingale-509.eu-west-1.convex.cloud",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
  ].join("; "),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  // Only serve GET requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let urlPath = req.url.split("?")[0];
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

  // Prevent path traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(BASE_DIR, safePath);

  // Ensure file is within base dir
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  // Block access to sensitive files
  const blocked = [".env", ".env.local", "package-lock.json", ".gitignore"];
  if (blocked.some((b) => filePath.endsWith(b)) || filePath.includes("/convex/")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>");
      } else {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
      return;
    }

    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  FinTrack Server running at:\n  → http://localhost:${PORT}\n`);
  console.log("  Press Ctrl+C to stop.\n");
});
