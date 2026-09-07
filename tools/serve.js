// Minimal static file server for local testing. No dependencies.
// Usage: node tools/serve.js [port]                 (serves the repo root over http)
//        node tools/serve.js [port] cert.pem key.pem (the same over https, for
//        browsers that only run the web export in a secure context)
// Needed because browsers refuse to load .wasm from file:// URLs.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2]) || 8060;
const tls = process.argv[3] && process.argv[4] ? { cert: fs.readFileSync(process.argv[3]), key: fs.readFileSync(process.argv[4]) } : null;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const handler = (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404 " + p); }
    // The judge runs in a sandboxed iframe (opaque origin), so its requests count as
    // cross-origin and need this header. GitHub Pages sends it too.
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
    res.end(data);
  });
};
(tls ? https.createServer(tls, handler) : http.createServer(handler)).listen(port, () => console.log(`serving ${root} at ${tls ? "https" : "http"}://localhost:${port}/`));
