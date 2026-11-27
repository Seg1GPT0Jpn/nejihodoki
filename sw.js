// ひまつぶし工房：オフラインでも遊べるようにするための Service Worker（全ゲーム共通）
// はじめに保存するのはハブとその部品（CORE：ハブ・common/・アイコン・offline.html）だけ（Firebase Hosting の転送は1日360MB）。
// ゲームのページ・エンジン・データ（ENGINES。hole の街のデータも）・画像・three.js は、はじめて使ったときに保存する
// （ゲームのページを開いたら、そのゲームの ENGINES を裏でまとめて保存する）。一度開いたゲームは、通信なしでも遊べる。
// 開いたことのないゲームは、オフラインでは offline.html。ゲームを足すときは games.js に足すだけでよい。ページの中身を変えたら BUILD を上げる。
importScripts('common/games.js');
const REG = self.KOBO_REGISTRY || { version: 0, games: [] };
const BUILD = 141;
const PREFIX = 'kobo-v';
const VERSION = PREFIX + BUILD + '.' + REG.version;
const OFFLINE = './offline.html';
const NAV_TIMEOUT = 4000;
const CORE = ['./common/orient.js', './common/orient-shell.html', './', './index.html', OFFLINE, './firebase-config.js', './manifest.webmanifest',
  './apple-touch-icon.png', './favicon-32.png', // (the manifest icons are fetched by the browser itself when it installs; not needed offline)
  './common/cloud.js', './common/i18n.js', './common/versus.js', './common/turnroom.js', './common/games.js', './common/platform.js', './common/achievements.js', './common/rank.js',
  './common/game.js', './common/audio.js', './common/ui.js', './common/theme.css', './common/ui.css',
  './common/studyguard.js', './common/friends.js', './common/account.js', './common/news.js', './common/news.json'];
// ゲームのページが読み込む、登録簿にないファイル（エンジン・データ）
const ENGINES = ['./puff/engine.js', './puff/levels.js', './puff/art.js', './puff/overworld.js', './sports/core.js', './sports/island.js', './sports/sim1.js', './sports/sim2.js', './sports/art.js', './sports/venues1.js', './sports/venues2.js', './sports/venues3.js', './sports/golf.js', './sports/venue-golf.js', './sports/world.js', './sports/air.js', './sports/gl.js', './sports/fly.js', './galaxy/engine.js', './galaxy/levels.js', './galaxy/gl.js', './galaxy/art.js','./wordwolf/engine.js', './wordwolf/words.js', './wordwolf/online.js', './trade/engine.js', './trade/en.js', './blocks/engine.js', './drop/engine.js', './raft/engine.js', './gates/engine.js', './n59049/engine.js', './train/engine.js', './train/art.js', './orchestra/midi.js', './orchestra/joycon.js', './orchestra/engine.js', './orchestra/concert.js', './orchestra/contest.js','./orchestra/sampler.js', './orchestra/art.js', './brawl/kits.js', './brawl/story.js', './brawl/engine.js', './brawl/art.js', './brawl/netcode.js', './brawl/online.js', './colorcards/engine.js', './colorcards/art.js', './colorcards/online.js', './reversi/engine.js', './reversi/art.js', './reversi/puzzles.js', './reversi/online.js', './gomoku/engine.js', './gomoku/art.js', './gomoku/puzzles.js', './gomoku/online.js', './sudoku/engine.js', './hop/engine.js', './hop/levels.js', './hop/art.js', './hop/gen.js', './hop/overworld.js', './hop/validate.js', './hop/editor.js', './maze/engine.js', './maze/art.js', './shmup/stages.js', './shmup/engine.js', './shmup/bot.js', './shmup/art.js', './invade/levels.js', './invade/engine.js', './invade/bot.js', './invade/art.js', './fishing/fish.js', './fishing/engine.js', './fishing/art.js', './mahjong/engine.js', './mahjong/ai.js', './mahjong/art.js', './mahjong/text.js', './mahjong/online.js', './mahjong/app.js', './akin/engine.js', './akin/data/animals.js', './akin/data/foods.js', './akin/data/sports.js', './akin/data/countries.js', './akin/data/jobs.js', './akin/data/things.js', './akin/app.js','./chess/engine.js', './chess/ai.js', './chess/art.js', './chess/puzzles.js', './chess/online.js','./crates/engine.js', './crates/art.js', './crates/levels.js', './crates/editor.js', './manabi/en.js', './manabi/engine.js', './manabi/gen.js', './manabi/gen2.js', './manabi/dialogue.js', './manabi/fx.js', './manabi/app.js', './town/engine.js', './town/art.js', './fit/engine.js', './cards/engine.js', './cards/solitaire.js', './cards/art.js', './parking/engine.js', './planet/sim.js', './planet/world.js', './planet/explorer.js', './planet/learn.js', './water/engine.js', './shogi/engine.js', './shogi/puzzles.js', './escape/art.js', './escape/room1.js', './escape/room2.js', './escape/room3.js', './escape/room4.js', './escape/room5.js', './escape/room6.js', './escape/engine.js', './td/engine.js', './td/art.js', './physics/engine.js', './physics/levels.js', './physics/art.js', './physics/codec.js', './physics/editor.js', './minigolf/engine.js', './minigolf/holes-gen.js', './minigolf/holes.js', './minigolf/art.js', './hole/cities.js', './hole/realcity.js', './hole/engine.js', './hitsumabushi/engine.js', './hitblow/engine.js',
  './hole/cities/fujisawa.json', './hole/cities/shonandai.json', './hole/cities/kamiooka.json', './hole/cities/shonanhs.json',
  './hole/cities/shibuya.json', './hole/cities/asakusa.json', './hole/cities/shinjuku.json', './hole/cities/yokohama.json', './hole/cities/dotonbori.json', './hole/cities/osakajo.json', './hole/cities/kyoto.json', './hole/cities/nagoya.json', './hole/cities/sapporo.json', './hole/cities/fukuoka.json'];
// ページ（オフラインで開けるのは、一度開いたものだけ）
const PAGES = REG.games.map(g => './' + g.path).concat(['./ranking/', './about/', './profile/']);
const CACHE_FIRST_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const SCOPE = self.registration.scope;
// まなびの工房の問題（data/ 約16MB と content/）は、はじめに保存しない。使った分だけ、保存した写しを先に返して、裏で確かめ直す
const STALE_OK = ['manabi/data/', 'manabi/content/'];
// 指揮者ゲームの音（samples/ 約11MB）と曲（scores/*.json）は、はじめに保存しない。URL に ?b=<ビルド番号> が付くので、中身が変わると URL も変わる＝保存した写しを先に返してよい（使った分だけ端末に残る）。
// samples/bank.json と scores/index.json（?b= なし）は、いつもの「通信を先に、だめなら写し」（番号はこの2つが決める）
const IMMUTABLE = ['orchestra/samples/', 'orchestra/scores/'];
const isImmutable = url => url.searchParams.has('b') && !/\/(bank|index)\.json$/.test(url.pathname) && IMMUTABLE.some(p => url.pathname.startsWith(new URL(p, SCOPE).pathname));

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
        if (isImmutable(new URL(req.url))) r = await oc.match(req); // 番号つきの音・曲は変わらない：写しをそのまま移す（11MB を取り直さない）
        else if (sameSite(req.url)) r = await fetch(fresh(req.url)).then(x => (x.ok ? clean(x) : null), () => null);
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
// saved copy first, checked again in the background (the next open gets the new one); the first time (or after the saved copy is gone) it is the network
async function staleWhileRevalidate(e, req) {
  const c = await caches.open(VERSION);
  const net = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net.catch(() => Response.error());
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
    if (req.mode !== 'navigate' && isImmutable(url)) { e.respondWith(cacheFirst(req)); return; }
    if (req.mode !== 'navigate' && STALE_OK.some(p => url.pathname.startsWith(new URL(p, SCOPE).pathname))) e.respondWith(staleWhileRevalidate(e, req));
    else e.respondWith(req.mode === 'navigate' ? navigate(e, url) : sameOrigin(req));
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    // versioned libraries and fonts never change: saved copy first
    e.respondWith(cacheFirst(req));
  }
  // everything else (Google sign-in, Firestore, Realtime Database, identitytoolkit) goes straight to the network
});
