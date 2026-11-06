// ひまつぶし工房：オフラインでも遊べるようにするための Service Worker（全ゲーム共通）
// はじめに保存するのはハブとその部品（CORE：ハブ・common/・アイコン・offline.html）だけ（Firebase Hosting の転送は1日360MB）。
// ゲームのページ・エンジン・データ（ENGINES。hole の街のデータも）・画像・three.js は、はじめて使ったときに保存する
// （ゲームのページを開いたら、そのゲームの ENGINES を裏でまとめて保存する）。一度開いたゲームは、通信なしでも遊べる。
// 開いたことのないゲームは、オフラインでは offline.html。ゲームを足すときは games.js に足すだけでよい。ページの中身を変えたら BUILD を上げる。
importScripts('common/games.js');
const REG = self.KOBO_REGISTRY || { version: 0, games: [] };
const BUILD = 41;
const PREFIX = 'kobo-v';
const VERSION = PREFIX + BUILD + '.' + REG.version;
const OFFLINE = './offline.html';
const NAV_TIMEOUT = 4000;
const CORE = ['./', './index.html', OFFLINE, './firebase-config.js', './manifest.webmanifest',
  './apple-touch-icon.png', './favicon-32.png', // (the manifest icons are fetched by the browser itself when it installs; not needed offline)
  './common/cloud.js', './common/i18n.js', './common/versus.js', './common/games.js', './common/platform.js', './common/achievements.js', './common/rank.js',
  './common/game.js', './common/audio.js', './common/ui.js', './common/theme.css', './common/ui.css',
  './common/friends.js', './common/account.js', './common/news.js', './common/news.json'];
// ゲームのページが読み込む、登録簿にないファイル（エンジン・データ）
const ENGINES = ['./parking/engine.js', './water/engine.js', './shogi/engine.js', './escape/art.js', './escape/room1.js', './escape/room2.js', './escape/room3.js', './escape/room4.js', './escape/room5.js', './td/engine.js', './td/art.js', './physics/engine.js', './physics/levels.js', './physics/art.js', './physics/codec.js', './physics/editor.js', './minigolf/engine.js', './minigolf/holes.js', './minigolf/art.js', './hole/cities.js', './hole/realcity.js',
  './hole/cities/fujisawa.json', './hole/cities/shonandai.json', './hole/cities/kamiooka.json', './hole/cities/shonanhs.json',
  './hole/cities/shibuya.json', './hole/cities/asakusa.json', './hole/cities/shinjuku.json', './hole/cities/yokohama.json', './hole/cities/dotonbori.json', './hole/cities/osakajo.json', './hole/cities/kyoto.json', './hole/cities/nagoya.json', './hole/cities/sapporo.json', './hole/cities/fukuoka.json'];
// ページ（オフラインで開けるのは、一度開いたものだけ）
const PAGES = REG.games.map(g => './' + g.path).concat(['./ranking/', './about/', './profile/']);
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

// ゲームのフォルダ（'hole/' など）→ そのゲームが使う ENGINES
const GAME_DIRS = REG.games.map(g => g.path);
const enginesOf = dir => ENGINES.filter(u => u.startsWith('./' + dir));
const sameSite = u => u.startsWith(SCOPE);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE.map(fresh));
    // the first install takes over right away. An update waits until a page asks for it (the update toast)
    if (!self.registration.active) await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (err) {} }
    const c = await caches.open(VERSION);
    const old = (await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== VERSION);
    // what was saved on first use (games already opened) moves to the new version: this site's files are checked again
    // ('no-cache': 304 when unchanged), versioned libraries and fonts are copied. Offline: the old copy is kept
    for (const k of old) {
      const oc = await caches.open(k);
      for (const req of await oc.keys()) {
        if (await c.match(req)) continue;
        let r = null;
        if (sameSite(req.url)) r = await fetch(fresh(req.url)).then(x => (x.ok ? clean(x) : null), () => null);
        if (!r) r = await oc.match(req);
        if (r) await c.put(req, r).catch(() => {});
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});
// the first time a game page opens: save all of that game's ENGINES (hole: every city, so any room works offline)
async function warmGame(dir) {
  await new Promise(r => setTimeout(r, 3000)); // after the page's own requests (no file is downloaded twice)
  const c = await caches.open(VERSION);
  await Promise.all(enginesOf(dir).map(async u => { if (!(await c.match(u))) await c.add(fresh(u)).catch(() => {}); }));
}
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
  const dir = GAME_DIRS.find(d => key === SCOPE + d || key === SCOPE + d + 'index.html');
  const net = (async () => {
    const pre = e.preloadResponse ? await e.preloadResponse.catch(() => null) : null;
    const r = pre || await fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (r.ok) {
      const k = await clean(r.clone()); await c.put(key, k);
      if (dir && enginesOf(dir).length) e.waitUntil(warmGame(dir));
    }
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
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // offline, an image never shown online (a thumbnail further down the hub): an empty picture instead of a broken one
    if (req.destination === 'image') return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    return Response.error();
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
