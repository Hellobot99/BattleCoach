// Production server: the built page from dist/ plus the JSON API on /api. Run `npm run build`, then `npm start`.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, send } from './api.mjs';

const PORT = Number(process.env.PORT || 3000);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing: run `npm run build` first.');
  process.exit(1);
}

function serveFile(res, file) {
  const type = TYPES[extname(file)] || 'application/octet-stream';
  // hashed build assets never change; the page itself must always be fresh
  const cache = file.includes(`${DIST}assets`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    req.url = req.url.slice(4) || '/';
    handle(req, res).catch(err => {
      console.error('[api]', err);
      send(res, 400, { error: err.message || String(err) });
    });
    return;
  }
  // static files; anything else falls back to the page (single-page app)
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, path);
  if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) return serveFile(res, file);
  if (/\.(mp3|ogg|wav)$/.test(path)) {
    // optional jingles that were not provided: a clean 404 lets the page fall back
    res.writeHead(404).end();
    return;
  }
  serveFile(res, join(DIST, 'index.html'));
});

server.listen(PORT, () => console.log(`Battle Coach on http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
