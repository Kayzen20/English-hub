// EnglishHub — server biasa (lokal, Docker, Render, VPS). Untuk Vercel lihat api/[...path].js
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { makeApp } = require('./lib/factory');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const app = makeApp();

function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 10240) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('json')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, url) {
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(buf);
  });
}
const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readJson(req) : {};
      const ip = (process.env.TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress || 'x';
      const r = await app({ method: req.method, path: url.pathname, headers: req.headers, body, ip });
      return json(res, r.status, r.json);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    const bad = e.message === 'json' || e.message === 'big';
    json(res, bad ? 400 : 500, { error: bad ? 'Permintaan tidak valid.' : 'Kesalahan server.' });
    if (!bad) console.error(e);
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`EnglishHub berjalan di http://localhost:${PORT}`));
module.exports = server;
