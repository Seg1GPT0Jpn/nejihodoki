// 本番の origin（https://neji-5913a.web.app）へのリクエストを page.route で受けて、手元のファイルを返す（TEST_PLAN.md 5章）。
// これで cloud.js（https のときだけ動く）を手元のコードのまま動かせる。
'use strict';
const fs = require('fs');
const { resolveFile, mimeOf } = require('./server');

const ORIGIN = 'https://neji-5913a.web.app';

async function serveLocal(route, root) {
  const u = new URL(route.request().url());
  const f = resolveFile(u.pathname, root);
  if (!f) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  if (!u.pathname.endsWith('/') && f.endsWith('/index.html') && !u.pathname.endsWith('index.html'))
    return route.fulfill({ status: 301, headers: { Location: u.pathname + '/' + u.search } });
  return route.fulfill({ status: 200, contentType: mimeOf(f), body: fs.readFileSync(f), headers: { 'Cache-Control': 'no-store' } });
}

module.exports = { ORIGIN, serveLocal, isOrigin: url => url.startsWith(ORIGIN + '/') || url === ORIGIN };
