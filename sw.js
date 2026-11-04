// ひまつぶし工房：オフラインでも遊べるようにするための Service Worker（全ゲーム共通）
// ページ本体と設定は「通信優先（だめなら保存分）」、ライブラリとフォントは「保存分優先」で配る。
const VERSION = 'kobo-v8';
const CORE = ['./', './index.html', './firebase-config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png', './common/cloud.js', './common/i18n.js', './hole/cities.js'];
const GAMES = ['./neji/', './blocks/', './drop/', './raft/', './gates/', './n59049/', './water/', './parking/', './hole/', './ranking/'];
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];
const CACHE_FIRST_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    // each game page separately, so one missing page never blocks the install
    await Promise.all(GAMES.map(u => c.add(u).catch(() => {})));
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
