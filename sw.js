// ひまつぶし工房：オフラインでも遊べるようにするための Service Worker（全ゲーム共通）
// 保存する一覧は、ゲームの登録簿（common/games.js）から作る：各ゲームのページ・サムネイル・アイコン。
// ゲームを足すときは games.js に足すだけでよい（ここは直さない）。ページの中身を変えたら BUILD を上げる。
//
// 配りかた：
//   ページ（navigate）  通信優先。ナビゲーションのプリロードを使い、4秒待っても返らず保存分があれば保存分を出す（裏で更新は続ける）。
//                       通信できず保存分もなければ offline.html（日本語／英語）。?code= などの検索部分は保存のキーに入れない。
//   同じサイトのファイル 通信優先（HTTP キャッシュは「確かめてから使う」）。だめなら保存分。
//   ライブラリとフォント 保存分優先（版の決まった URL なので変わらない）。
//   Firebase などの API、/__/（Firebase Hosting の予約 URL）、ほかのサイト：さわらない（保存しない）。
// 更新：初めての登録はすぐ有効にする。新しい版は「待機」にして、ページの「新しいバージョンがあります — 更新」
//   （common/ui.js）が押されたときだけ入れ替える（遊んでいる途中で勝手に読み込み直さない）。
// 片付け：有効になったら、自分の名前（kobo-v）で始まる古い保存だけを消す（github.io は同じ origin にほかのサイトもある）。
importScripts('common/games.js');
const REG = self.KOBO_REGISTRY || { version: 0, games: [] };
const BUILD = 40;
const PREFIX = 'kobo-v';
const VERSION = PREFIX + BUILD + '.' + REG.version;
const OFFLINE = './offline.html';
const NAV_TIMEOUT = 4000;
const CORE = ['./', './index.html', OFFLINE, './firebase-config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png',
  './common/cloud.js', './common/i18n.js', './common/versus.js', './common/games.js', './common/platform.js', './common/achievements.js', './common/rank.js',
  './common/game.js', './common/audio.js', './common/ui.js', './common/theme.css', './common/ui.css',
  './common/friends.js', './common/account.js', './common/news.js', './common/news.json'];
// ゲームのページが読み込む、登録簿にないファイル（エンジン・データ）
const ENGINES = ['./parking/engine.js', './water/engine.js', './shogi/engine.js', './escape/art.js', './escape/room1.js', './escape/room2.js', './escape/room3.js', './escape/room4.js', './escape/room5.js', './td/engine.js', './td/art.js', './physics/engine.js', './physics/levels.js', './physics/art.js', './physics/codec.js', './physics/editor.js', './minigolf/engine.js', './minigolf/holes.js', './minigolf/art.js', './hole/cities.js', './hole/realcity.js',
  './hole/cities/fujisawa.json', './hole/cities/shonandai.json', './hole/cities/kamiooka.json', './hole/cities/shonanhs.json',
  './hole/cities/shibuya.json', './hole/cities/asakusa.json', './hole/cities/shinjuku.json', './hole/cities/yokohama.json', './hole/cities/dotonbori.json', './hole/cities/osakajo.json', './hole/cities/kyoto.json', './hole/cities/nagoya.json', './hole/cities/sapporo.json', './hole/cities/fukuoka.json'];
const PAGES = REG.games.map(g => './' + g.path).concat(['./ranking/', './about/', './profile/']);
const IMAGES = [].concat(...REG.games.map(g => [g.thumb, g.thumb2x, g.icon].filter(Boolean).map(p => './' + p)))
  .concat(['./img/icons/neji-96.png', './img/icons/blocks-96.png', './img/icons/hole-96.png', './img/icons/shogi-96.png']);
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];
const CACHE_FIRST_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const SCOPE = self.registration.scope;

// 'no-cache'：HTTP キャッシュの写しを、サーバーに確かめてから使う（変わっていなければ 304 で、ほとんど転送しない）
const fresh = u => new Request(u, { cache: 'no-cache' });
const pageKey = url => url.origin + url.pathname; // ページは検索部分（?daily・?code=…）を除いて1件だけ保存する
// リダイレクトのあとの応答は、そのままではナビゲーションに返せない（redirected のしるしを外して保存する）
async function clean(r) {
  if (!r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE.map(fresh));
    // each page / file separately, so one missing file never blocks the install
    await Promise.all(PAGES.concat(ENGINES, IMAGES).map(u => c.add(fresh(u)).catch(() => {})));
    // versioned libraries: reuse the copy of the previous version instead of downloading it again
    await Promise.all(LIBS.map(async u => {
      const old = await caches.match(u).catch(() => null);
      if (old) return c.put(u, old);
      const r = await fetch(u, { mode: 'cors' }).catch(() => null);
      if (r && r.ok) await c.put(u, r);
    }));
    // the first install takes over right away. An update waits until a page asks for it (the update toast)
    if (!self.registration.active) await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (err) {} }
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

async function offlinePage(c) {
  const r = await c.match(OFFLINE);
  if (!r) return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  // links on the offline page point at this site's top (the page is shown under any URL)
  const html = (await r.text()).split('%SCOPE%').join(SCOPE);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function navigate(e, url) {
  const c = await caches.open(VERSION);
  const key = pageKey(url);
  const net = (async () => {
    const pre = e.preloadResponse ? await e.preloadResponse.catch(() => null) : null;
    const r = pre || await fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (r.ok) { const k = await clean(r.clone()); await c.put(key, k); }
    return r;
  })();
  e.waitUntil(net.catch(() => {}));
  const saved = await c.match(key, { ignoreSearch: true });
  try {
    if (!saved) return await net;
    // slow network ("lie-fi"): the saved copy after a few seconds; the network copy still updates the cache
    return await Promise.race([net, new Promise(res => setTimeout(() => res(saved), NAV_TIMEOUT))]);
  } catch (err) {
    return saved || offlinePage(c);
  }
}
async function sameOrigin(req) {
  const c = await caches.open(VERSION);
  try {
    // bypass the browser's HTTP cache without a check, so a new version shows up on the next open
    const r = await fetch(req, { cache: 'no-cache' });
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || Response.error();
  }
}
async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') c.put(req, r.clone());
    return r;
  } catch (err) {
    // offline and this page's font was never saved: no web font (the system font is used), not a failed stylesheet
    if (new URL(req.url).hostname === 'fonts.googleapis.com') return new Response('/* offline */', { headers: { 'Content-Type': 'text/css' } });
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // outside this site's folder, and Firebase Hosting's reserved URLs (/__/auth/…): the network, never the cache
    if (!req.url.startsWith(SCOPE) || url.pathname.includes('/__/')) return;
    e.respondWith(req.mode === 'navigate' ? navigate(e, url) : sameOrigin(req));
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    // versioned libraries and fonts never change: saved copy first
    e.respondWith(cacheFirst(req));
  }
  // everything else (Google sign-in, Firestore, Realtime Database, identitytoolkit) goes straight to the network
});
