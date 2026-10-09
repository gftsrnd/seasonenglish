// Season English – dev/static server (zero dependencies, Node >= 18).
// Usage: npm run dev   (PORT, HOST and API_BASE_URL are read from .env or the environment)
// Serves the project folder; exposes /config.js with the public runtime config so the
// front-end can pick up API_BASE_URL etc. without a build step.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// minimal .env loader (no dependency): KEY=VALUE lines, # comments, no expansion
try {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  env.split(/\r?\n/).forEach(line => { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
} catch { /* no .env: defaults below */ }

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || 'localhost';
const PUBLIC_CONFIG = {
  API_BASE_URL: process.env.API_BASE_URL || '',
  APP_ENV: process.env.APP_ENV || 'development',
  ORG_NAME: process.env.ORG_NAME || 'GFT'
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.ts': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (urlPath === '/config.js') { // public runtime config (never put secrets here)
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    return res.end('window.__SEASON_CONFIG__ = ' + JSON.stringify(PUBLIC_CONFIG) + ';');
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}.env`) || file.includes(`${path.sep}node_modules${path.sep}`)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': MIME['.txt'] }); return res.end('404 Not Found: ' + urlPath); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT, HOST, () => console.log(`Season English dev server: http://${HOST}:${PORT}/  (sandbox: http://${HOST}:${PORT}/?sandbox=1)  API_BASE_URL=${PUBLIC_CONFIG.API_BASE_URL || '(none – localStorage mode)'}`));
