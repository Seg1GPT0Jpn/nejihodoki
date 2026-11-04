// ひまつぶし工房：オフラインでも遊べるようにするための Service Worker（全ゲーム共通）
// ページ本体と設定は「通信優先（だめなら保存分）」、ライブラリとフォントは「保存分優先」で配る。
// 保存する一覧は、ゲームの登録簿（common/games.js）から作る：各ゲームのページ・サムネイル・アイコン。
// ゲームを足すときは games.js に足すだけでよい（ここは直さない）。ページの中身を変えたら BUILD を上げる。
importScripts('common/games.js');
const REG = self.KOBO_REGISTRY || { version: 0, games: [] };
const BUILD = 30;
const VERSION = 'kobo-v' + BUILD + '.' + REG.version;
const CORE = ['./', './index.html', './firebase-config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png',
  './common/cloud.js', './common/i18n.js', './common/versus.js', './common/games.js', './common/platform.js', './common/achievements.js', './common/rank.js',
  './common/game.js', './common/audio.js', './common/ui.js', './common/theme.css', './common/ui.css',
  './common/friends.js', './common/account.js', './common/news.js', './common/news.json'];
// ゲームのページが読み込む、登録簿にないファイル（エンジン・データ）
const ENGINES = ['./parking/engine.js', './water/engine.js', './hole/cities.js', './hole/realcity.js',
  './hole/cities/fujisawa.json', './hole/cities/shonandai.json', './hole/cities/kamiooka.json', './hole/cities/shonanhs.json',
  './hole/cities/shibuya.json', './hole/cities/asakusa.json', './hole/cities/shinjuku.json', './hole/cities/yokohama.json', './hole/cities/dotonbori.json', './hole/cities/osakajo.json', './hole/cities/kyoto.json', './hole/cities/nagoya.json', './hole/cities/sapporo.json', './hole/cities/fukuoka.json'];
const PAGES = REG.games.map(g => './' + g.path).concat(['./ranking/', './about/', './profile/']);
const IMAGES = [].concat(...REG.games.map(g => [g.thumb, g.thumb2x, g.icon].filter(Boolean).map(p => './' + p)));
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];
const CACHE_FIRST_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    // each page / file separately, so one missing file never blocks the install
    await Promise.all(PAGES.concat(ENGINES, IMAGES).map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // page and config: network first so updates arrive; fall back to the saved copy offline
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        // bypass the browser's HTTP cache so a new version shows up on the next open
        const r = await fetch(req, { cache: 'no-cache' });
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? (await c.match(new URL('./', location).href)) : Response.error());
      }
    })());
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    // versioned libraries and fonts never change: saved copy first
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') c.put(req, r.clone());
      return r;
    })());
  }
  // everything else (Google login, Firestore) goes straight to the network
});
