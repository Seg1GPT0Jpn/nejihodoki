// ローカルの静的サーバー（node の http だけ。ポートは OS に空いているものを選ばせる）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

// URL のパス → リポジトリの中のファイル（外に出るパスは null）
function resolveFile(urlPath, root = ROOT) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (e) { return null; }
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + p));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) { const idx = path.join(abs, 'index.html'); return fs.existsSync(idx) ? idx : null; }
    return abs;
  } catch (e) { return null; }
}
const mimeOf = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

function start(root = ROOT) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = req.url || '/';
      // ディレクトリは末尾の / へ（相対パスの ../ が正しく解決されるように）
      const raw = u.split('?')[0];
      const f = resolveFile(u, root);
      if (f && !raw.endsWith('/') && f.endsWith(path.sep + 'index.html') && !raw.endsWith('index.html')) {
        res.writeHead(301, { Location: raw + '/' + (u.includes('?') ? u.slice(u.indexOf('?')) : '') }); return res.end();
      }
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': mimeOf(f), 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ port, url: `http://127.0.0.1:${port}`, root, close: () => new Promise(r => srv.close(() => r())) });
    });
  });
}

module.exports = { start, resolveFile, mimeOf, ROOT };
